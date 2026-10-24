// The decision pipeline: plan → validate → firewall → join radar → execute → evidence → proof card.
import type { Database, SqlValue } from "sql.js";
import { runQuery } from "./db";
import { checkSql, type Check } from "./firewall";
import { joinRadar, type JoinStatus, type RadarResult } from "./joinRadar";
import { PlanSchema, SCRIPTED_UNSUPPORTED, scriptedPlan, type Plan, type ScriptedCase, type Suggestion } from "./planner";
import { LivePlanSchema, compileLivePlan, precheck, type ErrorCode } from "./livePlan";
import { current, type Contract, type DefKey, type DefVersion } from "./contract";
import { DATASET_NAME, SNAPSHOT_ID, YEAR_RULES, allColumns, tableNames } from "./schema";
import type { QueryExecutor } from "./queryExecution";

export type Decision = "ANSWER" | "ANSWER_WITH_WARNING" | "CLARIFY" | "ABSTAIN" | "BLOCKED" | "ERROR";
export type Mode = "scripted" | "live";
export const isAnswer = (d: Decision) => d === "ANSWER" || d === "ANSWER_WITH_WARNING";

/** Payload sent to the server-side analyze-question function. Contains no secrets. */
export type LiveRequest = {
  question: string; mode: Mode; profile: string; schema: string;
  definitions: { title: string; version: number; meaning: string; expression: string; grain: string }[];
  candidates: Record<string, string[]>;
};
export type LiveResponse = { content: string; latencyMs: number; modelName: string };
export type Evidence = { label: string; state: "PASS" | "WARNING"; detail: string };
export type Repaired = {
  riskySql: string; repairedSql: string; explanation: string;
  totals: { column: string; risky: number | null; repaired: number | null }[];
  multiplicity: string;
};
export type RunResult = {
  id: string; timestamp: string; question: string; resolvedQuestion: string; decision: Decision;
  mode: Mode; plannerLabel: string; modelName: string; modelStatus: string;
  datasetName: string; snapshotId: string;
  metric: string | null; grain: string | null; timeInterpretation: string | null;
  sql: string | null; params: (string | number)[]; tables: string[]; columns: string[]; joins: unknown[];
  assumptions: string[]; clarifications: string[]; suggestions: Suggestion[];
  reason: string | null; recommendedFix: string | null; blockedReasons: string[];
  definitions: DefVersion[]; normalizationRules: string[];
  evidence: Evidence[]; checks: Check[]; radar: RadarResult | null; repair: Repaired | null;
  result: { columns: string[]; rows: Record<string, SqlValue>[]; truncated: boolean } | null;
  executionMs: number | null; confidence: { level: "High confidence" | "Review required" | "Insufficient evidence" | "Not applicable"; reasons: string[] };
  limitations: string[]; summary: string; error: string | null;
  joinStatus: JoinStatus | null; liveInference: boolean; modelLatencyMs: number | null; latencyMs: number | null;
  errorCode?: ErrorCode | null; developerTrace?: string | null;
};

export const ROW_LIMIT = 200;

const redact = (s: string) => s.replace(/(bearer\s+)\S+/gi, "$1[redacted]").replace(/\b(sk|AIza|sb_secret)[-_A-Za-z0-9]{8,}/g, "[redacted]").slice(0, 2000);
function fail(r: RunResult, code: ErrorCode, message: string, trace?: string): RunResult {
  r.decision = "ERROR"; r.errorCode = code; r.sql = null; r.result = null;
  r.error = `${message} (code ${code}). Nothing was executed; you can retry.`;
  r.summary = r.error;
  r.developerTrace = trace ? redact(trace) : null;
  return r;
}

export type PipelineInput = {
  question: string; mode: Mode; contract: Contract; db: Database;
  modelName: string; modelStatus: string;
  livePlanner?: ((req: LiveRequest) => Promise<LiveResponse>) | undefined;
  execute?: QueryExecutor; signal?: AbortSignal;
};

const uid = () => `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function confidenceOf(checks: Check[], evidence: Evidence[]): RunResult["confidence"] {
  const fails = checks.filter((c) => c.state === "FAIL");
  const warns = [...checks.filter((c) => c.state === "WARNING").map((c) => c.detail), ...evidence.filter((e) => e.state === "WARNING").map((e) => e.detail)];
  if (fails.length) return { level: "Insufficient evidence", reasons: fails.map((f) => `${f.name}: ${f.detail}`) };
  if (warns.length) return { level: "Review required", reasons: warns };
  return { level: "High confidence", reasons: ["All executed checks passed; see NOT CHECKED items for limits."] };
}

function defsFor(plan: Plan, declared: DefKey[] | null): DefKey[] {
  if (declared) return declared;
  const out: DefKey[] = [];
  const m = (plan.metric ?? "").toLowerCase();
  if (m.includes("enrol")) out.push("enrolment");
  if (m.includes("payment")) out.push("payment_total");
  if (plan.time_interpretation && /academic/i.test(plan.time_interpretation)) out.push("academic_year");
  return out;
}

function liveRequest(db: Database, question: string, mode: Mode, contract: Contract): LiveRequest {
  const vals = (sql: string) => runQuery(db, sql).rows.map((r) => String(Object.values(r)[0] ?? "NULL"));
  const counts = ["districts", "schools", "enrolments", "payments"].map((t) => `${t}: ${runQuery(db, `SELECT COUNT(*) AS n FROM ${t}`).rows[0]?.["n"]} rows`).join("; ");
  return {
    question, mode,
    profile: `${DATASET_NAME} (${SNAPSHOT_ID}). ${counts}. Known issues: mixed academic-year formats, duplicates, NULL keys, sentinel statuses, one-to-many fan-out between enrolments and payments via schools.`,
    schema: [
      "districts(district_code TEXT, district_name TEXT)",
      "schools(school_id INTEGER, school_name TEXT, district_code TEXT, school_status TEXT)",
      "enrolments(enrolment_id INTEGER, school_id INTEGER, student_id TEXT, academic_year TEXT, student_status TEXT, enrolment_count INTEGER)",
      "payments(payment_id INTEGER, school_id INTEGER, academic_year TEXT, amount REAL, payment_status TEXT)",
    ].join("\n"),
    definitions: (["enrolment", "payment_total", "academic_year"] as DefKey[]).map((k) => current(contract, k)).filter((d) => d.status === "APPROVED")
      .map((d) => ({ title: d.title, version: d.version, meaning: d.meaning, expression: d.expression, grain: d.grain })),
    candidates: {
      district_code: vals("SELECT DISTINCT district_code FROM districts"),
      district_name: vals("SELECT DISTINCT district_name FROM districts"),
      student_status: vals("SELECT DISTINCT student_status FROM enrolments"),
      payment_status: vals("SELECT DISTINCT payment_status FROM payments"),
      academic_year: vals("SELECT DISTINCT academic_year FROM enrolments"),
    },
  };
}

export async function runPipeline(input: PipelineInput): Promise<RunResult> {
  const t0 = performance.now();
  const r = await runInner(input);
  r.latencyMs = Math.round(performance.now() - t0);
  return r;
}

async function runInner(input: PipelineInput): Promise<RunResult> {
  const { question, mode, contract, db } = input;
  const r: RunResult = {
    id: uid(), timestamp: new Date().toISOString(), question, resolvedQuestion: question, decision: "ERROR",
    mode, plannerLabel: mode === "scripted" ? "Scripted planner — no live model inference" : `Live model: ${input.modelName}`,
    modelName: input.modelName, modelStatus: input.modelStatus, datasetName: DATASET_NAME, snapshotId: SNAPSHOT_ID,
    metric: null, grain: null, timeInterpretation: null, sql: null, params: [], tables: [], columns: [], joins: [],
    assumptions: [], clarifications: [], suggestions: [], reason: null, recommendedFix: null, blockedReasons: [],
    definitions: [], normalizationRules: [], evidence: [], checks: [], radar: null, repair: null, result: null,
    executionMs: null, confidence: { level: "Not applicable", reasons: [] },
    limitations: [
      "Validated against a small synthetic fixture; does not prove generalization.",
      "Join safety covers the demo schema's one-to-many paths only.",
      "Correlation in historical records is not causation.",
    ],
    summary: "", error: null,
    joinStatus: null, liveInference: false, modelLatencyMs: null, latencyMs: null,
  };
  const checks = r.checks;
  const actualTables = new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map((v) => String(v[0])) ?? []);
  const absent = tableNames().filter((t) => !actualTables.has(t));
  if (absent.length) {
    r.decision = "CLARIFY"; r.errorCode = "SCHEMA_CHANGED";
    r.reason = `Schema changed: missing ${absent.join(", ")}. Available tables: ${[...actualTables].join(", ")}. Confirm a table mapping before querying; no automatic rename was applied.`;
    r.clarifications = [r.reason]; r.summary = r.reason;
    checks.push({ name: "Runtime schema matches contract", state: "FAIL", detail: r.reason });
    return r;
  }

  // 1. Plan
  let sc: ScriptedCase | null = null;
  let plan: Plan;
  try {
    if (mode === "scripted") {
      sc = scriptedPlan(question);
      if (!sc) {
        r.decision = "ABSTAIN";
        r.reason = SCRIPTED_UNSUPPORTED;
        r.summary = SCRIPTED_UNSUPPORTED;
        checks.push({ name: "Planner", state: "NOT CHECKED", detail: "No scripted plan exists for this question; nothing was executed." });
        return r;
      }
      plan = sc.plan;
    } else {
      sc = precheck(question);
      if (sc) {
        plan = sc.plan;
        r.plannerLabel = "No live model inference — deterministic safety/answerability guard";
      } else {
        if (!input.livePlanner) return fail(r, "PROVIDER_HTTP_ERROR", "Model endpoint not connected.");
        let resp: LiveResponse;
        try { resp = await input.livePlanner(liveRequest(db, question, mode, contract)); }
        catch (e) {
          const msg = e instanceof Error ? e.message : "Provider error";
          const m = msg.match(/\b([A-Z_]{6,}): (.*)/);
          return fail(r, (m?.[1] as ErrorCode) ?? "PROVIDER_HTTP_ERROR", m?.[2] ?? "Model request failed.");
        }
        r.liveInference = true; r.modelLatencyMs = resp.latencyMs; r.modelName = resp.modelName;
        r.plannerLabel = `Live model plan: ${resp.modelName} (${resp.latencyMs} ms) → deterministic compiler`;
        const raw = resp.content;
        let obj: unknown = null;
        try { obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { /* handled below */ }
        if (obj === null) return fail(r, "INVALID_JSON", "The model did not return valid JSON.", raw);
        const parsed = LivePlanSchema.safeParse(obj);
        if (!parsed.success) {
          checks.push({ name: "Plan schema valid", state: "FAIL", detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
          return fail(r, "PLAN_SCHEMA_INVALID", "The model's plan did not match the required structure.", raw);
        }
        const compiled = compileLivePlan(parsed.data, question);
        if (!compiled.ok) return fail(r, compiled.code, compiled.message, raw);
        sc = compiled.sc; plan = sc.plan;
        checks.push({ name: "Live plan compiled", state: "PASS", detail: `Model plan (${parsed.data.decision}) compiled deterministically to app-authored query shape "${sc.id}". No model SQL was used.` });
      }
    }
  } catch (e) {
    return fail(r, "PROVIDER_HTTP_ERROR", e instanceof Error ? e.message : "Planner failed");
  }
  checks.push({ name: "Plan schema valid", state: "PASS", detail: mode === "scripted" ? "Scripted plan validated against runtime schema." : "Model JSON validated against runtime schema." });
  PlanSchema.parse(plan);
  checks.push({ name: "Decision state valid", state: "PASS", detail: `Planner decision: ${plan.decision}.` });

  Object.assign(r, {
    resolvedQuestion: plan.resolved_question, metric: plan.metric, grain: plan.grain, timeInterpretation: plan.time_interpretation,
    tables: plan.tables, columns: plan.columns, joins: plan.joins, assumptions: plan.assumptions,
    clarifications: plan.clarifications, reason: plan.abstain_reason, recommendedFix: plan.recommended_fix,
    suggestions: sc?.suggestions ?? [],
  });

  // 2. Value grounding
  if (sc?.grounding) {
    const term = sc.grounding.toLowerCase();
    const m = runQuery(db, "SELECT district_code, district_name, CASE WHEN lower(district_name) = ? OR lower(district_code) = ? THEN 'exact' WHEN lower(district_name) LIKE ? THEN 'contains term' ELSE 'code initial' END AS match FROM districts WHERE lower(district_name) LIKE ? OR lower(district_code) = ? OR lower(district_code) LIKE ? ORDER BY district_code", [term, term, `%${term}%`, `%${term}%`, term, `${term.slice(0, 1)}%`]).rows;
    if (!m.length) {
      r.decision = "ABSTAIN"; r.reason = `No district or school value matches "${sc.grounding}".`; r.summary = r.reason; return r;
    }
    r.decision = "CLARIFY";
    r.clarifications = [`I found ${m.length} possible interpretations of "${sc.grounding}". Which should I use?`];
    r.clarifications = [`I found multiple possible matches for "${sc.grounding}": ${m.map((x, i) => `${i + 1}. ${x["district_code"]}${x["district_name"] !== x["district_code"] ? ` (${x["district_name"]})` : ""}`).join("  ")}. Choose one or select all.`];
    r.suggestions = m.map((x) => ({ label: `${x["district_name"]} (code ${x["district_code"]}) — ${x["match"]}`, question: `Show schools in district code ${x["district_code"]}` }));
    if (m.length > 1) r.suggestions.push({ label: `All ${m.length} ${sc.grounding.replace(/^./, (ch) => ch.toUpperCase())}-related districts (${m.map((x) => x["district_code"]).join(", ")})`, question: `Show schools in district codes ${m.map((x) => x["district_code"]).join(" ")}` });
    r.evidence.push({ label: "Value grounding", state: "WARNING", detail: `Searched districts for "${sc.grounding}": ${m.map((x) => x["district_code"]).join(", ")}.` });
    r.summary = `Multiple possible matches for "${sc.grounding}" — choose before any SQL runs.`;
    return r;
  }

  // 3. Non-answer decisions
  if (plan.decision === "clarify") { r.decision = "CLARIFY"; r.summary = "Clarification needed before any SQL runs."; return r; }
  if (plan.decision === "abstain") { r.decision = "ABSTAIN"; r.summary = plan.abstain_reason ?? "Abstained."; checks.push({ name: "Causal interpretation", state: "NOT CHECKED", detail: "Not supported." }); return r; }

  // 4. Firewall (also applies to plans that the planner itself flagged as blocked)
  if (plan.sql) {
    r.sql = plan.sql; r.params = plan.params;
    const fw = checkSql(plan.sql);
    checks.push(...fw.checks);
    if (!fw.allowed || plan.decision === "blocked") {
      r.decision = fw.parseError && !fw.reasons.some((x) => /not allowed/.test(x)) && plan.decision !== "blocked" ? "ERROR" : "BLOCKED";
      r.blockedReasons = [...(plan.abstain_reason ? [plan.abstain_reason] : []), ...fw.reasons];
      r.summary = r.decision === "BLOCKED" ? "Blocked by the read-only SQL firewall. Nothing was executed." : "SQL parser failure; nothing was executed.";
      r.error = r.decision === "ERROR" ? fw.parseError : null;
      if (r.decision === "BLOCKED") r.sql = null; // destructive SQL is withheld
      else r.errorCode = "SQL_AST_REJECTED";
      return r;
    }
    // Plan-declared tables/columns must also exist
    const kt = new Set(tableNames()); const kc = allColumns();
    const badT = plan.tables.filter((t) => !kt.has(t.toLowerCase()));
    const badC = plan.columns.map((c) => c.split(".").pop()!.toLowerCase()).filter((c) => !kc.has(c));
    checks.push({ name: "Plan-declared tables/columns exist", state: badT.length || badC.length ? "FAIL" : "PASS", detail: badT.length || badC.length ? `Unknown: ${[...badT, ...badC].join(", ")}` : "All declared references found in schema." });
    if (badT.length || badC.length) { r.decision = "ABSTAIN"; r.reason = "The plan references fields that do not exist."; r.summary = r.reason; return r; }

    // 5. Join Safety Radar
    let radar = joinRadar(fw.ast, fw.ctes);
    r.radar = radar; r.joinStatus = radar.status;
    let execSql = plan.sql; let execParams = plan.params;
    if (radar.state === "FAIL") {
      checks.push({ name: "Join risk detection", state: "PASS", detail: `RISK_DETECTED — ${radar.title}` });
      if (!sc?.repair) {
        r.joinStatus = "REPAIR_AVAILABLE";
        r.decision = "ABSTAIN"; r.reason = "The query joins two one-to-many tables before aggregation, so totals would be inflated.";
        r.recommendedFix = "Aggregate each child table to the school grain first, then join the summaries."; r.summary = r.reason;
        r.confidence = { level: "Insufficient evidence", reasons: [radar.explanation] }; return r;
      }
      const fw2 = checkSql(sc.repair.sql);
      const radar2 = fw2.allowed ? joinRadar(fw2.ast, fw2.ctes) : null;
      if (!fw2.allowed || radar2?.state !== "PASS") { r.joinStatus = "VALIDATION_ERROR"; r.decision = "ERROR"; r.error = "Repaired SQL failed validation."; return r; }
      checks.push({ name: "Repaired SQL firewall + join safety", state: "PASS", detail: "Aggregate-before-join SQL passed firewall and radar." });
      // Measure the fan-out for real
      const sum = (sql: string, cols: string[]) => {
        const row = runQuery(db, `SELECT ${cols.map((c) => `SUM(${c}) AS ${c}`).join(", ")} FROM (${sql})`).rows[0] ?? {};
        return cols.map((c) => (row[c] == null ? null : Number(row[c])));
      };
      const outCols = runQuery(db, `SELECT * FROM (${sc.repair.sql}) LIMIT 0`).columns.filter((c) => /total|rows/.test(c));
      const a = sum(plan.sql, outCols); const b = sum(sc.repair.sql, outCols);
      const joined = Number(runQuery(db, `SELECT COUNT(*) AS n FROM schools s JOIN enrolments e ON e.school_id = s.school_id JOIN payments p ON p.school_id = s.school_id`).rows[0]?.["n"] ?? 0);
      const enr = Number(runQuery(db, "SELECT COUNT(*) AS n FROM enrolments WHERE school_id IN (SELECT school_id FROM payments)").rows[0]?.["n"] ?? 0);
      r.repair = {
        riskySql: plan.sql, repairedSql: sc.repair.sql, explanation: sc.repair.explanation,
        totals: outCols.map((c, i) => ({ column: c, risky: a[i] ?? null, repaired: b[i] ?? null })),
        multiplicity: `Raw join produces ${joined.toLocaleString()} rows from ${enr.toLocaleString()} enrolment rows (≈${enr ? (joined / enr).toFixed(1) : "—"}× multiplication).`,
      };
      r.evidence.push({ label: "Fan-out measured", state: "WARNING", detail: r.repair.multiplicity });
      execSql = sc.repair.sql; execParams = sc.repair.params; r.sql = execSql; r.params = execParams; r.joinStatus = "REPAIR_APPLIED";
      radar = { ...radar };
    } else {
      checks.push({ name: "Join safety", state: radar.state, detail: `${radar.title}. ${radar.explanation}` });
    }

    // 6. Semantic contract
    const keys = defsFor(plan, sc ? sc.definitions : null);
    const drafts = keys.filter((k) => current(contract, k).status !== "APPROVED");
    r.definitions = keys.map((k) => JSON.parse(JSON.stringify(current(contract, k))) as DefVersion);
    if (drafts.length) {
      checks.push({ name: "Definitions approved", state: "FAIL", detail: `Draft: ${drafts.map((d) => current(contract, d).title).join(", ")}` });
      r.decision = "CLARIFY";
      r.clarifications = drafts.map((d) => `The "${current(contract, d).title}" definition (v${current(contract, d).version}) is still DRAFT. Approve it in Semantic Contract before it is treated as authoritative.`);
      r.suggestions = [{ label: "Ask again after approving", question }];
      r.summary = "Definitions must be approved before answering."; return r;
    }
    checks.push({ name: "Definitions approved", state: keys.length ? "PASS" : "NOT CHECKED", detail: keys.length ? r.definitions.map((d) => `${d.title} v${d.version}`).join(", ") : "No governed metric used." });
    for (const d of r.definitions) {
      if (d.key === "academic_year") r.normalizationRules = YEAR_RULES.map((y) => `${y.example} → ${y.output}: ${y.rule}`);
      else if (plan.grain && d.grain !== plan.grain) checks.push({ name: "Grain matches definition", state: "WARNING", detail: `Query grain "${plan.grain}" differs from approved "${d.grain}" for ${d.title}.` });
      else checks.push({ name: "Grain matches definition", state: "PASS", detail: `${d.title}: ${d.grain}.` });
    }
    if (sc?.id.startsWith("join-risk")) checks.push({ name: "Grain matches definition", state: "WARNING", detail: "Raw row sums/counts are not an approved metric definition." });

    // 7. Execute (read-only, limited)
    const before = db.getRowsModified();
    const tx = performance.now();
    try {
      if (input.signal?.aborted) return fail(r, "QUERY_CANCELLED", "Stopped before SQL execution");
      const workerOut = input.execute ? await input.execute(`SELECT * FROM (${execSql}) LIMIT ${ROW_LIMIT + 1}`, execParams) : null;
      const out = workerOut ? { columns: workerOut.columns, rows: workerOut.values.map((v) => Object.fromEntries(workerOut.columns.map((c, k) => [c, v[k] ?? null]))) } : runQuery(db, `SELECT * FROM (${execSql}) LIMIT ${ROW_LIMIT + 1}`, execParams);
      r.executionMs = Math.round((performance.now() - tx) * 10) / 10;
      const truncated = out.rows.length > ROW_LIMIT;
      r.result = { columns: out.columns, rows: out.rows.slice(0, ROW_LIMIT), truncated };
      checks.push({ name: "SQL executed successfully", state: "PASS", detail: `${r.result.rows.length} rows in ${r.executionMs} ms.` });
      checks.push({ name: "Row limit applied", state: truncated ? "WARNING" : "PASS", detail: truncated ? `Truncated at ${ROW_LIMIT} rows.` : `Limit ${ROW_LIMIT}; not reached.` });
      const modified = db.getRowsModified() - before;
      checks.push({ name: "No rows modified", state: modified === 0 ? "PASS" : "FAIL", detail: `${modified} rows modified.` });
    } catch (e) {
      if (e instanceof Error && (e.message === "QUERY_CANCELLED" || e.message === "QUERY_TIMEOUT")) {
        r.decision = "ERROR"; r.errorCode = e.message; r.result = null;
        r.error = e.message === "QUERY_CANCELLED" ? "Query stopped; the isolated execution was terminated. No result was retained." : "Query exceeded the 8-second execution deadline; the isolated execution was terminated.";
        r.summary = r.error; checks.push({ name: "Query execution", state: "FAIL", detail: r.error }); return r;
      }
      r.decision = "ERROR"; r.error = e instanceof Error ? e.message : "Execution failed";
      checks.push({ name: "SQL executed successfully", state: "FAIL", detail: r.error }); return r;
    }
    checks.push({ name: "Bound parameters", state: "PASS", detail: execParams.length ? `${execParams.length} values bound via placeholders.` : "No user values required." });
    checks.push({ name: "Query timeout", state: input.execute ? "PASS" : "NOT CHECKED", detail: input.execute ? "Final SQL completed inside the isolated worker's 8-second deadline; stopping terminates that worker." : "Synchronous execution; cancellation was not checked." });

    // 8. Evidence (app-authored queries)
    for (const ev of sc?.evidence ?? []) {
      const row = runQuery(db, ev.sql, ev.params ?? []).rows[0] ?? {};
      const n = Number(row["n"] ?? 0);
      const detail = row["detail"] == null ? null : String(row["detail"]);
      r.evidence.push({ label: ev.label, state: ev.warnWhenPositive && n > 0 ? "WARNING" : "PASS", detail: ev.message(n, detail) });
    }
    if (!sc?.evidence) checks.push({ name: "Data-quality evidence", state: "NOT CHECKED", detail: "No evidence queries defined for this query shape." });
    checks.push({ name: "Causal interpretation", state: "NOT CHECKED", detail: "Results are descriptive only." });

    r.decision = r.repair ? "ANSWER_WITH_WARNING" : "ANSWER";
    r.summary = sc?.summarize ? sc.summarize(r.result!.rows) : `Query returned ${r.result!.rows.length} rows.`;
    r.confidence = confidenceOf(checks, r.evidence);
    return r;
  }

  r.decision = plan.decision === "blocked" ? "BLOCKED" : "ABSTAIN";
  r.reason = r.reason ?? "The plan contained no SQL.";
  r.summary = r.reason;
  return r;
}
