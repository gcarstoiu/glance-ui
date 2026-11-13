// Per test: a temp Glance config dir and editor data dir, an optional real Glance watching the config dir, and the
// built editor (apps/editor/build) pointed at both. Nothing outside the temp dirs is touched (docs/testing.md).
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startIconSources, type IconSourcesStandIn } from "../support/icon-sources.ts";
import { startPixabay, type PixabayStandIn } from "../support/pixabay.ts";

export interface EditorOptions {
  /** glance.yml content; `{{GLANCE_PORT}}` is replaced with the test Glance's port. Omit for "no file". */
  seed?: string;
  /** Start a real Glance on the config dir and give the editor its URL (status dot, reload confirmation). */
  glance?: boolean;
  /** Give the editor a GLANCE_URL nothing answers at (design 03 "Glance not responding"). */
  deadGlance?: boolean;
  /** Point the editor at a glance binary that doesn't exist (design 03 "Validator unavailable"). */
  noValidator?: boolean;
  /** Start a second real Glance as the preview Glance (ADR-0019), with this environment. */
  preview?: boolean | { env: Record<string, string> };
  /** Give the editor a preview Glance URL nothing answers at (design 03 "Preview can't build"). */
  deadPreview?: boolean;
  /**
   * A stand-in for the read-only Docker socket proxy (ADR-0005) listing these containers, given to the editor as
   * DOCKER_PROXY_URL and to the seed as `{{DOCKER_URL}}` (the widget's sock-path, so the real Glance lists the same).
   * Like the proxy, it answers only GET. "dead": a Docker URL nothing answers at (design 03 "Docker socket unreachable").
   */
  docker?: FakeContainer[] | "dead";
  /** A second stand-in Docker, another server's (ADR-0026): only in the seed, as `{{REMOTE_DOCKER_URL}}`. */
  remoteDocker?: FakeContainer[];
  /** Stand-ins for the icon finder's sources (test/support/icon-sources.ts); the seed's `{{ICON_SITE}}` is their URL. */
  icons?: boolean;
  /** A Glance assets folder: ASSETS_DIR for the editor, `{{ASSETS_DIR}}` in the seed (for `server: assets-path`). */
  assets?: boolean;
  /** Environment for the test Glance (for placeholders in the seed). */
  glanceEnv?: Record<string, string>;
  /** Folders mounted into the editor (SERVER_FOLDERS, D-59): folder name → files. Created under the test's temp dir. */
  serverFolders?: Record<string, Record<string, Buffer>>;
  /** Tell the editor where Glance's assets folder is (GLANCE_ASSETS_PATH = the assets folder). */
  glanceAssetsPath?: boolean;
  /** The container's own variable names, as the all-in-one container passes them (GLANCE_ENV_NAMES, ADR-0029). */
  glanceEnvNames?: string[];
  /** A stand-in for Pixabay's API (test/support/pixabay.ts) as PIXABAY_API. */
  pixabay?: boolean;
}

export interface FakeContainer {
  name: string;
  state?: string;
  labels?: Record<string, string>;
  image?: string;
  /** Docker's Ports: a container port, and the host port published for it. */
  ports?: { private: number; public?: number }[];
}

export interface Editor {
  url: string;
  configPath: string;
  live(): string;
  write(text: string): void;
  readOnly(on: boolean): void;
  glancePort: number | null;
  /** The preview Glance's config file (null without one). */
  previewPath: string | null;
  /** Every request the stand-in Docker API received ("GET /containers/json?all=true"). */
  dockerRequests: string[];
  /** Requests the second stand-in Docker received (remoteDocker). */
  remoteRequests: string[];
  /** The assets folder (null without `assets`). */
  assetsDir: string | null;
  /** The mounted server folders' paths, by name. */
  serverFolders: Record<string, string>;
  /** Requests the Pixabay stand-in received (null without `pixabay`). */
  pixabayRequests: string[] | null;
  /** The icon sources stand-in's URL and the requests it received (null without `icons`). */
  iconSources: { url: string; requests: string[] } | null;
}

/** The stand-in Docker API: GET /containers/json like Docker's (all=false: running and paused only); 403 otherwise. */
async function fakeDocker(list: FakeContainer[], seen: string[], iconSite = ""): Promise<{ server: Server; url: string }> {
  const server = createHttpServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const u = new URL(req.url ?? "/", "http://x");
    if (req.method !== "GET" || !/^(\/v[\d.]+)?\/containers\/json$/.test(u.pathname)) return void res.writeHead(403).end("Forbidden");
    const all = u.searchParams.get("all") === "true";
    const body = list
      .filter((c) => all || ["running", "paused"].includes(c.state ?? "running"))
      .map((c) => ({ Names: [`/${c.name}`], Image: c.image ?? "example", State: c.state ?? "running", Status: c.state === "exited" ? "Exited (0) 2 days ago" : "Up 3 days",
        // Label values may name the icon stand-in as {{ICON_SITE}} (a container's Unraid icon, ADR-0027).
        Labels: Object.fromEntries(Object.entries(c.labels ?? {}).map(([k, v]) => [k, v.replaceAll("{{ICON_SITE}}", iconSite)])),
        Ports: (c.ports ?? []).map((p) => ({ IP: "0.0.0.0", PrivatePort: p.private, ...(p.public ? { PublicPort: p.public } : {}), Type: "tcp" })),
        HostConfig: { NetworkMode: "bridge" }, NetworkSettings: { Networks: { bridge: { IPAddress: "172.17.0.9" } } } }));
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** A port the OS says is free now (random picks collided once tests started three servers each). */
const port = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });

async function waitFor(url: string, child: ChildProcess, log: () => string) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`process exited: ${log()}`);
    if (await fetch(url).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`not up: ${url}\n${log()}`);
}

export const fixture = (name: string) => readFileSync(join("test/e2e/fixtures", name), "utf8");
/** The pinned Glance version (glance.version), as the editor image sets GLANCE_VERSION. */
export const GLANCE_VERSION = /^GLANCE_VERSION=(\S+)$/m.exec(readFileSync("glance.version", "utf8"))![1]!;

export const test = base.extend<{ opts: EditorOptions; editor: Editor }>({
  opts: [{}, { option: true }],
  editor: async ({ opts }, use) => {
    const dir = mkdtempSync(join(tmpdir(), "glance-editor-e2e-"));
    const configDir = join(dir, "config");
    const configPath = join(configDir, "glance.yml");
    mkdirSync(configDir);
    mkdirSync(join(dir, "data"));
    const children: ChildProcess[] = [];
    let glancePort: number | null = null;
    let previewPath: string | null = null;
    const dockerRequests: string[] = [];
    const remoteRequests: string[] = [];
    let remote: { server: Server; url: string } | null = null;
    let docker: { server: Server; url: string } | null = null;
    let icons: IconSourcesStandIn | null = null;
    let pixabay: PixabayStandIn | null = null;
    const assetsDir = opts.assets ? join(dir, "assets") : null;
    const serverFolders: Record<string, string> = {};
    try {
      if (assetsDir) mkdirSync(assetsDir);
      if (opts.icons) icons = await startIconSources();
      if (opts.pixabay) pixabay = await startPixabay();
      if (Array.isArray(opts.docker)) docker = await fakeDocker(opts.docker, dockerRequests, icons?.url);
      if (opts.remoteDocker) remote = await fakeDocker(opts.remoteDocker, remoteRequests);
      // "dead": a port the OS just gave out, with nothing listening (fetch refuses some low ports outright).
      const dockerUrl = opts.docker === "dead" ? `tcp://127.0.0.1:${await port()}` : docker?.url ?? "";
      if (opts.seed !== undefined) {
        glancePort = await port();
        writeFileSync(configPath, opts.seed.replaceAll("{{GLANCE_PORT}}", String(glancePort)).replaceAll("{{DOCKER_URL}}", dockerUrl).replaceAll("{{REMOTE_DOCKER_URL}}", remote?.url ?? "")
          .replaceAll("{{ASSETS_DIR}}", assetsDir ?? "").replaceAll("{{ICON_SITE}}", icons?.url ?? ""));
      }
      const env: Record<string, string> = {
        PATH: process.env.PATH ?? "",
        GLANCE_CONFIG: configPath,
        EDITOR_DATA_DIR: join(dir, "data"),
        GLANCE_BIN: opts.noValidator ? join(dir, "no-glance-here") : process.env.GLANCE_BIN!,
        GLANCE_VERSION,
        HOST: "127.0.0.1",
      };
      if (dockerUrl) env.DOCKER_PROXY_URL = dockerUrl;
      if (assetsDir) env.ASSETS_DIR = assetsDir;
      if (assetsDir && opts.glanceAssetsPath) env.GLANCE_ASSETS_PATH = assetsDir;
      if (pixabay) env.PIXABAY_API = pixabay.api;
      if (opts.glanceEnvNames) env.GLANCE_ENV_NAMES = opts.glanceEnvNames.join(",");
      env.BODY_SIZE_LIMIT = "100M"; // as in the image (Dockerfile): background uploads, the first-run zip
      for (const [name, files] of Object.entries(opts.serverFolders ?? {})) {
        const f = join(dir, "mounts", name);
        mkdirSync(f, { recursive: true });
        for (const [file, data] of Object.entries(files)) {
          mkdirSync(dirname(join(f, file)), { recursive: true });
          writeFileSync(join(f, file), data);
        }
        serverFolders[name] = f;
      }
      if (Object.keys(serverFolders).length) env.SERVER_FOLDERS = Object.values(serverFolders).join(",");
      if (icons) Object.assign(env, { ICON_CDN: icons.sources.cdn, ICONIFY_API: icons.sources.iconify, OPENVERSE_API: icons.sources.openverse, WIKIMEDIA_API: icons.sources.wikimedia });
      if (opts.glance && glancePort !== null) {
        let log = "";
        const g = spawn(process.env.GLANCE_BIN!, ["--config", configPath], { stdio: "pipe", env: { PATH: env.PATH!, ...opts.glanceEnv } });
        g.stdout?.on("data", (b: Buffer) => (log += b));
        g.stderr?.on("data", (b: Buffer) => (log += b));
        children.push(g);
        await waitFor(`http://127.0.0.1:${glancePort}/api/healthz`, g, () => log);
        env.GLANCE_URL = `http://127.0.0.1:${glancePort}/`;
      }
      if (opts.deadGlance) env.GLANCE_URL = "http://127.0.0.1:9/";
      if (opts.preview || opts.deadPreview) {
        mkdirSync(join(dir, "preview"));
        previewPath = join(dir, "preview", "glance.yml");
        env.PREVIEW_CONFIG = previewPath;
      }
      if (opts.preview) {
        const pvPort = await port();
        // The editor's own seed for a missing preview file is the same shape (packages/server previewSeed).
        writeFileSync(previewPath!, `server:\n  host: 127.0.0.1\n  port: ${pvPort}\n  base-url: /preview\npages:\n  - name: Preview\n    columns:\n      - size: full\n        widgets: []\n`);
        let log = "";
        const pvEnv = typeof opts.preview === "object" ? opts.preview.env : {};
        const g = spawn(process.env.GLANCE_BIN!, ["--config", previewPath!], { stdio: "pipe", env: { PATH: env.PATH!, ...pvEnv } });
        g.stdout?.on("data", (b: Buffer) => (log += b));
        g.stderr?.on("data", (b: Buffer) => (log += b));
        children.push(g);
        await waitFor(`http://127.0.0.1:${pvPort}/api/healthz`, g, () => log);
        env.PREVIEW_GLANCE_URL = `http://127.0.0.1:${pvPort}/`;
      }
      if (opts.deadPreview) env.PREVIEW_GLANCE_URL = "http://127.0.0.1:9/";
      const editorPort = await port();
      env.PORT = String(editorPort);
      let log = "";
      const e = spawn(process.execPath, ["apps/editor/build/index.js"], { stdio: "pipe", env });
      e.stdout?.on("data", (b: Buffer) => (log += b));
      e.stderr?.on("data", (b: Buffer) => (log += b));
      children.push(e);
      const url = `http://127.0.0.1:${editorPort}`;
      await waitFor(`${url}/healthz`, e, () => log);
      await use({
        url, configPath, glancePort, previewPath, dockerRequests, remoteRequests, assetsDir, serverFolders, pixabayRequests: pixabay?.requests ?? null,
        iconSources: icons ? { url: icons.url, requests: icons.requests } : null,
        live: () => readFileSync(configPath, "utf8"),
        write: (text) => writeFileSync(configPath, text),
        readOnly: (on) => chmodSync(configDir, on ? 0o555 : 0o755),
      });
    } finally {
      // Wait for each process to exit before its folder is removed: one still shutting down can write into it (CI:
      // ENOTEMPTY from rmSync, 2026-10-26).
      await Promise.all(children.map((c) => (c.exitCode !== null || c.signalCode !== null ? null
        : new Promise((done) => { c.once("exit", done); c.kill(); setTimeout(done, 5_000); }))));
      docker?.server.closeAllConnections();
      docker?.server.close();
      remote?.server.closeAllConnections();
      remote?.server.close();
      await icons?.close();
      await pixabay?.close();
      try { chmodSync(configDir, 0o755); } catch { /* already gone */ }
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
});

export { expect };

/** True when the page shows the phone layout (under 760 px of editor width). */
export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 760;

/** Where a drag drops on a target: its middle, near its top. */
export const dropPoint = (t: { x: number; y: number; width: number; height: number }) => ({ x: t.x + t.width / 2, y: t.y + Math.min(t.height / 2, 8) });
/** Keeps the pointer on the target until the target stops moving. Near the window's edge the editor scrolls while
 *  dragging (`EDGE` in drag.ts), so a target there moves away from a pointer that waits, and a slow machine waits
 *  longer before the release (CI, 2026-11-03). */
export async function followTarget(page: Page, target: () => Locator, moveTo: (x: number, y: number) => Promise<unknown>) {
  for (let i = 0; i < 60; i++) {
    const t = (await target().boundingBox())!;
    const p = dropPoint(t);
    await moveTo(p.x, p.y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const now = (await target().boundingBox())!;
    if (now.x === t.x && now.y === t.y) return;
  }
  throw new Error("the drop target kept moving");
}
/** Drag a grip with the mouse and drop it on `target` (found once the drag has started), near its top. */
export async function mouseDrag(page: Page, grip: Locator, target: () => Locator) {
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 12, g.y + g.height / 2 + 12, { steps: 3 });
  const t = dropPoint((await target().boundingBox())!);
  await page.mouse.move(t.x, t.y, { steps: 8 });
  await followTarget(page, target, (x, y) => page.mouse.move(x, y));
  await page.mouse.up();
}

/** WCAG 2.1 A and AA checks on what is on screen now (plan v2 Phase 5: axe check in CI). */
export async function expectAccessible(page: Page, what: string, opts: { exclude?: string } = {}) {
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (opts.exclude) b = b.exclude(opts.exclude);
  const r = await b.analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`), what).toEqual([]);
}

/** D-44: every visible control is at least 44 × 44 px. */
export async function expectTargets(page: Page, what: string) {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered
      if (getComputedStyle(el).visibility === "hidden") continue;
      if (el.closest(".sr")) continue;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small, what).toEqual([]);
}
