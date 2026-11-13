// Plan v2 Phase 4 acceptance: every widget schema (packages/model/src/widgets.ts) matches the pinned Glance binary.
//   - every type Glance accepts has a schema, and every schema's type is accepted;
//   - `required` fields: Glance rejects the widget without them, and accepts it with only them;
//   - `docsRequired` fields: Glance accepts the widget without them (so the docs overstate it);
//   - `strict` enums: Glance rejects any other value; other enums: Glance accepts any value (and falls back);
//   - every key is one Glance reads: a value of the wrong YAML type makes Glance fail (an unknown key would be ignored);
//   - rules.ts agrees with Glance on all of the above, and the sample values survive import → generate.
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  GLANCE_SOURCE_WIDGET_TYPES, GLANCE_THEMES, GLANCE_VERSION, WIDGETS, WIDGET_TYPES, checkDashboard, widgetFields, type Field, type Issue,
} from "@glance-editor/model";
import { generate } from "@glance-editor/generator";
import { validateConfig } from "@glance-editor/glance";
import { importText } from "../src/index.ts";

type Obj = Record<string, unknown>;

const sample = (f: Field, mode: "minimal" | "full"): unknown => {
  if (f.sample !== undefined) return f.sample;
  switch (f.kind) {
    case "text": return "x";
    case "url": return "https://example.com/";
    case "icon": return "si:github";
    case "number": return 1;
    case "bool": return true;
    case "duration": return "5m";
    case "hsl": return "200 50 50";
    case "enum": return f.options![0];
    case "list": return f.of === "number" ? [1] : ["a"];
    case "map": return { A: "b" };
    case "yaml": return "x";
    case "widgets": return [];
    case "objectList": return [object(f.item!, mode)];
    case "object": return object(f.item!, mode);
    case "keyedList": return { key: object(f.item!, mode) };
  }
};

function object(fields: readonly Field[], mode: "minimal" | "full"): Obj {
  const out: Obj = {};
  for (const f of fields) if (mode === "full" || f.required) out[f.key] = sample(f, mode);
  return out;
}

const widget = (type: string, mode: "minimal" | "full"): Obj => ({ type, ...object(WIDGETS[type]!.fields, mode) });
const configOf = (...widgets: Obj[]) => stringify({ pages: [{ name: "P", columns: [{ size: "full", widgets }] }] });
const validate = (w: Obj) => validateConfig(configOf(w));

/** Every field with its path inside a sample widget (items: the first item). */
function walk(fields: readonly Field[], at: (string | number)[] = []): { f: Field; path: (string | number)[] }[] {
  return fields.flatMap((f) => {
    const p = [...at, f.key];
    const inner = f.kind === "objectList" ? [...p, 0] : f.kind === "keyedList" ? [...p, "key"] : f.kind === "object" ? p : null;
    return [{ f, path: p }, ...(inner && f.item ? walk(f.item, inner) : [])];
  });
}

function setAt(o: Obj, path: (string | number)[], value: unknown): Obj {
  const copy = structuredClone(o);
  let cur: Obj = copy;
  for (const k of path.slice(0, -1)) cur = cur[k] as Obj;
  const last = path[path.length - 1]!;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
  return copy;
}

const WRONG_SCALAR = { a: { b: 1 } };
function wrongType(f: Field): unknown {
  if ("wrongType" in f) return f.wrongType;
  switch (f.kind) {
    case "yaml": return undefined; // any value is valid
    case "list": case "objectList": case "object": case "widgets": return "scalar";
    case "keyedList": case "map": return ["x"];
    default: return WRONG_SCALAR;
  }
}

/** Errors our rules report for a widget written as Glance YAML (via import, as a user's file would be). */
function ruleErrors(w: Obj): Issue[] {
  return importText(configOf(w)).issues.filter((i) => i.severity === "error");
}

// The binary checks run in parallel batches; each is one `glance config:validate`.
const expectGlance = async (w: Obj, ok: boolean, what: string) => {
  const r = await validate(w);
  expect(r.ok, `${what}: Glance ${ok ? "rejected" : "accepted"} it. ${r.output}\n${configOf(w)}`).toBe(ok);
};

describe(`widget schemas match Glance ${GLANCE_VERSION} (Phase 4)`, { timeout: 300_000 }, () => {
  it("covers exactly the types in Glance's source at the pinned commit", () => {
    expect([...WIDGET_TYPES].sort()).toEqual([...GLANCE_SOURCE_WIDGET_TYPES].sort());
  });

  it("every type is accepted, and a made-up type is rejected", async () => {
    const r = await validateConfig(configOf(...WIDGET_TYPES.map((t) => widget(t, "minimal"))));
    expect(r.ok, r.output).toBe(true);
    const bad = await validate({ type: "not-a-widget" });
    expect(bad.output).toContain("unknown widget type");
  });

  for (const type of WIDGET_TYPES) {
    const schema = WIDGETS[type]!;
    describe(type, () => {
      it("minimal (required fields only) and full samples pass Glance and our rules, and survive import → generate", async () => {
        for (const mode of ["minimal", "full"] as const) {
          const w = widget(type, mode);
          await expectGlance(w, true, mode);
          const imported = importText(configOf(w));
          expect(imported.issues.filter((i) => i.severity === "error"), mode).toEqual([]);
          // Every sample value fits its field: nothing kept as-is, no unknown keys.
          expect(imported.report.keptAsIs, mode).toEqual([]);
          expect(imported.report.unknownKeys, mode).toEqual([]);
          const { yaml, placeholderHints } = generate(imported.dashboard!, { glanceVersion: GLANCE_VERSION });
          const again = await validateConfig(yaml, { hints: placeholderHints });
          expect(again.ok, `${mode} after import → generate: ${again.output}\n${yaml}`).toBe(true);
        }
      });

      const fields = walk(widgetFields(type));
      const own = walk(schema.fields);

      it("required fields: Glance rejects the widget without them, and so do our rules", async () => {
        const full = widget(type, "full");
        await Promise.all(own.filter(({ f }) => f.required).map(async ({ f, path }) => {
          const without = setAt(full, path, undefined);
          await expectGlance(without, false, `without ${path.join(".")}`);
          expect(ruleErrors(without).map((i) => i.code), path.join(".")).toContain("field.required");
        }));
      });

      it(`docs-required fields: Glance ${GLANCE_VERSION} accepts the widget without them`, async () => {
        const full = widget(type, "full");
        await Promise.all(own.filter(({ f }) => f.docsRequired).map(({ path }) =>
          expectGlance(setAt(full, path, undefined), true, `without ${path.join(".")}`)));
      });

      it("enums: every option is accepted; another value is rejected only for strict enums", async () => {
        const full = widget(type, "full");
        await Promise.all(own.filter(({ f }) => f.kind === "enum").flatMap(({ f, path }) => [
          ...f.options!.map((o) => expectGlance(setAt(full, path, o), true, `${path.join(".")}: ${o}`)),
          expectGlance(setAt(full, path, "not-an-option"), !f.strict, `${path.join(".")}: not-an-option`),
        ]));
      });

      it("every key is one Glance reads (a wrongly typed value fails)", async () => {
        const full = widget(type, "full");
        // docker-containers `containers` is map[string]map[string]string: any label name is accepted, so its item keys
        // can't be proven this way (they are the documented glance.* labels, docs v0.8.6 "Labels").
        const checkable = fields.filter(({ f, path }) => wrongType(f) !== undefined && !(type === "docker-containers" && path[0] === "containers" && path.length > 2));
        await Promise.all(checkable.map(({ f, path }) => expectGlance(setAt(full, path, wrongType(f)), false, `${path.join(".")} = ${JSON.stringify(wrongType(f))}`)));
      });
    });
  }
});

describe(`cross-field rules match Glance ${GLANCE_VERSION}`, { timeout: 120_000 }, () => {
  const cases: { name: string; widget: Obj; code: string }[] = [
    { name: "reddit request-url-template without {REQUEST-URL}", widget: { type: "reddit", subreddit: "a", "request-url-template": "https://p/?u=" }, code: "reddit.request-url-template" },
    { name: "reddit app-auth with only a name", widget: { type: "reddit", subreddit: "a", "app-auth": { name: "n" } }, code: "reddit.app-auth-incomplete" },
    { name: "reddit search without app-auth (v0.8.8)", widget: { type: "reddit", subreddit: "a", search: "glance" }, code: "reddit.search-needs-app-auth" },
    { name: "releases with an unknown source prefix", widget: { type: "releases", repositories: ["sourceforge:a/b"] }, code: "releases.invalid-source" },
    { name: "releases with an empty line", widget: { type: "releases", repositories: [""] }, code: "releases.empty-repository" },
    { name: "custom-api string body type with a map body", widget: { type: "custom-api", template: "x", url: "https://e/", "body-type": "string", body: { a: 1 } }, code: "custom-api.body-not-string" },
    { name: "group inside a group", widget: { type: "group", widgets: [{ type: "group", widgets: [] }] }, code: "widget.invalid-nesting" },
    { name: "split-column inside a group", widget: { type: "group", widgets: [{ type: "split-column", widgets: [] }] }, code: "widget.invalid-nesting" },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      await expectGlance(c.widget, false, c.name);
      expect(ruleErrors(c.widget).map((i) => i.code)).toContain(c.code);
    });
  }
  it("their valid counterparts pass both", async () => {
    const ok: Obj[] = [
      { type: "reddit", subreddit: "a", "request-url-template": "https://p/?u={REQUEST-URL}", "app-auth": { name: "n", id: "i", secret: "s" }, search: "glance" },
      { type: "releases", repositories: ["gitlab:a/b", "codeberg:a/b", "dockerhub:a/b", "github:a/b", "a/b"] },
      { type: "custom-api", template: "x", url: "https://e/", "body-type": "string", body: "text" },
      { type: "group", widgets: [{ type: "clock" }] },
    ];
    for (const w of ok) {
      await expectGlance(w, true, JSON.stringify(w));
      expect(ruleErrors(w)).toEqual([]);
    }
  });
});

describe("placeholders in checked fields validate with a valid stand-in", () => {
  it("a strict enum, a time zone and a request URL template", async () => {
    const d = importText(configOf(
      { type: "weather", location: "x", units: "${UNITS}", "hour-format": "${HF}" },
      { type: "clock", timezones: [{ timezone: "${TZ}" }] },
      { type: "reddit", subreddit: "a", "request-url-template": "${PROXY}" },
    )).dashboard!;
    expect(checkDashboard(d).filter((i) => i.severity === "error")).toEqual([]);
    const { yaml, placeholderHints } = generate(d, { glanceVersion: GLANCE_VERSION });
    const r = await validateConfig(yaml, { hints: placeholderHints });
    expect(r.ok, r.output).toBe(true);
  });
});

describe("built-in themes (docs/themes.md at the pinned commit)", () => {
  it("are 14 (11 dark, 3 light), fit the theme model, and Glance accepts each one", async () => {
    expect(GLANCE_THEMES.length).toBe(14);
    expect(GLANCE_THEMES.filter((t) => t.light).length).toBe(3);
    await Promise.all(GLANCE_THEMES.map(async (t) => {
      const text = stringify({ theme: t.properties, pages: [{ name: "P", columns: [{ size: "full", widgets: [{ type: "clock" }] }] }] });
      const imported = importText(text);
      expect(imported.report.keptAsIs, t.name).toEqual([]);
      expect(imported.issues.filter((i) => i.severity === "error"), t.name).toEqual([]);
      const r = await validateConfig(text);
      expect(r.ok, `${t.name}: ${r.output}`).toBe(true);
    }));
  });
});
