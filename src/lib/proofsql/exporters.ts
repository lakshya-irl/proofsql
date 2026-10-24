import type { RunResult } from "./pipeline";

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const toJson = (r: RunResult) => JSON.stringify(r, null, 2);

export function toCsv(r: RunResult): string {
  if (!r.result) return "";
  const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [r.result.columns.join(","), ...r.result.rows.map((row) => r.result!.columns.map((c) => esc(row[c])).join(","))].join("\n");
}

export function toMarkdown(r: RunResult): string {
  const l: string[] = [
    `# ProofSQL Proof Card — ${r.decision}`, "",
    `- **Original question:** ${r.question}`, `- **Resolved question:** ${r.resolvedQuestion}`,
    `- **Dataset:** ${r.datasetName} (${r.snapshotId})`, `- **Planner:** ${r.plannerLabel}`, `- **Model status:** ${r.modelStatus}`,
    `- **Definitions:** ${r.definitions.map((d) => `${d.title} v${d.version} (${d.status})`).join(", ") || "none"}`,
    `- **Metric:** ${r.metric ?? "—"} · **Grain:** ${r.grain ?? "—"} · **Time:** ${r.timeInterpretation ?? "—"}`,
    `- **Confidence:** ${r.confidence.level}`, `- **Execution time:** ${r.executionMs ?? "—"} ms`, "",
    "## Summary", r.summary, "",
  ];
  if (r.sql) l.push("## SQL", "```sql", r.sql, "```", `Bound parameters: ${JSON.stringify(r.params)}`, "");
  if (r.assumptions.length) l.push("## Assumptions", ...r.assumptions.map((a) => `- ${a}`), "");
  if (r.normalizationRules.length) l.push("## Normalization rules", ...r.normalizationRules.map((a) => `- ${a}`), "");
  l.push("## Validation checks", ...r.checks.map((c) => `- **${c.state}** ${c.name}: ${c.detail}`), "");
  if (r.evidence.length) l.push("## Evidence", ...r.evidence.map((e) => `- **${e.state}** ${e.label}: ${e.detail}`), "");
  if (r.radar) l.push("## Join safety", `**${r.radar.state}** ${r.radar.title}. ${r.radar.explanation}`, "");
  if (r.repair) l.push("## Repaired SQL", "```sql", r.repair.repairedSql, "```", ...r.repair.totals.map((t) => `- ${t.column}: risky ${t.risky} vs repaired ${t.repaired}`), "");
  if (r.blockedReasons.length) l.push("## Blocked reasons", ...r.blockedReasons.map((b) => `- ${b}`), "");
  l.push("## Known limitations", ...r.limitations.map((x) => `- ${x}`));
  return l.join("\n");
}
