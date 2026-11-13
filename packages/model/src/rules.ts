// Checks that go beyond the schema's shape. Each rule cites where it comes from.
// Errors: the pinned Glance would reject the config, or an accepted ADR forbids it. Warnings: Glance accepts it, but
// it probably doesn't do what the user expects.

import { containsPlaceholder, findPlaceholders, isWholePlaceholder } from "./placeholder.ts";
import { itemKeys, type Field } from "./fields.ts";
import {
  Auth, AuthUser, Background, BackgroundImage, Branding, Column, Dashboard, Document, EditorSection, Page, Server, Theme, ThemePreset,
  GLANCE_WIDGET_TYPES,
  isRawWidget,
  type DashboardT,
  type PageT,
  type WidgetT,
} from "./schema.ts";
import { WIDGETS, widgetFields } from "./widgets.ts";
import { GLANCE_VERSION } from "./glance-source.generated.ts";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  /** Stable machine-readable code, e.g. "page.too-many-columns". */
  code: string;
  /** Path into the model, e.g. ["pages", 0, "columns"]. */
  path: (string | number)[];
  message: string;
}

export function checkDashboard(d: DashboardT): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: string, path: Issue["path"], message: string) =>
    issues.push({ severity, code, path, message });

  // config.go isConfigStateValid: "no pages configured"
  if (d.pages.length === 0) add("error", "dashboard.no-pages", ["pages"], "A dashboard needs at least one page.");

  d.pages.forEach((page, p) => checkPage(page, ["pages", p], add));
  checkSlugs(d, add);

  checkAuth(d, add);
  checkBackground(d, add);
  checkUniqueIds(d, add);
  checkPlaceholders(d, add);
  checkExtras(d, [], add);
  return issues;
}

type Add = (severity: Severity, code: string, path: Issue["path"], message: string) => void;

/**
 * Design 03 "Background incomplete": an image background needs an image, a slideshow at least 2 (a server folder
 * counts as 2 here; the server checks what is in it). Located on the Theme screen (`theme.background`).
 */
function checkBackground(d: DashboardT, add: Add) {
  const bg = d["glance-editor"]?.background;
  if (!bg) return;
  const images = bg.images ?? [];
  images.forEach((im, i) => {
    if ([im.file, im.folder, im.pixabay].filter((x) => x !== undefined).length !== 1) {
      add("error", "background.image-shape", ["theme", "background"], `Background image ${i + 1} needs exactly one of a file, a folder or a Pixabay set.`);
    }
  });
  // A folder or a Pixabay set holds several images; the server checks what is really there.
  const count = images.reduce((n, im) => n + (im.folder || im.pixabay ? 2 : 1), 0);
  if (bg.mode === "image" && !images.length) add("error", "background.no-image", ["theme", "background"], "Upload an image, or set the background back to Colour only.");
  if (bg.mode === "image" && images.length && (bg.use ?? 0) >= images.length) add("error", "background.no-image", ["theme", "background"], "The chosen background image is gone. Pick one of the images.");
  if (bg.mode === "slideshow" && count < 2) add("error", "background.slideshow-short", ["theme", "background"], "A slideshow needs at least 2 images.");
}

function checkPage(page: PageT, path: Issue["path"], add: Add) {
  const n = page.columns.length;
  // config.go isConfigStateValid: "page N has no name"
  if (page.name === "") add("error", "page.no-name", [...path, "name"], "Page name is required. Glance won't accept a page without one.");
  // config.go isConfigStateValid (v0.8.6)
  if (n === 0) add("error", "page.no-columns", [...path, "columns"], `Page "${page.name}" has no columns.`);
  if (page.width === "slim" && n > 2) {
    add("error", "page.slim-too-many-columns", [...path, "columns"], `Page "${page.name}" is slim, so it can have at most 2 columns.`);
  } else if (n > 3) {
    add("error", "page.too-many-columns", [...path, "columns"], `Page "${page.name}" has ${n} columns; the maximum is 3.`);
  }
  const full = page.columns.filter((c) => c.size === "full").length;
  if (n > 0 && (full === 0 || full > 2)) {
    add("error", "page.full-columns", [...path, "columns"], `Page "${page.name}" must have 1 or 2 full columns (it has ${full}).`);
  }
  page.columns.forEach((col, c) =>
    col.widgets.forEach((w, i) => checkWidget(w, [...path, "columns", c, "widgets", i], add, null)),
  );
  page["head-widgets"]?.forEach((w, i) => checkWidget(w, [...path, "head-widgets", i], add, null));
}

function checkWidget(w: WidgetT, path: Issue["path"], add: Add, parentType: string | null) {
  // widget-group.go: "nested groups are not supported", "split columns inside of groups are not supported"
  if (parentType && WIDGETS[parentType]?.disallowedChildren?.includes(w.type)) {
    add("error", "widget.invalid-nesting", path, `A ${WIDGETS[parentType]!.label.toLowerCase()} can't contain a ${w.type} widget.`);
  }
  // widget.go newWidget: "unknown widget type"
  if (isRawWidget(w)) {
    if (!GLANCE_WIDGET_TYPES.includes(w.type)) {
      add("error", "widget.unknown-type", [...path, "type"], `Glance ${GLANCE_VERSION} has no widget type "${w.type}".`);
    }
    return;
  }
  const rec = w as Record<string, unknown>;
  checkRequired(rec, widgetFields(w.type), path, add);
  if (Array.isArray(w.widgets)) w.widgets.forEach((child, i) => checkWidget(child, [...path, "widgets", i], add, w.type));
  checkWidgetRules(rec, path, add);
}

const isEmpty = (v: unknown) => v === undefined || v === "";

/** `required` fields (Glance v0.8.6 rejects the config without them; packages/glance/test/widget-schema.test.ts). */
function checkRequired(obj: Record<string, unknown>, fields: readonly Field[], path: Issue["path"], add: Add) {
  for (const f of fields) {
    const v = obj[f.key];
    if (f.required && isEmpty(v)) {
      add("error", "field.required", [...path, f.key], `${f.label} is required. Glance won't accept the config without it.`);
    }
    // ADR-0018 (option B): Glance's docs call these required, but v0.8.6 runs without them. Warn, never block.
    // markets: the legacy `stocks` list stands in for `markets` when that is empty (widget-markets.go).
    const legacy = f.key === "markets" && Array.isArray(obj.stocks) && obj.stocks.length > 0;
    if (f.docsRequired && !legacy && (isEmpty(v) || (Array.isArray(v) && v.length === 0))) {
      add("warning", "field.recommended", [...path, f.key], `${f.label} is empty, so this part of the widget will show nothing.`);
    }
    if (!f.item || v === undefined) continue;
    if (f.kind === "object") {
      if (v && typeof v === "object" && !Array.isArray(v)) checkRequired(v as Record<string, unknown>, f.item, [...path, f.key], add);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (x && typeof x === "object") checkRequired(x as Record<string, unknown>, f.item!, [...path, f.key, i], add);
      });
    }
  }
}

/** Rules that span fields. Each one is checked against the binary in widget-schema.test.ts. */
function checkWidgetRules(w: Record<string, unknown>, path: Issue["path"], add: Add) {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  switch (w.type) {
    case "reddit": {
      // widget-reddit.go initialize: "no `{REQUEST-URL}` placeholder specified"
      const t = str(w["request-url-template"]);
      // A placeholder may supply it, so only plain text is checked.
      if (t && !t.includes("{REQUEST-URL}") && !containsPlaceholder(t)) {
        add("error", "reddit.request-url-template", [...path, "request-url-template"], "The request URL template must contain {REQUEST-URL}.");
      }
      // "application name, client ID and client secret are required"
      const auth = w["app-auth"] && typeof w["app-auth"] === "object" ? (w["app-auth"] as Record<string, unknown>) : {};
      const set = ["name", "id", "secret"].filter((k) => !isEmpty(auth[k]));
      if (set.length > 0 && set.length < 3) {
        add("error", "reddit.app-auth-incomplete", [...path, "app-auth"], "App authentication needs all three: app name, client ID and client secret.");
      }
      // v0.8.8: "due to changes in Reddit's API, the search property works only when app-auth is configured" (ADR-0036)
      if (!isEmpty(w.search) && set.length === 0) {
        add("error", "reddit.search-needs-app-auth", [...path, "search"],
          "Search works only with App authentication, since Reddit changed its API. Fill in App authentication, or clear Search.");
      }
      break;
    }
    case "releases": {
      // widget-releases.go releaseRequest.UnmarshalYAML: "repository is required", "invalid source"
      const repos = w.repositories;
      if (Array.isArray(repos)) {
        repos.forEach((r, i) => {
          if (typeof r !== "string") return;
          if (r === "") add("error", "releases.empty-repository", [...path, "repositories", i], "A repository line is empty.");
          else if (r.includes(":") && !/^(github|gitlab|dockerhub|codeberg):/.test(r) && !containsPlaceholder(r)) {
            add("error", "releases.invalid-source", [...path, "repositories", i],
              `"${r.split(":")[0]}:" isn't a source Glance knows. Use github:, gitlab:, codeberg: or dockerhub:, or no prefix for GitHub.`);
          }
        });
      }
      break;
    }
    case "custom-api": {
      // widget-custom-api.go CustomAPIRequest.initialize: "body must be a string when body-type is 'string'"
      const check = (req: Record<string, unknown>, p: Issue["path"]) => {
        if (req["body-type"] === "string" && req.body !== undefined && req.body !== null && typeof req.body !== "string") {
          add("error", "custom-api.body-not-string", [...p, "body"], "The body must be text when the body type is string.");
        }
      };
      check(w, path);
      const subs = w.subrequests;
      if (Array.isArray(subs)) subs.forEach((r, i) => r && typeof r === "object" && check(r as Record<string, unknown>, [...path, "subrequests", i]));
      break;
    }
  }
  // ADR-0036: links Glance turns into dead links (the title link of every widget, a container's link).
  const link = (v: unknown, p: Issue["path"]) => {
    if (typeof v === "string" && glanceDropsLink(v)) add("warning", "link.dropped", p, DROPPED_LINK);
  };
  link(w["title-url"], [...path, "title-url"]);
  if (w.type === "docker-containers" && Array.isArray(w.containers)) {
    w.containers.forEach((e: unknown, i: number) => e && typeof e === "object" && link((e as Record<string, unknown>).url, [...path, "containers", i, "url"]));
  }
  // Every widget: monitor-style basic auth passwords in plain text.
  if (w.type === "monitor" && Array.isArray(w.sites)) {
    w.sites.forEach((s: { "basic-auth"?: { password?: string } | undefined }, i: number) => {
      const pw = s["basic-auth"]?.password;
      if (pw !== undefined && !isWholePlaceholder(pw)) {
        add("warning", "secret.plaintext", [...path, "sites", i, "basic-auth", "password"],
          "This password is stored in plain text. Consider a placeholder such as ${secret:name}.");
      }
    });
  }
}

const DROPPED_LINK = "Glance makes this a dead link: it keeps only links that start with http://, https:// or mailto:, or paths on this server.";

/**
 * Glance v0.8.8 writes a widget's title link and a container's link through Go's html/template, which replaces a link
 * with any other scheme by "#ZgotmplZ" (go1.27.3 src/html/template/url.go isSafeURL: the text before the first ":"
 * is a scheme unless it contains "/"; http, https and mailto pass, in any case). A placeholder there can't be judged.
 * Tested against the binary: packages/glance/test/links.test.ts.
 */
export function glanceDropsLink(url: string): boolean {
  const i = url.indexOf(":");
  if (i < 0) return false;
  const scheme = url.slice(0, i);
  if (scheme.includes("/") || scheme.includes("$")) return false;
  return !["http", "https", "mailto"].includes(scheme.toLowerCase());
}

/** Glance v0.8.6 utils.go titleToSlug: lower-case, runs of whitespace (Go `\s`) become "-", then "-" trimmed at both ends. */
export function pageSlug(page: Pick<PageT, "name" | "slug">): string {
  if (page.slug) return page.slug;
  return page.name.toLowerCase().replace(/[\t\n\f\r ]+/g, "-").replace(/^-+|-+$/g, "");
}

function checkSlugs(d: DashboardT, add: Add) {
  const seen = new Map<string, number>();
  d.pages.forEach((page, p) => {
    const slug = pageSlug(page);
    const field = page.slug ? "slug" : "name";
    // glance.go newApplication: `page slug "login" is reserved`. config:validate doesn't run this check, so Glance would
    // accept the file and then refuse to load it (tested: packages/glance/test/defaults.test.ts).
    if (slug === "login" || slug === "logout") {
      add("error", "page.reserved-slug", ["pages", p, field],
        `The page address "/${slug}" is reserved by Glance. Give the page another ${page.slug ? "slug" : "name or a slug"}.`);
    }
    // glance.go: slugToPage[slug] = page, so the later page wins the address.
    const first = seen.get(slug);
    if (first !== undefined && slug !== "") {
      add("warning", "page.duplicate-slug", ["pages", p, field],
        `Pages ${first + 1} and ${p + 1} both use the address "/${slug}", so Glance opens only page ${p + 1} there.`);
    } else seen.set(slug, p);
  });
}

function checkAuth(d: DashboardT, add: Add) {
  const auth = d.auth;
  if (!auth) return;
  // config.go: "secret-key must be set when users are configured"
  if (auth.users.length > 0 && auth["secret-key"].trim() === "") {
    add("error", "auth.missing-secret-key", ["auth", "secret-key"], "A secret key is required when users are configured.");
  }
  // ADR-0004: Glance auth secrets are stored as placeholders only.
  if (auth["secret-key"].trim() !== "" && !isWholePlaceholder(auth["secret-key"])) {
    add("error", "auth.plaintext-secret", ["auth", "secret-key"], "The secret key must be a placeholder such as ${secret:glance_secret_key}, not plain text.");
  }
  auth.users.forEach((u, i) => {
    const path = ["auth", "users", i];
    // config.go: usernames ≥ 3 characters; password or password-hash required; password ≥ 6 characters
    if (u.username.length < 3) add("error", "auth.short-username", [...path, "username"], "Usernames must be at least 3 characters.");
    if (!u.password && !u["password-hash"]) add("error", "auth.no-password", path, `User ${u.username} needs a password or a password hash.`);
    if (u.password !== undefined && !isWholePlaceholder(u.password)) {
      add("error", "auth.plaintext-secret", [...path, "password"], "Passwords must be a placeholder such as ${secret:name}, or use a password hash.");
    }
  });
}

function checkUniqueIds(d: DashboardT, add: Add) {
  const seen = new Map<string, string>();
  const visit = (value: unknown, path: (string | number)[]) => {
    if (Array.isArray(value)) value.forEach((v, i) => visit(v, [...path, i]));
    else if (value && typeof value === "object") {
      const rec = value as Record<string, unknown>;
      if (typeof rec._id === "string") {
        const where = path.join(".");
        if (seen.has(rec._id)) add("error", "model.duplicate-id", path, `Duplicate _id "${rec._id}" (also at ${seen.get(rec._id)}).`);
        else seen.set(rec._id, where);
      }
      for (const [k, v] of Object.entries(rec)) if (k !== "extra" && k !== "_raw" && k !== "_yaml") visit(v, [...path, k]);
    }
  };
  visit(d, []);
}

/** Warn about placeholder-like text that Glance will NOT substitute (verified by test/glance-cli.sh). */
function checkPlaceholders(d: DashboardT, add: Add) {
  const visit = (value: unknown, path: (string | number)[]) => {
    if (typeof value === "string") {
      for (const p of findPlaceholders(value)) {
        if (p.kind === "literal") {
          add("warning", "placeholder.not-substituted", path,
            `"${p.text}" looks like a placeholder, but Glance won't substitute it (names must be upper-case A–Z, 0–9, _).`);
        }
      }
      // An escape directly followed by two or more placeholders: Glance leaves the first literal but substitutes the next.
      // The file can say that, but the model can't keep it after a reload, so a later save would change it (Phase 2
      // property test). Blocked until a character separates them.
      if (/\\\$\{[^}]*\}\$\{[^}]*\}\$\{/.test(value)) {
        add("error", "placeholder.ambiguous", path, "An escaped placeholder directly followed by two placeholders can't be stored reliably. Put a character between them.");
      }
      // Two placeholders back to back: Glance only substitutes the first (test/glance-cli.sh).
      if (/\$\{[^}]*\}\$\{/.test(value)) {
        add("warning", "placeholder.adjacent", path, "Glance doesn't substitute a placeholder that directly follows another one. Put a character between them.");
      }
    } else if (Array.isArray(value)) value.forEach((v, i) => visit(v, [...path, i]));
    // `_yaml` holds the override's source text; its values are checked where they were read back into the widget.
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k !== "_yaml") visit(v, [...path, k]);
  };
  visit(d, []);
}

/** Which object an `extra` belongs to, from its path, so a kept-as-is value isn't reported as an unknown key. */
const LIST_SCHEMAS: Record<string, { shape: object }> = { pages: Page, columns: Column, presets: ThemePreset, users: AuthUser, images: BackgroundImage };
const SECTION_SCHEMAS: Record<string, { shape: object }> = {
  theme: Theme, branding: Branding, server: Server, document: Document, auth: Auth, "glance-editor": EditorSection, background: Background,
};

function knownKeys(path: (string | number)[]): Set<string> {
  let schema: { shape: object } | undefined;
  if (path.length === 0) schema = Dashboard;
  else {
    const last = path[path.length - 1];
    const parent = typeof last === "number" ? path[path.length - 2] : last;
    schema = typeof parent === "string" ? (LIST_SCHEMAS[parent] ?? SECTION_SCHEMAS[parent]) : undefined;
  }
  return new Set(schema ? Object.keys(schema.shape) : []);
}

/**
 * Glance ignores unknown keys silently (yaml.Unmarshal is non-strict in v0.8.6), so flag every unknown key in `extra`.
 * A known key in `extra` holds a value the editor can't edit in a form; it is kept as written (D-14).
 * Inside widgets the known keys come from the field definitions (`known`), elsewhere from the object's schema.
 */
function checkExtras(value: unknown, path: (string | number)[], add: Add, known?: Set<string>, fields?: readonly Field[]) {
  if (Array.isArray(value)) return value.forEach((v, i) => checkExtras(v, [...path, i], add, known, fields));
  if (!value || typeof value !== "object") return;
  const owner = value as Record<string, unknown>;
  if (typeof owner.type === "string" && WIDGETS[owner.type] && !("_raw" in owner) && fields === undefined) {
    fields = widgetFields(owner.type);
    known = new Set(["_id", "type", ...fields.map((f) => f.key)]);
  }
  for (const [k, v] of Object.entries(owner)) {
    if (k === "_raw" || k === "_yaml") continue;
    if (k === "extra" && v && typeof v === "object") {
      const keys = known ?? knownKeys(path);
      for (const key of Object.keys(v)) {
        if (keys.has(key)) {
          add("warning", "key.kept-as-is", [...path, "extra", key], `"${key}" has a value the editor can't edit in a form; it is kept exactly as written.`);
        } else {
          add("warning", "key.unknown", [...path, "extra", key], `Glance ${GLANCE_VERSION} doesn't use "${key}" here, so it will be ignored.`);
        }
      }
      continue;
    }
    const f = fields?.find((x) => x.key === k);
    if (f?.kind === "widgets") checkExtras(v, [...path, k], add);
    else if (f?.item) checkExtras(v, [...path, k], add, itemKeys(f), f.item);
    else if (fields) continue; // a scalar, list of scalars, map or yaml value inside a widget: nothing more to check
    else checkExtras(v, [...path, k], add);
  }
}
