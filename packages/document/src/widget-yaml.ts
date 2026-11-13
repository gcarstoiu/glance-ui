// A widget's YAML tab (design D-12): the text to show for one widget, and reading back what the user typed.

import { isMap, isSeq, type Node } from "yaml";
import { GLANCE_VERSION, Widget, type WidgetT } from "@glance-editor/model";
import { serializeYaml, widgetToGlanceJson } from "@glance-editor/generator";
import { widgetFromJson } from "./import.ts";
import { glanceParse, lineStart } from "./text.ts";

export type WidgetYamlResult =
  | { ok: true; widget: WidgetT; notes: string[] }
  | { ok: false; message: string; line: number | null };

let counter = 0;

/**
 * Read one widget from YAML (a map with `type`), the way the importer reads a widget from glance.yml. Placeholders stay
 * as written (D-37). The widget keeps `id`; everything inside it gets fresh ids, so nothing clashes with the rest of the
 * draft (the override is written as typed, so these ids never need to match the file).
 */
export function widgetFromYaml(text: string, id: string): WidgetYamlResult {
  const parsed = glanceParse(text);
  if (parsed.errors.length) {
    const e = parsed.doc.errors[0];
    const offset = e?.pos?.[0];
    const line = offset === undefined ? null : text.slice(0, offset).split("\n").length;
    return { ok: false, message: (e?.message ?? parsed.errors[0]!).split("\n")[0]!, line };
  }
  const json = parsed.json;
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, message: "This should be one widget: a map of keys starting with type, e.g. \"type: clock\".", line: null };
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.type !== "string" || obj.type === "") return { ok: false, message: "The widget needs a type, e.g. \"type: clock\".", line: null };
  const base = `${id}~y${(counter++).toString(36)}${Date.now().toString(36)}`;
  const r = widgetFromJson(obj, id, base);
  const key = (p: string) => (p.startsWith(`${base}.`) ? p.slice(base.length + 1) : p);
  const checked = r.widget ? Widget.safeParse(r.widget) : undefined;
  if (!checked?.success) return { ok: false, message: r.issues[0]?.message ?? "The editor couldn't read this widget.", line: null };
  const notes = [
    ...r.report.unknownKeys.map((k) => `"${key(k)}" isn't a key Glance ${GLANCE_VERSION} uses here; it is kept as written.`),
    ...r.report.keptAsIs.map((k) => `"${key(k.path)}": ${k.reason}; it is kept as written.`),
    ...r.issues.map((i) => i.message),
  ];
  return { ok: true, widget: checked.data, notes };
}

/**
 * The widget's text as it appears in `fileText` (the file a save would write), found by its model path
 * (["pages", 0, "columns", 1, "widgets", 2, …]). Comments inside the widget come along. Null if it isn't there as a
 * block or flow map.
 */
export function widgetTextIn(fileText: string, path: (string | number)[]): string | null {
  const parsed = glanceParse(fileText);
  if (parsed.errors.length) return null;
  const node = parsed.doc.getIn(path, true) as Node | undefined;
  if (!node || !(isMap(node) || isSeq(node)) || !node.range) return null;
  if (!isMap(node)) return null;
  const [start, end] = node.range;
  const col = start - lineStart(fileText, start);
  const lines = fileText.slice(start, end).split("\n").map((l, i) => (i === 0 ? l : l.slice(Math.min(col, l.length - l.trimStart().length))));
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.join("\n") + "\n";
}

/** The widget as YAML when there's no file text for it (Start empty, or a new widget): the generator's encoding. */
export function widgetYaml(w: WidgetT): string {
  if (w._yaml) return w._yaml.text;
  return serializeYaml(widgetToGlanceJson(w));
}
