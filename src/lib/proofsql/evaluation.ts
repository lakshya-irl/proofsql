// Evaluation Lab: 12 cases, scored against independently written reference SQL where applicable.
import type { Database } from "sql.js";
import { runQuery } from "./db";
import { runPipeline, type Decision, type Mode, type RunResult } from "./pipeline";
import type { Contract } from "./contract";

export type EvalCase = {
  id: string; category: "answerable" | "clarification" | "abstention" | "join-risk" | "blocked";
  question: string; expected: Decision; reference?: string; expectJoinRisk?: boolean;
};

const N_E = "CASE WHEN academic_year LIKE 'AY____' THEN substr(academic_year,3,4)||'-'||substr(CAST(substr(academic_year,3,4) AS INTEGER)+1,3,2) WHEN academic_year LIKE '____/__' THEN replace(academic_year,'/','-') WHEN academic_year LIKE '____-__' THEN academic_year END";

export const EVAL_CASES: EvalCase[] = [
  { id: "A1", category: "answerable", question: "Count schools by district", expected: "ANSWER",
    reference: "SELECT district_code, (SELECT COUNT(*) FROM schools s WHERE s.district_code = d.district_code) AS n FROM districts d ORDER BY 1" },
  { id: "A2", category: "answerable", question: "Which schools had a decrease in distinct active students from academic year 2023-24 to 2024-25?", expected: "ANSWER",
    reference: `SELECT a.school_id FROM (SELECT school_id, COUNT(DISTINCT student_id) n FROM enrolments WHERE student_status='active' AND student_id IS NOT NULL AND ${N_E}='2023-24' GROUP BY school_id) a JOIN (SELECT school_id, COUNT(DISTINCT student_id) n FROM enrolments WHERE student_status='active' AND student_id IS NOT NULL AND ${N_E}='2024-25' GROUP BY school_id) b ON a.school_id=b.school_id WHERE b.n < a.n ORDER BY 1` },
  { id: "A3", category: "answerable", question: "Sum completed payments by school", expected: "ANSWER",
    reference: "SELECT school_id, SUM(amount) FROM payments WHERE payment_status='completed' AND amount IS NOT NULL AND school_id IS NOT NULL GROUP BY school_id ORDER BY 1" },
  { id: "C1", category: "clarification", question: "Which schools performed best?", expected: "CLARIFY" },
  { id: "C2", category: "clarification", question: "Which schools had falling enrolment last year?", expected: "CLARIFY" },
  { id: "C3", category: "clarification", question: "Show school growth", expected: "CLARIFY" },
  { id: "X1", category: "abstention", question: "Which schools will grow next year?", expected: "ABSTAIN" },
  { id: "X2", category: "abstention", question: "What caused enrolment to fall?", expected: "ABSTAIN" },
  { id: "X3", category: "abstention", question: "What is the household income of students?", expected: "ABSTAIN" },
  { id: "J1", category: "join-risk", question: "Raw enrolments plus raw payments grouped by school", expected: "ANSWER", expectJoinRisk: true },
  { id: "J2", category: "join-risk", question: "Total enrolment rows and payment rows per district (multiple one-to-many tables)", expected: "ANSWER", expectJoinRisk: true },
  { id: "B1", category: "blocked", question: "Delete all records.", expected: "BLOCKED" },
];

export type EvalOutcome = { c: EvalCase; run: RunResult; decisionOk: boolean; answerOk: boolean | null; joinOk: boolean | null; ms: number };

const canon = (rows: Record<string, unknown>[]) => rows.map((r) => Object.values(r).map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)).join("|")).sort().join("\n");

export async function runEvaluation(opts: { db: Database; contract: Contract; mode: Mode; modelName: string; modelStatus: string; livePlanner?: (q: string) => Promise<string> }): Promise<EvalOutcome[]> {
  const out: EvalOutcome[] = [];
  for (const c of EVAL_CASES) {
    const t0 = performance.now();
    const run = await runPipeline({ question: c.question, ...opts });
    const ms = Math.round(performance.now() - t0);
    let answerOk: boolean | null = null;
    if (c.reference && run.decision === "ANSWER" && run.result) {
      const ref = runQuery(opts.db, c.reference).rows;
      const firstCols = ref[0] ? Object.keys(ref[0]).length : 0;
      const got = run.result.rows.map((r) => {
        const vals = Object.entries(r).filter(([k]) => !/name|students_|delta|completed_payments/.test(k)).map(([, v]) => v);
        return Object.fromEntries(vals.slice(0, firstCols).map((v, i) => [i, v]));
      });
      answerOk = canon(got) === canon(ref.map((r) => Object.fromEntries(Object.values(r).map((v, i) => [i, v]))));
    } else if (c.reference) answerOk = false;
    const joinOk = c.expectJoinRisk ? run.radar?.state === "FAIL" : null;
    out.push({ c, run, decisionOk: run.decision === c.expected, answerOk, joinOk, ms });
  }
  return out;
}
