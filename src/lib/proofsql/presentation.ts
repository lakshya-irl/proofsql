import type { RunResult } from "./pipeline";
import type { Mode } from "./pipeline";
import type { PlannerReadiness } from "./readiness";

/** Presentation only: recorded provider/model evidence is never changed. */
export function processingStatus(mode: Mode, readiness: PlannerReadiness): string {
  if (mode === "scripted") return "Preset questions · no AI interpretation";
  if (readiness.eligibleForLive) return "Question processing verified";
  if (readiness.transport === "pass") return "Connection available · question processing not verified";
  return "Question processing unavailable";
}

export function withoutModelNames(text: string, identities: (string | null | undefined)[]): string {
  return identities.filter((identity): identity is string => Boolean(identity) && identity !== "unknown")
    .sort((a, b) => b.length - a.length)
    .reduce((value, identity) => value.split(identity).join("configured service"), text);
}

export const columnLabel = (column: string) => ({ confirmed: "Reported cases", deaths: "Reported deaths", recovered: "Reported recoveries", country: "Country", month: "Month", start_value: "Starting total", end_value: "Ending total", change: "Difference" }[column] ?? column.replace(/_/g, " "));
export function displayValue(value: unknown): string {
  if (value == null) return "Not reported";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return String(value);
}
export function simpleAnswer(run: RunResult): string {
  if (!run.datasetName.includes("COVID") || !run.result?.rows.length) return run.summary || run.error || "No answer available.";
  const first = run.result.rows[0];
  if (!first) return run.summary;
  const measure = columnLabel(run.metric ?? "confirmed").toLowerCase();
  if (run.result.columns.includes("change")) {
    const change = first["change"];
    if (typeof change !== "number") return run.summary;
    const [from, to] = (run.timeInterpretation ?? "").split(" → ");
    return `${first["country"]}'s ${measure} ${change < 0 ? "decreased" : "increased"} by ${displayValue(Math.abs(change))} between ${displayValue(from)} and ${displayValue(to)}.`;
  }
  if (run.result.rows.length === 1 && first["country"] != null) return `${first["country"]} reported a total of ${displayValue(first[run.metric ?? "confirmed"])} ${measure.replace("reported ", "")} by the last available day of ${displayValue(first["month"])}.`;
  return `These ${run.result.rows.length} countries had the highest ${measure} in ${displayValue(run.timeInterpretation)}. ${first["country"]} had the highest total: ${displayValue(first[run.metric ?? "confirmed"])}.`;
}