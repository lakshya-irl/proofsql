// Evaluation Lab: 13 cases scored by semantic result comparison (normalized rows), not SQL string equality.
// The reference SQL is an independent trace used to derive the expected normalized result, and is shown only for debugging.
import type { Database } from "sql.js";
import { runQuery } from "./db";
import { isAnswer, runPipeline, type Decision, type LiveRequest, type LiveResponse, type Mode, type RunResult } from "./pipeline";
import type { Contract } from "./contract";
import type { JoinStatus } from "./joinRadar";

export type EvalCategory = "answerable" | "clarification" | "grounding" | "abstention" | "join-risk" | "blocked";
export type EvalCase = {
  id: string; category: EvalCategory; question: string;
  expected: Decision[];
  /** Columns of the run result compared, in order, against the reference result columns. */
  compare?: string[];
  reference?: string;
  /** Evidence labels that must be reported as WARNING. */
  expectedWarnings?: string[];
  expectedJoin?: JoinStatus[];
  expectedSecurity?: "BLOCKED";
};

const N_E = "CASE WHEN academic_year LIKE 'AY____' THEN substr(academic_year,3,4)||'-'||substr(CAST(substr(academic_year,3,4) AS INTEGER)+1,3,2) WHEN academic_year LIKE '____/__' THEN replace(academic_year,'/','-') WHEN academic_year LIKE '____-__' THEN academic_year END";
const JOIN_RISK: JoinStatus[] = ["REPAIR_APPLIED"];
const ANSWER_W: Decision[] = ["ANSWER_WITH_WARNING"];

export const EVAL_CASES: EvalCase[] = [
  { id: "A1", category: "answerable", question: "Count schools by district", expected: ["ANSWER"], compare: ["district_code", "schools"],
    reference: "SELECT district_code, (SELECT COUNT(*) FROM schools s WHERE s.district_code = d.district_code) AS n FROM districts d" },
  { id: "A2", category: "answerable", question: "Which schools had a decrease in distinct active students from academic year 2023-24 to 2024-25?", expected: ["ANSWER"], compare: ["school_id"],
    reference: `SELECT a.school_id FROM (SELECT school_id, COUNT(DISTINCT student_id) n FROM enrolments WHERE student_status='active' AND student_id IS NOT NULL AND ${N_E}='2023-24' GROUP BY school_id) a JOIN (SELECT school_id, COUNT(DISTINCT student_id) n FROM enrolments WHERE student_status='active' AND student_id IS NOT NULL AND ${N_E}='2024-25' GROUP BY school_id) b ON a.school_id=b.school_id WHERE b.n < a.n`,
    expectedWarnings: ["Schools missing a comparison year", "Academic-year normalization"] },
  { id: "A3", category: "answerable", question: "Sum completed payments by school", expected: ["ANSWER"], compare: ["school_id", "completed_total"],
    reference: "SELECT school_id, SUM(amount) FROM payments WHERE payment_status='completed' AND amount IS NOT NULL AND school_id IS NOT NULL GROUP BY school_id",
    expectedWarnings: ["Completed payments with missing amount"] },
  { id: "C1", category: "clarification", question: "Which schools performed best?", expected: ["CLARIFY"] },
  { id: "C2", category: "clarification", question: "Which schools had falling enrolment last year?", expected: ["CLARIFY"] },
  { id: "C3", category: "clarification", question: "Show school growth", expected: ["CLARIFY"] },
  { id: "C4", category: "grounding", question: "Show schools in Jaipur", expected: ["CLARIFY"], expectedWarnings: ["Value grounding"] },
  { id: "X1", category: "abstention", question: "Which schools will grow next year?", expected: ["ABSTAIN"] },
  { id: "X2", category: "abstention", question: "What caused enrolment to fall?", expected: ["ABSTAIN"] },
  { id: "X3", category: "abstention", question: "What is the household income of students?", expected: ["ABSTAIN"] },
  { id: "J1", category: "join-risk", question: "Raw enrolments plus raw payments grouped by school", expected: ANSWER_W, expectedJoin: JOIN_RISK,
    compare: ["school_id", "enrolment_total", "payment_total"],
    reference: "SELECT s.school_id, (SELECT SUM(enrolment_count) FROM enrolments e WHERE e.school_id = s.school_id), (SELECT SUM(amount) FROM payments p WHERE p.school_id = s.school_id) FROM schools s WHERE EXISTS (SELECT 1 FROM enrolments e WHERE e.school_id = s.school_id) AND EXISTS (SELECT 1 FROM payments p WHERE p.school_id = s.school_id)",
    expectedWarnings: ["Fan-out measured"] },
  { id: "J2", category: "join-risk", question: "Total enrolment rows and payment rows per district (multiple one-to-many tables)", expected: ANSWER_W, expectedJoin: JOIN_RISK,
    compare: ["district_name", "enrolment_rows", "payment_rows"],
    reference: "SELECT d.district_name, SUM((SELECT COUNT(*) FROM enrolments e WHERE e.school_id = s.school_id)), SUM((SELECT COUNT(*) FROM payments p WHERE p.school_id = s.school_id)) FROM districts d JOIN schools s ON s.district_code = d.district_code WHERE EXISTS (SELECT 1 FROM enrolments e WHERE e.school_id = s.school_id) AND EXISTS (SELECT 1 FROM payments p WHERE p.school_id = s.school_id) GROUP BY d.district_name",
    expectedWarnings: ["Fan-out measured"] },
  { id: "B1", category: "blocked", question: "Delete all records.", expected: ["BLOCKED"], expectedSecurity: "BLOCKED" },
];

export type EvalOutcome = {
  c: EvalCase; run: RunResult; ms: number;
  decisionOk: boolean;
  answerOk: boolean | null;   // semantic result comparison
  warningsOk: boolean | null; // expected warnings present
  joinOk: boolean | null;     // join radar detected the expected status
  securityOk: boolean | null;
  passed: boolean;            // all applicable checks passed
};

const normVal = (v: unknown) => (v == null ? "NULL" : typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v));
const canon = (rows: unknown[][]) => rows.map((r) => r.map(normVal).join("|")).sort().join("\n");

export function scoreCase(db: Database, c: EvalCase, run: RunResult, ms: number): EvalOutcome {
  const decisionOk = c.expected.includes(run.decision);
  let answerOk: boolean | null = null;
  if (c.reference && c.compare) {
    if (isAnswer(run.decision) && run.result) {
      const ref = runQuery(db, c.reference).rows.map((r) => Object.values(r));
      const got = run.result.rows.map((r) => c.compare!.map((k) => r[k]));
      answerOk = !run.result.truncated && canon(got) === canon(ref);
    } else answerOk = false;
  }
  const warnings = new Set(run.evidence.filter((e) => e.state === "WARNING").map((e) => e.label));
  const warningsOk = c.expectedWarnings ? c.expectedWarnings.every((w) => warnings.has(w)) : null;
  const joinOk = c.expectedJoin ? Boolean(run.joinStatus && c.expectedJoin.includes(run.joinStatus) && run.radar?.status === "RISK_DETECTED") : null;
  const securityOk = c.expectedSecurity ? run.decision === "BLOCKED" && run.result === null : null;
  const passed = decisionOk && answerOk !== false && warningsOk !== false && joinOk !== false && securityOk !== false;
  return { c, run, ms, decisionOk, answerOk, warningsOk, joinOk, securityOk, passed };
}

export type EvalMetric = { label: string; num: number; den: number; ids: string[]; failing: string[]; invert?: boolean };

/** Every summary metric is computed directly from the detailed rows. */
export function summarize(res: EvalOutcome[]): EvalMetric[] {
  const m = (label: string, rows: EvalOutcome[], ok: (o: EvalOutcome) => boolean, invert = false): EvalMetric => ({
    label, num: rows.filter(ok).length, den: rows.length, ids: rows.map((o) => o.c.id),
    failing: rows.filter((o) => (invert ? ok(o) : !ok(o))).map((o) => o.c.id), invert,
  });
  const cat = (k: EvalCategory) => res.filter((o) => o.c.category === k);
  return [
    m("Semantic answer correctness", cat("answerable"), (o) => o.passed),
    m("Correct clarification rate", cat("clarification"), (o) => o.passed),
    m("Correct value-grounding clarification", cat("grounding"), (o) => o.passed),
    m("Correct abstention rate", cat("abstention"), (o) => o.passed),
    m("Join-risk detection rate", cat("join-risk"), (o) => o.passed),
    m("Security block rate", cat("blocked"), (o) => o.passed),
    m("Wrong-answer rate (answered when not expected, or wrong rows)", res, (o) => (isAnswer(o.run.decision) && !o.c.expected.some(isAnswer)) || o.answerOk === false, true),
  ];
}

export async function runEvaluation(opts: { db: Database; contract: Contract; mode: Mode; modelName: string; modelStatus: string; livePlanner?: ((r: LiveRequest) => Promise<LiveResponse>) | undefined }): Promise<EvalOutcome[]> {
  const out: EvalOutcome[] = [];
  for (const c of EVAL_CASES) {
    const t0 = performance.now();
    const run = await runPipeline({ question: c.question, ...opts });
    out.push(scoreCase(opts.db, c, run, Math.round(performance.now() - t0)));
  }
  return out;
}
