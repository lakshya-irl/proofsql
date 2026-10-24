// COVID-19 decision pipeline: guard → (live model picks a question shape) → deterministic SQL → AST firewall → execute.
// Produces the same RunResult as the school pipeline so Proof Card, Run History and exports work unchanged.
import type { Database, SqlValue } from "sql.js";
import { checkSql, type AllowedSchema, type Check } from "./firewall";
import { COVID_SOURCE, interpretModelOutput, planCovid, type CovidPlan, type CovidQuestion } from "./covid";
import { ROW_LIMIT, type Evidence, type LiveResponse, type Mode, type RunResult } from "./pipeline";

export const COVID_DATASET_NAME = "COVID-19 country totals (JHU CSSE, monthly)";
export const COVID_SNAPSHOT_ID = "covid-monthly-2022-04-16";
export const COVID_SCHEMA: AllowedSchema = {
  tables: ["covid_monthly"],
  columns: new Set(["country", "month", "as_of_date", "confirmed", "deaths", "recovered", "start_value", "end_value", "change"]),
};
export const COVID_DEFINITIONS = [
  { key: "cumulative", title: "Cumulative total", meaning: "Confirmed / deaths / recovered are running totals as reported on the last reported day of each month.", expression: "value at MAX(date) within month", grain: "country × month" },
  { key: "change", title: "Change between months", meaning: "End-month total minus start-month total for one country.", expression: "b.metric - a.metric", grain: "country" },
  { key: "missing", title: "Missing is not zero", meaning: "Recoveries after 2021-07 were not reported; they are missing and questions about them abstain.", expression: "recovered IS NULL → ABSTAIN", grain: "country × month" },
] as const;

/** Deterministic guards that run before any model call. */
export function covidPrecheck(q: string): { decision: "BLOCKED" | "ABSTAIN"; reason: string } | null {
  const s = q.toLowerCase();
  if (/\b(delete|drop|update|insert|alter|truncate|attach|pragma|remove all|wipe)\b/.test(s)) return { decision: "BLOCKED", reason: "Modifying or deleting data is not permitted; ProofSQL is read-only." };
  if (/\b(forecast|predict|will (have|be)|next (year|month|week)|future|projection)\b/.test(s)) return { decision: "ABSTAIN", reason: "Forecasts are not supported; the data ends on 2022-04-16 and contains no model of future cases." };
  if (/\b(why|caused?|because of|reason for|due to)\b/.test(s)) return { decision: "ABSTAIN", reason: "Causes cannot be established from case counts alone; the data has no causal variables." };
  return null;
}

export type CovidInput = {
  question: string; db: Database; countries: string[]; mode: Mode; modelStatus: string;
  menu?: CovidQuestion; livePlanner?: ((q: string) => Promise<LiveResponse>) | undefined;
};

const uid = () => `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function base(i: CovidInput): RunResult {
  return {
    id: uid(), timestamp: new Date().toISOString(), question: i.question, resolvedQuestion: i.question, decision: "ERROR",
    mode: i.mode, plannerLabel: "", modelName: "none used for this run", modelStatus: i.modelStatus,
    datasetName: COVID_DATASET_NAME, snapshotId: COVID_SNAPSHOT_ID, metric: null, grain: "country × month", timeInterpretation: null,
    sql: null, params: [], tables: [], columns: [], joins: [], assumptions: [], clarifications: [], suggestions: [],
    reason: null, recommendedFix: null, blockedReasons: [], definitions: [], normalizationRules: ["Month = last reported day of the calendar month."],
    evidence: [], checks: [], radar: null, repair: null, result: null, executionMs: null,
    confidence: { level: "Not applicable", reasons: [] }, limitations: [`Source: ${COVID_SOURCE}`, "Query cancellation: NOT CHECKED."],
    summary: "", error: null, joinStatus: null, liveInference: false, modelLatencyMs: null, latencyMs: null, errorCode: null, developerTrace: null,
  };
}

const describe = (q: CovidQuestion) => q.kind === "top" ? `Top ${q.n} countries by ${q.metric} in ${q.month}`
  : q.kind === "change" ? `Change in ${q.metric} for ${q.country} from ${q.from} to ${q.to}` : `${q.metric} for ${q.country} in ${q.month}`;

function applyPlan(r: RunResult, plan: CovidPlan, q: CovidQuestion | null, db: Database): RunResult {
  if (q) { r.resolvedQuestion = describe(q); r.metric = q.metric; r.timeInterpretation = q.kind === "change" ? `${q.from} → ${q.to}` : q.month; }
  if (plan.decision !== "ANSWER") {
    r.decision = plan.decision === "ERROR" ? "ERROR" : plan.decision;
    r.reason = plan.reason; r.summary = plan.reason;
    if (plan.decision === "CLARIFY") r.clarifications = [plan.reason];
    if (plan.decision === "ABSTAIN") r.recommendedFix = "Ask about confirmed cases or deaths, or a month up to 2021-07 for recoveries.";
    if (plan.decision === "ERROR") { r.error = plan.reason; r.errorCode = "UNSUPPORTED_PLAN"; }
    return r;
  }
  const fw = checkSql(plan.sql, COVID_SCHEMA);
  r.checks = [...fw.checks];
  r.tables = fw.tables; r.columns = fw.columns;
  if (!fw.allowed) { r.decision = "ERROR"; r.errorCode = "SQL_AST_REJECTED"; r.error = `Compiled SQL was rejected: ${fw.reasons.join(" ")} Nothing was executed.`; r.summary = r.error; return r; }
  r.sql = plan.sql; r.params = plan.params;
  const t = performance.now();
  const out = db.exec(plan.sql, plan.params)[0];
  r.executionMs = Math.round((performance.now() - t) * 10) / 10;
  const columns = out?.columns ?? [];
  const all = (out?.values ?? []).map((v) => Object.fromEntries(columns.map((c, k) => [c, v[k] as SqlValue])));
  r.result = { columns, rows: all.slice(0, ROW_LIMIT), truncated: all.length > ROW_LIMIT };
  const checks: Check[] = [{ name: "Row limit", state: "PASS", detail: `≤ ${ROW_LIMIT} rows returned.` },
    { name: "Join safety", state: "PASS", detail: q?.kind === "change" ? "Self-join on country with one row per country-month (1:1)." : "No joins." }];
  r.checks.push(...checks);
  const missing = all.some((row) => Object.values(row).some((v) => v === null));
  const ev: Evidence[] = plan.warnings.map((w) => ({ label: "Data note", state: "WARNING", detail: w }));
  if (missing) ev.push({ label: "Missing values", state: "WARNING", detail: "Some values are missing and are shown as missing, not zero." });
  r.evidence = ev;
  r.assumptions = plan.warnings;
  r.decision = all.length === 0 ? "ABSTAIN" : ev.some((e) => e.detail.includes("partial") || e.label === "Missing values") ? "ANSWER_WITH_WARNING" : "ANSWER";
  if (all.length === 0) { r.reason = "No matching row was reported for this country and month."; r.summary = r.reason; r.sql = plan.sql; return r; }
  const first = all[0]!;
  const val = q?.kind === "change" ? first["change"] : q ? first[q.metric] : null;
  r.summary = q?.kind === "top" ? `${r.resolvedQuestion}: ${all.map((x) => x["country"]).slice(0, 5).join(", ")}${all.length > 5 ? "…" : ""}.`
    : `${r.resolvedQuestion}: ${val === null || val === undefined ? "missing" : Number(val).toLocaleString()}.`;
  r.confidence = r.decision === "ANSWER" ? { level: "High confidence", reasons: ["Firewall passed; single-row lookup on reported totals."] } : { level: "Review required", reasons: ev.map((e) => e.detail) };
  return r;
}

export async function runCovidPipeline(i: CovidInput): Promise<RunResult> {
  const t0 = performance.now();
  const r = base(i);
  const guard = i.menu ? null : covidPrecheck(i.question);
  if (guard) {
    r.plannerLabel = "No live model inference — deterministic safety/answerability guard";
    r.decision = guard.decision; r.reason = guard.reason; r.summary = guard.reason;
    if (guard.decision === "BLOCKED") { r.blockedReasons = [guard.reason]; r.checks = [{ name: "Read-only policy", state: "FAIL", detail: "Destructive request; SQL withheld." }]; }
  } else if (i.menu) {
    r.plannerLabel = "Menu question — no AI used";
    applyPlan(r, planCovid(i.menu), i.menu, i.db);
  } else if (!i.livePlanner) {
    r.plannerLabel = "Scripted · no live model inference";
    r.decision = "CLARIFY"; r.reason = "Free-text COVID questions need the live model. Use the question menu, or switch to live mode in Settings.";
    r.summary = r.reason; r.clarifications = [r.reason];
  } else {
    try {
      const res = await i.livePlanner(i.question);
      r.liveInference = true; r.modelName = res.modelName; r.modelLatencyMs = res.latencyMs;
      r.plannerLabel = `Live · ${res.modelName}`;
      const { question, plan } = interpretModelOutput(res.content, i.countries);
      applyPlan(r, plan, question, i.db);
    } catch (e) {
      r.decision = "ERROR"; r.errorCode = "PROVIDER_HTTP_ERROR"; r.plannerLabel = "Live model call failed";
      r.error = "The model call failed. Nothing was executed; you can retry."; r.summary = r.error;
      r.developerTrace = String(e instanceof Error ? e.message : e).replace(/(bearer\s+)\S+/gi, "$1[redacted]").slice(0, 500);
    }
  }
  r.latencyMs = Math.round(performance.now() - t0);
  return r;
}

export type CovidHealth = {
  rows: number; countries: number; months: { first: string; last: string; count: number };
  columns: { name: string; nulls: number; negatives: number }[];
  duplicates: number; decreasing: number; warnings: { title: string; detail: string; sql: string }[];
};

/** Every number is computed from the loaded COVID database. */
export function scanCovidHealth(db: Database): CovidHealth {
  const one = (sql: string) => db.exec(sql)[0]?.values[0] ?? [];
  const [rows, countries] = one("SELECT COUNT(*), COUNT(DISTINCT country) FROM covid_monthly") as number[];
  const [first, last, count] = one("SELECT MIN(month), MAX(month), COUNT(DISTINCT month) FROM covid_monthly") as [string, string, number];
  const columns = ["confirmed", "deaths", "recovered"].map((c) => {
    const [n, neg] = one(`SELECT COUNT(*) - COUNT(${c}), SUM(CASE WHEN ${c} < 0 THEN 1 ELSE 0 END) FROM covid_monthly`) as number[];
    return { name: c, nulls: Number(n ?? 0), negatives: Number(neg ?? 0) };
  });
  const dupSql = "SELECT country, month, COUNT(*) AS copies FROM covid_monthly GROUP BY country, month HAVING COUNT(*) > 1";
  const duplicates = Number(one(`SELECT COUNT(*) FROM (${dupSql})`)[0] ?? 0);
  const decSql = "SELECT b.country, a.month AS prev_month, b.month, a.confirmed AS prev, b.confirmed FROM covid_monthly a JOIN covid_monthly b ON b.country = a.country AND b.month = (SELECT MIN(month) FROM covid_monthly WHERE month > a.month) WHERE b.confirmed < a.confirmed";
  const decreasing = Number(one(`SELECT COUNT(*) FROM (${decSql})`)[0] ?? 0);
  const warnings: CovidHealth["warnings"] = [];
  const rec = columns.find((c) => c.name === "recovered")!;
  if (rec.nulls) warnings.push({ title: `recovered: ${rec.nulls} missing values`, detail: "Recoveries stopped being reported after 2021-07. Missing is kept as missing, never zero.", sql: "SELECT country, month FROM covid_monthly WHERE recovered IS NULL LIMIT 50" });
  for (const c of columns) if (c.name !== "recovered" && c.nulls) warnings.push({ title: `${c.name}: ${c.nulls} missing values`, detail: "Kept as missing.", sql: `SELECT * FROM covid_monthly WHERE ${c.name} IS NULL LIMIT 50` });
  if (decreasing) warnings.push({ title: `${decreasing} month-to-month decreases in a cumulative total`, detail: "Cumulative counts should never fall; these are source revisions. Changes can be negative.", sql: decSql + " LIMIT 50" });
  if (duplicates) warnings.push({ title: `${duplicates} duplicate country-month rows`, detail: "More than one row for the same country and month.", sql: dupSql });
  warnings.push({ title: `${last} is a partial month`, detail: "The source ends on 2022-04-16.", sql: `SELECT country, as_of_date FROM covid_monthly WHERE month = '${last}' LIMIT 50` });
  return { rows: Number(rows), countries: Number(countries), months: { first, last, count: Number(count) }, columns, duplicates, decreasing, warnings };
}
