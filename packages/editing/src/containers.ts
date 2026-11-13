// The Containers section of a docker-containers widget (design D-22 to D-24, flow "Hide a container"): which
// containers Glance shows, and the `containers` map edit that shows or hides one. Mirrors Glance v0.8.8,
// widget-docker-containers.go (read 2026-10-14 at v0.8.6, children re-read 2026-11-13 at v0.8.8; test/glance-docker.sh):
//   - the map is map[string]map[string]string: per container name, glance.* labels without the prefix. Glance copies
//     each entry over the container's labels before anything else, so the map wins over a label (tested:
//     test/glance-docker.sh);
//   - a container is hidden when its glance.hide (after the copy) is non-empty and "true" or "yes"
//     (stringToBool, utils.go), shown when it is any other non-empty value, and otherwise follows hide-by-default;
//   - category keeps only containers whose glance.category equals the widget's; running-only asks Docker for
//     all=false, which also returns paused containers (tested 2026-10-14, Docker 29.8);
//   - a child (glance.parent set, glance.id not) is listed only under each listed container whose glance.id it names;
//     since v0.8.8 the category doesn't filter children (they follow their parent).
import { newId } from "./layout.ts";

/** One container as the editor's Docker connection reports it; `glance` holds its glance.* labels without the prefix. */
export interface ContainerInfo {
  name: string;
  state: string;
  glance: Record<string, string>;
  image?: string;
  unraidIcon?: string;
  unraidWebui?: string;
  ports?: { private: number; public?: number }[];
  networkMode?: string;
  networks?: Record<string, string>;
}

/** One item of the widget's `containers` list (the map, keyed by `container`). */
export type ContainerEntry = { _id: string; container?: string; hide?: boolean | string; [k: string]: unknown };

export interface ContainerRow {
  name: string;
  /** Docker's state ("running", "exited", …), or null when Docker wasn't reached or doesn't know the name. */
  state: string | null;
  /** What the hide rules give (D-24: the outcome, not the flag). */
  visible: boolean;
  /** Visible and not left out by Running only or Category: Glance lists it. */
  shown: boolean;
  /** D-23: hidden by a glance.hide label, so read-only here. */
  locked: boolean;
  /** One line under the name. */
  sub: string;
}

export interface ContainerList {
  rows: ContainerRow[];
  shown: number;
}

type Widget = { "hide-by-default"?: unknown; "running-only"?: unknown; category?: unknown; containers?: unknown };

const truthy = (s: string) => s === "true" || s === "yes"; // Glance's stringToBool
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const entries = (w: Widget) => (Array.isArray(w.containers) ? (w.containers as ContainerEntry[]) : []);
const entryFor = (w: Widget, name: string) => entries(w).find((e) => e.container === name);
const stateText = (s: string) => (s === "running" ? "Running" : s === "paused" ? "Paused" : "Stopped");

/**
 * The rows of the Containers section: every container Docker reports, plus names the map has that Docker doesn't (or
 * all of the map's names when Docker can't be reached: `list` null). Sorted by name.
 */
export function containerRows(w: Widget, list: ContainerInfo[] | null): ContainerList {
  const hbd = w["hide-by-default"] === true;
  const runningOnly = w["running-only"] === true;
  const category = typeof w.category === "string" ? w.category : "";
  const known = new Map((list ?? []).map((c) => [c.name, c]));
  const names = [...known.keys(), ...entries(w).map((e) => e.container).filter((n): n is string => !!n && !known.has(n))];
  // A glance.* label as Glance reads it: the map's entry replaces the container's label, even when empty.
  const label = (name: string, key: string) => {
    const e = entryFor(w, name);
    return e?.[key] !== undefined ? str(e[key]) : (known.get(name)?.glance[key] ?? "");
  };
  const visibleOf = (name: string) => (label(name, "hide") ? !truthy(label(name, "hide")) : !hbd);
  const stoppedOf = (c: ContainerInfo | undefined) => !!c && runningOnly && c.state !== "running" && c.state !== "paused";
  const childOf = (name: string) => (label(name, "id") === "" ? label(name, "parent") : "");
  const offCategoryOf = (name: string) => category !== "" && !childOf(name) && label(name, "category") !== category;
  // Containers Glance lists in their own right (not children): children are shown under these.
  const listed = [...known.keys()].filter((n) => !childOf(n) && visibleOf(n) && !stoppedOf(known.get(n)) && !offCategoryOf(n));
  const rows = [...new Set(names)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((name): ContainerRow => {
    const c = known.get(name);
    const labelHide = c?.glance.hide ?? "";
    const visible = visibleOf(name);
    const byLabel = truthy(labelHide);
    const offCategory = !!c && offCategoryOf(name);
    const stopped = stoppedOf(c);
    const parentId = childOf(name);
    const parents = parentId ? [...known.keys()].filter((n) => label(n, "id") === parentId) : [];
    const under = listed.find((n) => parents.includes(n));
    const shown = !!c && visible && !offCategory && !stopped && (!parentId || under !== undefined);
    const hidden = visible ? "" : " · hidden";
    const nameOf = (n: string) => label(n, "name") || n;
    let sub: string;
    if (byLabel && !visible) sub = "Hidden by the glance.hide label on the container. Change it where the container is defined.";
    else if (byLabel) sub = "Shown: this widget’s containers map overrides the container’s glance.hide label. Change it in the YAML tab.";
    else if (list === null) sub = `State unknown${hidden}`;
    else if (!c) sub = `Docker has no container with this name, so Glance ignores it${hidden}`;
    else if (offCategory) sub = `Not shown: this widget lists only the category “${category}”${hidden}`;
    else if (stopped) sub = `${stateText(c.state)} · not shown while Running only is on${hidden}`;
    else if (parentId && visible && under !== undefined) sub = `${stateText(c.state)} · shown under “${nameOf(under)}”`;
    else if (parentId && visible && parents.length) sub = `Not shown: Glance lists it under “${nameOf(parents[0]!)}”, which isn’t shown`;
    else if (parentId && visible) sub = `Not shown: Glance lists it under the container with glance.id “${parentId}”, and there is none`;
    else sub = `${stateText(c.state)}${hidden}`;
    return { name, state: c?.state ?? null, visible, shown, locked: byLabel, sub };
  });
  return { rows, shown: rows.filter((r) => r.shown).length };
}

/**
 * Show or hide one container by editing the widget's `containers` list in place (D-22, D-24). Only `hide` is touched:
 * other keys in the container's entry are kept. When the container's labels are known (`info`) and the wanted outcome
 * is what Glance does without a map `hide` (the label, else Hide by default), the key is removed rather than written,
 * and an entry left empty is dropped. Without `info`, `hide` is always written, so a label the editor can't see can't
 * decide the outcome.
 */
export function setContainerVisible(w: Widget, name: string, visible: boolean, info: ContainerInfo | null): void {
  const list = entries(w).slice();
  let e = list.find((x) => x.container === name);
  const labelHide = info?.glance.hide ?? "";
  const natural = labelHide ? truthy(labelHide) : w["hide-by-default"] === true;
  if (info && natural === !visible) {
    if (!e) return;
    delete e.hide;
    const rest = Object.keys(e).filter((k) => k !== "_id" && k !== "container");
    if (!rest.length) list.splice(list.indexOf(e), 1);
  } else {
    if (!e) list.push((e = { _id: newId("container"), container: name }));
    e.hide = !visible;
  }
  if (list.length) w.containers = list;
  else delete w.containers;
}

/** ADR-0026: the per-container settings the Containers section edits (glance.* label names, the map's keys). */
export const CONTAINER_FIELDS = ["icon", "name", "url", "description", "same-tab"] as const;
export type ContainerField = (typeof CONTAINER_FIELDS)[number];

/** The container's entry in the widget's map, if any. */
export const containerEntry = (w: Widget, name: string): ContainerEntry | undefined => entryFor(w, name);

/**
 * Set or clear one setting of a container in the widget's map (ADR-0026). A cleared key is removed, so the container's
 * own label (if any) applies again; an entry left with nothing in it is dropped.
 */
export function setContainerField(w: Widget, name: string, key: ContainerField, value: string | boolean | undefined): void {
  const list = entries(w).slice();
  let e = list.find((x) => x.container === name);
  const empty = value === undefined || value === "" || value === false;
  if (empty) {
    if (!e) return;
    delete e[key];
    const rest = Object.keys(e).filter((k) => k !== "_id" && k !== "container");
    if (!rest.length) list.splice(list.indexOf(e), 1);
  } else {
    if (!e) list.push((e = { _id: newId("container"), container: name }));
    e[key] = value;
  }
  if (list.length) w.containers = list;
  else delete w.containers;
}

/**
 * A name to look icons up by: the name set for the container, else its image without registry, owner and tag
 * (`lscr.io/linuxserver/plex:latest` → `plex`), else its name.
 */
export function iconTerm(name: string, title: string | undefined, image: string | undefined): string {
  if (title?.trim()) return title.trim();
  // A container started from an image ID (`sha256:…`) has no name to go by.
  const ref = /^(sha256:)?[0-9a-f]{12,}$/.test(image ?? "") ? "" : (image ?? "");
  const img = ref.replace(/@sha256:.*$/, "").replace(/:[^/:]*$/, "").split("/").pop() ?? "";
  return (img || name).replace(/[-_]+/g, " ").trim();
}

/**
 * A container's web address from its Unraid template's WebUI (`http://[IP]:[PORT:8096]/`), filled in the way Unraid
 * fills it (webgui DockerClient.php getControlURL and getAllInfo, main at 26eb1b5, read 2026-10-14):
 *   - host network, or a published port: the server's address, and for [PORT:n] the host port published for n;
 *   - otherwise the container's own address on a network on the LAN (Unraid's br0 and the like: macvlan or ipvlan),
 *     and n as it is.
 * `server` is the server's address as the browser reaches it. Null when the address can't be worked out (a container
 * on an internal bridge network with nothing published is not reachable from the LAN).
 */
export function resolveWebui(c: ContainerInfo, server: string): string | null {
  const t = c.unraidWebui;
  if (!t) return null;
  if (!/\[(IP|PORT:\d+)\]/.test(t)) return t;
  const ports = c.ports ?? [];
  const published = ports.some((p) => p.public !== undefined);
  let ip: string | null = null;
  if (c.networkMode === "host" || published) ip = server;
  else {
    // Docker's own networks (bridge, user-defined bridges) are internal; Unraid's LAN networks are named after the
    // interface (br0, eth0, bond0, br0.10…).
    const lan = Object.entries(c.networks ?? {}).find(([name]) => /^(br|eth|bond|wlan|vhost)\d/.test(name));
    ip = lan?.[1] ?? null;
  }
  if (!ip) return null;
  const host = ip.includes(":") && !ip.startsWith("[") ? `[${ip}]` : ip;
  return t.replace(/\[IP\]/g, host).replace(/\[PORT:(\d+)\]/g, (_m, n: string) => {
    const p = ip === server && c.networkMode !== "host" ? ports.find((x) => x.private === Number(n) && x.public !== undefined) : undefined;
    return String(p?.public ?? n);
  });
}

/** What "Fill in icons and links" may fill: settings that neither the map nor the container's glance.* labels have. */
export function emptyFields(w: Widget, c: ContainerInfo): { icon: boolean; url: boolean } {
  const e = entryFor(w, c.name);
  const has = (k: "icon" | "url") => (e?.[k] !== undefined && e[k] !== "") || !!c.glance[k];
  return { icon: !has("icon"), url: !has("url") };
}
