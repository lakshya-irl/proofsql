import type { RunResult } from "./pipeline";

/** Run History is local-first: these helpers validate everything that enters it (import, legacy storage). */
export type Skipped = { index: number; reason: string };
export type ImportReport = { runs: RunResult[]; skipped: Skipped[] };

const DECISIONS = ["ANSWER", "ANSWER_WITH_WARNING", "CLARIFY", "ABSTAIN", "BLOCKED", "ERROR"];
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Returns a complete RunResult or a reason. Missing optional detail becomes empty, never invented. */
export function normalizeRun(raw: unknown): RunResult | string {
  if (!raw || typeof raw !== "object") return "not an object";
  const r = raw as Partial<Record<keyof RunResult, unknown>>;
  if (!str(r.id)) return "missing run id";
  if (!str(r.question)) return "missing question";
  if (!str(r.timestamp) || Number.isNaN(Date.parse(r.timestamp as string))) return "missing or invalid timestamp";
  if (!DECISIONS.includes(r.decision as string)) return `unknown decision "${String(r.decision)}"`;
  // A BLOCKED run must never carry executable SQL, even from an imported file.
  const sql = r.decision === "BLOCKED" ? null : str(r.sql);
  const result = r.result && typeof r.result === "object" && Array.isArray((r.result as { rows?: unknown }).rows) ? (r.result as RunResult["result"]) : null;
  return {
    id: r.id as string, timestamp: r.timestamp as string, question: r.question as string,
    resolvedQuestion: str(r.resolvedQuestion) ?? (r.question as string), decision: r.decision as RunResult["decision"],
    mode: r.mode === "live" ? "live" : "scripted", plannerLabel: str(r.plannerLabel) ?? "unknown (imported)",
    modelName: str(r.modelName) ?? "unknown", modelStatus: str(r.modelStatus) ?? "unknown",
    datasetName: str(r.datasetName) ?? "unknown", snapshotId: str(r.snapshotId) ?? "unknown",
    metric: str(r.metric), grain: str(r.grain), timeInterpretation: str(r.timeInterpretation),
    sql, params: arr(r.params) as RunResult["params"], tables: arr(r.tables) as string[], columns: arr(r.columns) as string[], joins: arr(r.joins),
    assumptions: arr(r.assumptions) as string[], clarifications: arr(r.clarifications) as string[], suggestions: arr(r.suggestions) as RunResult["suggestions"],
    reason: str(r.reason), recommendedFix: str(r.recommendedFix), blockedReasons: arr(r.blockedReasons) as string[],
    definitions: arr(r.definitions) as RunResult["definitions"], normalizationRules: arr(r.normalizationRules) as string[],
    evidence: arr(r.evidence) as RunResult["evidence"], checks: arr(r.checks) as RunResult["checks"],
    radar: (r.radar as RunResult["radar"]) ?? null, repair: (r.repair as RunResult["repair"]) ?? null,
    result: sql || r.decision !== "BLOCKED" ? result : null,
    executionMs: typeof r.executionMs === "number" ? r.executionMs : null,
    confidence: (r.confidence as RunResult["confidence"]) ?? { level: "Not applicable", reasons: [] },
    limitations: arr(r.limitations) as string[], summary: str(r.summary) ?? "", error: str(r.error),
    joinStatus: (r.joinStatus as RunResult["joinStatus"]) ?? null, liveInference: r.liveInference === true,
    modelLatencyMs: typeof r.modelLatencyMs === "number" ? r.modelLatencyMs : null,
    latencyMs: typeof r.latencyMs === "number" ? r.latencyMs : null,
    errorCode: (r.errorCode as RunResult["errorCode"]) ?? null, developerTrace: str(r.developerTrace),
  };
}

export function parseRuns(text: string): ImportReport {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { runs: [], skipped: [{ index: -1, reason: "file is not valid JSON" }] }; }
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { runs?: unknown }).runs) ? (data as { runs: unknown[] }).runs : null;
  if (!list) return { runs: [], skipped: [{ index: -1, reason: "expected a list of runs or { runs: [...] }" }] };
  const runs: RunResult[] = []; const skipped: Skipped[] = [];
  list.forEach((x, i) => { const n = normalizeRun(x); typeof n === "string" ? skipped.push({ index: i, reason: n }) : runs.push(n); });
  return { runs, skipped };
}

/** Merge imported runs into existing ones: duplicates by id are kept once, newest first. */
export function mergeRuns(existing: RunResult[], incoming: RunResult[], cap = 100): { runs: RunResult[]; duplicates: number } {
  const ids = new Set(existing.map((r) => r.id));
  const fresh = incoming.filter((r) => !ids.has(r.id));
  const runs = [...existing, ...fresh].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, cap);
  return { runs, duplicates: incoming.length - fresh.length };
}

export function exportRuns(runs: RunResult[]): string {
  return JSON.stringify({ format: "proofsql.runs", version: 2, exportedAt: new Date().toISOString(), storage: "local to this browser", runs }, null, 2);
}

export const LEGACY_RUN_KEYS = ["proofsql.runs.v1", "proofsql.runs"];
