import { GLANCE_VERSION, type Issue } from "@glance-editor/model";
import type { ImportReport } from "./import.ts";

/** Human-readable import report (Markdown). Placeholder values are never shown: they are never resolved (D-37). */
export function formatReport(r: ImportReport, issues: Issue[]): string {
  const lines: string[] = ["# Import report", ""];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  lines.push(errors.length ? `**${errors.length} problem(s) must be fixed before the first save.**` : "No problems block saving.", "");
  lines.push(`- Pages: ${r.pages}`, `- Widgets: ${r.widgets} (${Object.entries(r.widgetsByType).map(([t, n]) => `${t} ×${n}`).join(", ") || "none"})`);
  if (r.rawWidgetTypes.length) lines.push(`- Kept as YAML (no form yet): ${r.rawWidgetTypes.join(", ")}`);
  lines.push(`- Comments: ${r.comments} (kept next to their values)`);
  if (r.anchors || r.aliases) lines.push(`- YAML anchors: ${r.anchors}, aliases: ${r.aliases} (kept unless the value they're on is edited)`);
  if (r.includes.length) lines.push(`- Included files merged into glance.yml on first save (D-36): ${r.includes.join(", ")}`);
  if (r.placeholders.length) lines.push(`- Placeholders kept as written: ${r.placeholders.map((p) => `\`${p.text}\`${p.count > 1 ? ` ×${p.count}` : ""}`).join(", ")}`);
  if (r.unknownKeys.length) lines.push(`- Keys Glance ${GLANCE_VERSION} doesn't use (kept, but Glance ignores them): ${r.unknownKeys.map((k) => `\`${k}\``).join(", ")}`);
  if (r.keptAsIs.length) lines.push(`- Values kept as-is (editable in YAML only): ${r.keptAsIs.map((k) => `\`${k.path}\` (${k.reason})`).join(", ")}`);
  for (const [title, list] of [["Problems", errors], ["Warnings", warnings]] as const) {
    if (!list.length) continue;
    lines.push("", `## ${title}`, ...list.map((i) => `- \`${i.path.join(".") || "(file)"}\`: ${i.message}`));
  }
  return lines.join("\n") + "\n";
}
