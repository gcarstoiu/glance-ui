// Phase 6: a widget's YAML tab (design D-12) and "My colours" (D-51), through the Editor and the real Glance binary.
// Plan v2 acceptance: "A YAML override round-trips unknown keys."
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GLANCE_VERSION, type DashboardT, type ModelWidgetT, type WidgetT } from "@glance-editor/model";
import { Editor } from "../src/index.ts";
import { open, setup, type Setup } from "./helpers.ts";

const COMMENTED = "test/fixtures/import/commented.yml";
const editors: Editor[] = [];
const track = async (s: Setup) => { const e = await open(s); editors.push(e); return e; };
afterEach(() => { while (editors.length) editors.pop()!.close(); });

const draftOf = async (e: Editor) => structuredClone((await e.state()).draft!) as DashboardT;
const full = (d: DashboardT) => d.pages[0]!.columns[1]!.widgets;

/** What the client does on Apply: the parsed widget, plus the override (text, and the form values to go back to). */
function applyOverride(d: DashboardT, e: Editor, id: string, text: string) {
  const list = full(d);
  const i = list.findIndex((w) => w._id === id);
  const before = list[i]!;
  const r = e.parseWidgetYaml(text, id);
  if (!r.ok) throw new Error(r.message);
  list[i] = { ...r.widget, _yaml: { text, form: JSON.stringify(before) } } as WidgetT;
  return r;
}

async function imported() {
  const s = setup(COMMENTED);
  const e = await track(s);
  await e.importLive();
  return { s, e };
}

describe("YAML tab text (D-12: shows exactly what will be written)", () => {
  it("an imported widget shows its text from the file, comments inside it included", async () => {
    const { e } = await imported();
    const d = await draftOf(e);
    const weather = full(d).find((w) => w.type === "weather")!;
    expect(e.widgetText(weather._id)).toBe('type: weather\nlocation: London, United Kingdom\nunits: metric # alternatively "imperial"\n');
  });

  it("an edited widget shows the edited text; a new widget shows the generated text", async () => {
    const { e } = await imported();
    const d = await draftOf(e);
    const weather = full(d).find((w) => w.type === "weather") as ModelWidgetT;
    weather.location = "Paris, France";
    full(d).push({ _id: "w-new", type: "reddit", subreddit: "selfhosted" } as WidgetT);
    expect(e.setDraft(d).ok).toBe(true);
    expect(e.widgetText(weather._id)).toBe('type: weather\nlocation: Paris, France\nunits: metric # alternatively "imperial"\n');
    expect(e.widgetText("w-new")).toBe("type: reddit\nsubreddit: selfhosted\n");
    expect(e.widgetText("no-such-widget")).toBeNull();
  });

  it("placeholders and escapes are shown as written (D-37)", async () => {
    const { e } = await imported();
    const d = await draftOf(e);
    const html = full(d).find((w) => w.type === "html")!;
    expect(e.widgetText(html._id)).toBe('type: html\ntitle: "Escaped: \\${NOT_A_VAR}"\nsource: |\n  <p>Notes</p>\n  <p>${GREETING}</p>\n');
  });
});

describe("YAML override (D-12, D-14)", () => {
  it("round-trips unknown keys, comments and placeholders: written as typed, then read back on the next import", async () => {
    const { s, e } = await imported();
    const d = await draftOf(e);
    const weather = full(d).find((w) => w.type === "weather")!;
    const text = "# typed in the YAML tab\ntype: weather\nlocation: ${WEATHER_CITY} # from the environment\nunits: imperial\nfuture-option: 3 # unknown to v0.8.6\n";
    const r = applyOverride(d, e, weather._id, text);
    expect(r.notes).toEqual([`"future-option" isn't a key Glance ${GLANCE_VERSION} uses here; it is kept as written.`]);
    const set = e.setDraft(d);
    expect(set.ok).toBe(true);
    expect(e.widgetText(weather._id)).toBe(text);
    const saved = await e.save();
    expect(saved).toMatchObject({ status: "saved", warnings: [] });
    const live = s.live();
    expect(live).toContain(
      "          # weather below\n          - # typed in the YAML tab\n            type: weather\n            location: ${WEATHER_CITY} # from the environment\n            units: imperial\n            future-option: 3 # unknown to v0.8.6\n",
    );
    // Everything else in the file is untouched.
    expect(live).toContain("          - type: rss\n            limit: ${RSS_LIMIT}\n");
    // After the save the widget is back in the form, with the unknown key kept for the next save.
    const after = full((await draftOf(e))).find((w) => w.type === "weather") as ModelWidgetT;
    expect(after._yaml).toBeUndefined();
    expect(after).toMatchObject({ location: "${WEATHER_CITY}", units: "imperial", extra: { "future-option": 3 } });
  });

  it("an override with the same content as the file is not a change", async () => {
    const { e } = await imported();
    const d = await draftOf(e);
    const weather = full(d).find((w) => w.type === "weather")!;
    applyOverride(d, e, weather._id, e.widgetText(weather._id)!);
    expect(e.setDraft(d)).toMatchObject({ ok: true, changes: [] });
  });

  it("a group override keeps its children's text, and its children get ids that clash with nothing", async () => {
    const s = setup();
    mkdirSync(dirname(s.configPath), { recursive: true });
    const e = await track(s);
    await e.startEmpty("Home", "one-full");
    const d = await draftOf(e);
    d.pages[0]!.columns[0]!.widgets.push({ _id: "g1", type: "group", widgets: [] } as WidgetT);
    const text = "type: group\nwidgets:\n  - type: clock # first tab\n  - type: rss\n    feeds:\n      - url: https://example.com/feed.xml\n";
    const r = e.parseWidgetYaml(text, "g1");
    if (!r.ok) throw new Error(r.message);
    const kids = (r.widget as ModelWidgetT).widgets!;
    expect(kids.map((k) => k.type)).toEqual(["clock", "rss"]);
    expect(new Set([r.widget._id, ...kids.map((k) => k._id)]).size).toBe(3);
    d.pages[0]!.columns[0]!.widgets[0] = { ...r.widget, _yaml: { text, form: "{}" } } as WidgetT;
    expect(e.setDraft(d).ok).toBe(true);
    expect(await e.save()).toMatchObject({ status: "saved" });
    expect(s.live()).toContain("        widgets:\n          - type: group\n            widgets:\n              - type: clock # first tab\n              - type: rss\n");
  });

  it("YAML that doesn't parse, isn't a map, or has no type is refused with a reason (nothing is applied)", async () => {
    const { e } = await imported();
    expect(e.parseWidgetYaml("type: clock\nhour-format: 24h\n  bad: x\n", "w")).toMatchObject({ ok: false, line: 2 });
    expect(e.parseWidgetYaml("- type: clock\n", "w")).toMatchObject({ ok: false, message: expect.stringMatching(/one widget/) });
    expect(e.parseWidgetYaml("title: x\n", "w")).toMatchObject({ ok: false, message: expect.stringMatching(/needs a type/) });
  });

  it("a value that doesn't fit its field is kept as written and Glance's validator still judges it at save", async () => {
    const { s, e } = await imported();
    const d = await draftOf(e);
    const weather = full(d).find((w) => w.type === "weather")!;
    const r = applyOverride(d, e, weather._id, "type: weather\nlocation: Oslo\nunits: kelvin\n");
    expect(r.notes).toEqual([expect.stringMatching(/^"units": "kelvin" isn't a value the editor can edit here/)]);
    expect(e.setDraft(d).ok).toBe(true);
    const before = s.live();
    const saved = await e.save();
    expect(saved).toMatchObject({ status: "problems", problems: [{ source: "glance", location: { widgetIds: [weather._id] } }] });
    expect(s.live()).toBe(before);
  });
});

describe("my colours (D-51)", () => {
  it("are stored by the editor, survive a restart, and never reach glance.yml", async () => {
    const s = setup();
    const e = await track(s);
    expect(e.colours()).toEqual([]);
    expect(e.setColours(["200 50 60", "10 70 50", "200 50 60"])).toEqual(["200 50 60", "10 70 50"]);
    e.close();
    editors.pop();
    const again = await track(s);
    expect(again.colours()).toEqual(["200 50 60", "10 70 50"]);
  });

  it("refuses anything but H S L values in range", async () => {
    const e = await track(setup());
    expect(() => e.setColours(["361 0 0"])).toThrow(/H S L/);
    expect(() => e.setColours(["hsl(1, 2%, 3%)"])).toThrow();
    expect(() => e.setColours("200 50 60")).toThrow();
  });
});
