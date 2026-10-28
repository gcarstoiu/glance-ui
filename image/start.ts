// The all-in-one container's entry point (ADR-0024): one container runs the editor, your Glance, the preview Glance and
// the Docker gate. Started as root; the editor runs as PUID:PGID (Unraid's appdata owner, 99:100, by default) and
// never reaches the Docker socket. Glance keeps the socket for its Docker containers widget, as in its own image.
//
// Everything lives in one mounted folder, /data:
//   config/glance.yml   your dashboard (the editor writes it on Save; Glance reloads it)
//   config/.env         optional values for your ${VAR}s, for Glance only (ADR-0025; the container's own win)
//   assets/             Glance's assets folder (icons, backgrounds), served by Glance under /assets/
//   editor/             the editor's versions and settings
//   preview/glance.yml  the preview Glance's config (only the editor writes it)
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { lchown, lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { dockerGate } from "./docker-gate.ts";
import { parseDotenv } from "./dotenv.ts";

const DATA = process.env.DATA_DIR || "/data";
const GLANCE = process.env.GLANCE_BIN || "/usr/local/bin/glance";
const SOCKET = "/var/run/docker.sock";
const PREVIEW_PORT = 47801; // loopback only: the editor serves the preview under /preview (ADR-0019)
const GATE_PORT = 47802; // loopback only
const EDITOR_PORT = process.env.PORT || "3000";
const uid = Number(process.env.PUID ?? 99);
const gid = Number(process.env.PGID ?? 100);

const paths = {
  config: join(DATA, "config", "glance.yml"),
  assets: join(DATA, "assets"),
  editor: join(DATA, "editor"),
  preview: join(DATA, "preview", "glance.yml"),
  env: join(DATA, "config", ".env"),
};

// Settings the editor gets. Nothing else from the container's environment reaches it: variables you add for your
// ${VAR}s are for Glance, which substitutes them (the editor stores placeholders literally and never needs them).
const PASS_TO_EDITOR = ["PATH", "TZ", "NODE_ENV", "GLANCE_VERSION", "BODY_SIZE_LIMIT", "HOST", "ORIGIN",
  "PROTOCOL_HEADER", "HOST_HEADER", "PORT_HEADER", "ADDRESS_HEADER", "XFF_DEPTH"];

function log(msg: string): void {
  console.log(`[start] ${msg}`);
}

function prefixed(child: ChildProcess, name: string): void {
  for (const stream of [child.stdout, child.stderr]) {
    if (stream) createInterface({ input: stream }).on("line", (l) => console.log(`[${name}] ${l}`));
  }
}

/** Gives the folder tree to PUID:PGID where it isn't already (copied-in files are often root's). */
async function own(path: string): Promise<void> {
  const s = await lstat(path);
  if (s.uid !== uid || s.gid !== gid) await lchown(path, uid, gid);
  if (s.isDirectory()) for (const e of await readdir(path)) await own(join(path, e));
}

/** Glance's environment: config/.env under the container's own variables, which win (ADR-0025). Read at each start. */
function glanceEnv(): NodeJS.ProcessEnv {
  let file: Record<string, string> = {};
  try {
    file = parseDotenv(readFileSync(paths.env, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") log(`couldn't read ${paths.env}: ${(e as Error).message}`);
  }
  return { ...file, ...process.env };
}

const children = new Set<ChildProcess>();
let stopping = false;

/**
 * Runs a process and starts it again whenever it ends, after `ready()` holds (Glance exits on a missing config).
 * `restart()` stops it and starts it again at once, with a fresh environment.
 */
function keep(name: string, cmd: string, args: string[], opts: { env: () => NodeJS.ProcessEnv; uid?: number; gid?: number },
  ready: () => boolean = () => true, waiting?: string): { restart: () => void } {
  let delay = 1_000;
  let said = false;
  let current: ChildProcess | null = null;
  let restarting = false;
  const run = (): void => {
    if (stopping) return;
    if (!ready()) {
      if (waiting && !said) { log(waiting); said = true; }
      setTimeout(run, 1_000);
      return;
    }
    said = false;
    const started = Date.now();
    const { env, ...ids } = opts;
    const child = spawn(cmd, args, { ...ids, env: env(), cwd: "/app", stdio: ["ignore", "pipe", "pipe"] });
    current = child;
    children.add(child);
    prefixed(child, name);
    child.on("exit", (code, signal) => {
      children.delete(child);
      current = null;
      if (stopping) return;
      if (restarting) { restarting = false; delay = 1_000; run(); return; }
      delay = Date.now() - started > 30_000 ? 1_000 : Math.min(delay * 2, 30_000);
      log(`${name} stopped (${signal ?? `exit ${code}`}); starting it again in ${delay / 1000} s`);
      setTimeout(run, delay);
    });
  };
  run();
  return {
    restart: () => {
      if (!current || restarting) return;
      restarting = true;
      current.kill("SIGTERM");
    },
  };
}

/** A cheap fingerprint of a file (none when it's missing), to notice a new or changed .env. */
function stamp(path: string): string {
  try {
    const s = statSync(path);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  if (process.getuid?.() !== 0) {
    console.error("[start] This container starts as root and runs the editor as PUID:PGID. Remove --user; set PUID and PGID instead.");
    process.exit(1);
  }
  for (const dir of [join(DATA, "config"), paths.assets, paths.editor, join(DATA, "preview")]) await mkdir(dir, { recursive: true });
  await own(DATA);
  log(`data folder ${DATA}, owned by ${uid}:${gid}`);

  dockerGate(SOCKET).listen(GATE_PORT, "127.0.0.1");
  log(existsSync(SOCKET) ? "Docker socket found: the editor can list containers (read only)" : "no Docker socket mounted: Docker widgets and the Containers section won't list anything");

  const editorEnv: NodeJS.ProcessEnv = Object.fromEntries(PASS_TO_EDITOR.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
  // The names (never the values) of the container's own variables, so the editor can tell which ${VAR}s have no value
  // (ADR-0025). .env is read by the editor itself, as it changes (ADR-0029).
  editorEnv.GLANCE_ENV_NAMES = Object.keys(process.env).join(",");
  // Photo folders for backgrounds (D-59), /photos unless set: only those actually mounted, so none listed if empty.
  editorEnv.SERVER_FOLDERS = (process.env.SERVER_FOLDERS ?? "/photos").split(",").map((x) => x.trim()).filter((x) => x && existsSync(x)).join(",");
  Object.assign(editorEnv, {
    HOME: "/tmp", PORT: EDITOR_PORT, GLANCE_BIN: GLANCE,
    GLANCE_CONFIG: paths.config, EDITOR_DATA_DIR: paths.editor,
    GLANCE_URL: "http://127.0.0.1:8080/",
    PREVIEW_CONFIG: paths.preview, PREVIEW_GLANCE_URL: `http://127.0.0.1:${PREVIEW_PORT}/`,
    DOCKER_PROXY_URL: `tcp://127.0.0.1:${GATE_PORT}`,
    ASSETS_DIR: paths.assets, GLANCE_ASSETS_PATH: paths.assets,
  });
  keep("editor", process.execPath, ["/app/build"], { env: () => editorEnv, uid, gid });
  const glance = keep("glance", GLANCE, ["--config", paths.config], { env: glanceEnv }, () => existsSync(paths.config),
    `waiting for ${paths.config}: open the editor and import or start a dashboard`);
  const preview = keep("preview", GLANCE, ["--config", paths.preview], { env: glanceEnv }, () => existsSync(paths.preview));
  // Glance reads its environment only when it starts: a new or changed .env (an import writes one) restarts both.
  let envStamp = stamp(paths.env);
  setInterval(() => {
    const now = stamp(paths.env);
    if (now === envStamp) return;
    envStamp = now;
    log(`${paths.env} changed: restarting Glance and the preview Glance`);
    glance.restart();
    preview.restart();
  }, 2_000).unref();

  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    log("stopping");
    for (const c of children) c.kill("SIGTERM");
    const t = setInterval(() => { if (children.size === 0) process.exit(0); }, 100);
    setTimeout(() => { clearInterval(t); for (const c of children) c.kill("SIGKILL"); process.exit(0); }, 8_000);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e: Error) => {
  console.error(`[start] ${e.message}`);
  process.exit(1);
});
