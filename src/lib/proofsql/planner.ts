// Structured planner contract, deterministic guard rules, and the scripted demo planner.
import { z } from "zod";
import type { DefKey } from "./contract";
import { normYear } from "./schema";

export const PlanSchema = z.object({
  decision: z.enum(["answer", "clarify", "abstain", "blocked"]),
  resolved_question: z.string(),
  metric: z.string().nullable(),
  grain: z.string().nullable(),
  time_interpretation: z.string().nullable(),
  tables: z.array(z.string()),
  columns: z.array(z.string()),
  joins: z.array(z.unknown()),
  sql: z.string().nullable(),
  params: z.array(z.union([z.string(), z.number()])).optional().default([]),
  clarifications: z.array(z.string()),
  assumptions: z.array(z.string()),
  abstain_reason: z.string().nullable(),
  recommended_fix: z.string().nullable(),
});
export type Plan = z.infer<typeof PlanSchema>;

export type EvidenceQuery = {
  label: string;
  sql: string; // app-authored, returns one row with column n (and optional detail)
  params?: (string | number)[];
  message: (n: number, detail: string | null) => string;
  warnWhenPositive: boolean;
};
export type Suggestion = { label: string; question: string };
export type Repair = { sql: string; params: (string | number)[]; explanation: string };

export type ScriptedCase = {
  id: string;
  plan: Plan;
  definitions: DefKey[];
  evidence?: EvidenceQuery[];
  suggestions?: Suggestion[];
  repair?: Repair;
  grounding?: string; // term to ground against real values
  summarize?: (rows: Record<string, unknown>[]) => string;
  rule?: string;
};

const base = (p: Partial<Plan> & Pick<Plan, "decision" | "resolved_question">): Plan => ({
  metric: null, grain: null, time_interpretation: null, tables: [], columns: [], joins: [], sql: null, params: [],
  clarifications: [], assumptions: [], abstain_reason: null, recommended_fix: null, ...p,
});

const norm = (s: string) => s.toLowerCase().replace(/[–—]/g, "-").replace(/[^a-z0-9\-/ ]/g, " ").replace(/\s+/g, " ").trim();

const N = normYear("academic_year");
const Y1 = "2023-24";
const Y2 = "2024-25";

const ENROL_CTES = `WITH norm AS (SELECT school_id, student_id, ${N} AS ay FROM enrolments WHERE school_id IS NOT NULL AND student_id IS NOT NULL AND student_status = ?), per AS (SELECT school_id, ay, COUNT(DISTINCT student_id) AS students FROM norm WHERE ay IN (?, ?) GROUP BY school_id, ay), cmp AS (SELECT school_id, MAX(CASE WHEN ay = ? THEN students END) AS y1, MAX(CASE WHEN ay = ? THEN students END) AS y2 FROM per GROUP BY school_id)`;
const ENROL_PARAMS = ["active", Y1, Y2, Y1, Y2];

const METRIC_SUGGESTIONS: Suggestion[] = [
  { label: "Enrolment growth (distinct active students, 2023-24 → 2024-25)", question: "Which schools had an increase in distinct active students from academic year 2023-24 to 2024-25?" },
  { label: "Payment collection (completed payments)", question: "Sum completed payments by school" },
  { label: "Attendance", question: "Which schools had the best attendance?" },
  { label: "Examination result", question: "Which schools had the best examination results?" },
  { label: "Dropout reduction", question: "Which schools reduced dropout the most?" },
];

const yearEvidence = (yearsSql: string): EvidenceQuery[] => [
  {
    label: "Academic-year normalization",
    sql: `SELECT COUNT(*) AS n, group_concat(DISTINCT academic_year) AS detail FROM enrolments WHERE academic_year IS NOT NULL AND (${N}) IS NOT NULL AND academic_year <> (${N})`,
    message: (n, d) => `${n} enrolment rows required academic-year normalization (formats: ${d ?? "—"}).`,
    warnWhenPositive: true,
  },
  {
    label: "Unresolved academic years",
    sql: `SELECT COUNT(*) AS n, group_concat(DISTINCT quote(academic_year)) AS detail FROM enrolments WHERE (${N}) IS NULL`,
    message: (n, d) => `${n} enrolment rows have an unresolvable academic year (${d ?? "—"}) and were excluded.`,
    warnWhenPositive: true,
  },
  { label: "_", sql: yearsSql, message: () => "", warnWhenPositive: false },
].filter((e) => e.label !== "_");

function enrolmentComparison(direction: "decrease" | "increase", q: string): ScriptedCase {
  const op = direction === "decrease" ? "<" : ">";
  const sql = `${ENROL_CTES} SELECT s.school_id, s.school_name, cmp.y1 AS students_2023_24, cmp.y2 AS students_2024_25, cmp.y2 - cmp.y1 AS delta FROM cmp JOIN schools s ON s.school_id = cmp.school_id WHERE cmp.y1 IS NOT NULL AND cmp.y2 IS NOT NULL AND cmp.y2 ${op} cmp.y1 ORDER BY delta${direction === "increase" ? " DESC" : ""}`;
  return {
    id: `enrolment-${direction}`,
    definitions: ["enrolment", "academic_year"],
    plan: base({
      decision: "answer",
      resolved_question: `Schools whose distinct active students ${direction === "decrease" ? "decreased" : "increased"} from academic year ${Y1} to ${Y2}.`,
      metric: "enrolment",
      grain: "school_id + academic_year",
      time_interpretation: `Academic year ${Y1} compared with ${Y2} (normalized from mixed formats).`,
      tables: ["enrolments", "schools"],
      columns: ["school_id", "student_id", "academic_year", "student_status", "school_name"],
      joins: [{ left: "cmp (aggregated enrolments)", right: "schools", on: "school_id", type: "one-to-one after aggregation" }],
      sql, params: ENROL_PARAMS,
      assumptions: [
        `"${direction === "decrease" ? "Decrease" : "Increase"}" means any change in that direction (no threshold).`,
        "Only rows with student_status = 'active' count; 'unknown' and 'N/A' are not treated as active.",
        "Schools missing either year are excluded, not treated as zero.",
      ],
    }),
    evidence: [
      {
        label: "Schools missing a comparison year",
        sql: `${ENROL_CTES} SELECT COUNT(*) AS n, group_concat(school_id) AS detail FROM cmp WHERE y1 IS NULL OR y2 IS NULL`,
        params: ENROL_PARAMS,
        message: (n, d) => `${n} schools are missing one comparison year and were excluded (school_id: ${d ?? "—"}). Missing is not treated as zero.`,
        warnWhenPositive: true,
      },
      {
        label: "Rows excluded for missing keys",
        sql: `SELECT COUNT(*) AS n, NULL AS detail FROM enrolments WHERE school_id IS NULL OR student_id IS NULL`,
        message: (n) => `${n} enrolment rows lack school_id or student_id and were excluded.`,
        warnWhenPositive: true,
      },
      {
        label: "Duplicate student-school-year records",
        sql: `SELECT COUNT(*) - COUNT(DISTINCT school_id || '|' || student_id || '|' || (${N})) AS n, NULL AS detail FROM enrolments WHERE school_id IS NOT NULL AND student_id IS NOT NULL AND (${N}) IN (?, ?) AND student_status = ?`,
        params: [Y1, Y2, "active"],
        message: (n) => `${n} duplicate student-school-year rows were collapsed by COUNT(DISTINCT student_id).`,
        warnWhenPositive: true,
      },
      {
        label: "Non-active or unknown status",
        sql: `SELECT COUNT(*) AS n, group_concat(DISTINCT quote(student_status)) AS detail FROM enrolments WHERE (${N}) IN (?, ?) AND (student_status IS NULL OR student_status <> ?)`,
        params: [Y1, Y2, "active"],
        message: (n, d) => `${n} rows in the compared years were excluded because status was not 'active' (${d ?? "—"}).`,
        warnWhenPositive: true,
      },
      ...yearEvidence(""),
    ].filter((e) => e.sql),
    summarize: (rows) => rows.length
      ? `${rows.length} school${rows.length === 1 ? "" : "s"} had ${direction === "decrease" ? "a decrease" : "an increase"} in distinct active students from ${Y1} to ${Y2}.`
      : `No school with both years present had ${direction === "decrease" ? "a decrease" : "an increase"}.`,
    rule: q,
  };
}

const RISKY_SCHOOL = "SELECT s.school_name, SUM(e.enrolment_count) AS enrolment_total, SUM(p.amount) AS payment_total FROM schools s JOIN enrolments e ON e.school_id = s.school_id JOIN payments p ON p.school_id = s.school_id GROUP BY s.school_name";
const REPAIRED_SCHOOL = "WITH e AS (SELECT school_id, SUM(enrolment_count) AS enrolment_total FROM enrolments WHERE school_id IS NOT NULL GROUP BY school_id), p AS (SELECT school_id, SUM(amount) AS payment_total FROM payments WHERE school_id IS NOT NULL GROUP BY school_id) SELECT s.school_id, s.school_name, e.enrolment_total, p.payment_total FROM schools s JOIN e ON e.school_id = s.school_id JOIN p ON p.school_id = s.school_id ORDER BY s.school_id";
const RISKY_DISTRICT = "SELECT d.district_name, COUNT(e.enrolment_id) AS enrolment_rows, COUNT(p.payment_id) AS payment_rows FROM districts d JOIN schools s ON s.district_code = d.district_code JOIN enrolments e ON e.school_id = s.school_id JOIN payments p ON p.school_id = s.school_id GROUP BY d.district_name";
const REPAIRED_DISTRICT = "WITH e AS (SELECT school_id, COUNT(enrolment_id) AS n FROM enrolments GROUP BY school_id), p AS (SELECT school_id, COUNT(payment_id) AS n FROM payments GROUP BY school_id) SELECT d.district_name, SUM(e.n) AS enrolment_rows, SUM(p.n) AS payment_rows FROM districts d JOIN schools s ON s.district_code = d.district_code JOIN e ON e.school_id = s.school_id JOIN p ON p.school_id = s.school_id GROUP BY d.district_name";

export const RISKY_SQL = { school: RISKY_SCHOOL, district: RISKY_DISTRICT };

/** Deterministic guards applied in BOTH modes before any planner runs. */
export function guard(question: string): ScriptedCase | null {
  const t = norm(question);
  if (/\b(delete|drop|truncate|update|insert|alter|remove all|wipe|erase)\b/.test(t)) {
    return {
      id: "blocked-write", definitions: [], rule: "write-intent guard",
      plan: base({
        decision: "blocked", resolved_question: question, sql: "DELETE FROM enrolments",
        abstain_reason: "The request asks to modify or delete data. ProofSQL is read-only.",
        recommended_fix: "Ask a read-only question instead.",
      }),
    };
  }
  if (/\b(will|next year|forecast|predict|projection|future)\b/.test(t)) {
    return {
      id: "abstain-forecast", definitions: [], rule: "forecast guard",
      plan: base({
        decision: "abstain", resolved_question: question,
        abstain_reason: "The demo database contains historical records only, with no forecasting model and no future observations. A forecast would be invented.",
        recommended_fix: "Ask about historical change, e.g. 2023-24 vs 2024-25.",
      }),
    };
  }
  if (/\b(caus|why did|why does|reason for|because)\w*/.test(t)) {
    return {
      id: "abstain-causal", definitions: [], rule: "causal guard",
      plan: base({
        decision: "abstain", resolved_question: question,
        abstain_reason: "Historical database records alone do not establish causation. ProofSQL can describe what changed, not why.",
        recommended_fix: "Ask which schools changed and by how much; investigate causes with domain evidence.",
      }),
    };
  }
  const missing = t.match(/\b(household income|income|salary|caste|religion|attendance|exam\w*|dropout|test score)\b/);
  if (missing) {
    return {
      id: "abstain-missing-field", definitions: [], rule: "missing-data guard",
      plan: base({
        decision: "abstain", resolved_question: question,
        abstain_reason: `The database has no field for "${missing[1]}". Tables available: districts, schools, enrolments, payments.`,
        recommended_fix: "Load a dataset that contains this field, or ask about enrolment or payments.",
      }),
    };
  }
  return null;
}

/** Scripted planner: predefined demo questions only. Returns null for anything else. */
export function scriptedPlan(question: string): ScriptedCase | null {
  const t = norm(question);
  const g = guard(question);
  if (g) return g;

  if (/distinct active students/.test(t) && /2023/.test(t) && /2024/.test(t)) {
    if (/(increase|grow|rise|rose|gain)/.test(t)) return enrolmentComparison("increase", "explicit enrolment comparison");
    if (/(decrease|fall|drop|declin|fell)/.test(t)) return enrolmentComparison("decrease", "explicit enrolment comparison");
  }
  if (/enrol/.test(t) && /payment/.test(t)) {
    const district = /district|multiple/.test(t);
    return {
      id: district ? "join-risk-district" : "join-risk-school", definitions: [], rule: "join-risk case",
      plan: base({
        decision: "answer",
        resolved_question: district ? "Total enrolment rows and payment rows per district." : "Enrolment and payment totals per school (all years, all payment statuses).",
        metric: district ? "row counts" : "SUM(enrolment_count), SUM(amount)",
        grain: district ? "district" : "school",
        time_interpretation: "All academic years combined.",
        tables: district ? ["districts", "schools", "enrolments", "payments"] : ["schools", "enrolments", "payments"],
        columns: district ? ["district_name", "district_code", "school_id", "enrolment_id", "payment_id"] : ["school_name", "school_id", "enrolment_count", "amount"],
        joins: [{ path: "schools → enrolments (1:N)" }, { path: "schools → payments (1:N)" }],
        sql: district ? RISKY_DISTRICT : RISKY_SCHOOL,
        assumptions: [
          "Totals include all academic years and all payment statuses, matching the literal question.",
          district ? "Counts raw rows, not distinct students." : "SUM(enrolment_count) is a raw row sum, not the approved Enrolment metric (distinct active students).",
        ],
      }),
      repair: {
        sql: district ? REPAIRED_DISTRICT : REPAIRED_SCHOOL, params: [],
        explanation: "Aggregate each one-to-many table to one row per school first, then join the summaries.",
      },
    };
  }
  if (/count/.test(t) && /school/.test(t) && /district/.test(t)) {
    return {
      id: "count-schools-district", definitions: [], rule: "answerable",
      plan: base({
        decision: "answer", resolved_question: "Number of school records per district (all statuses).",
        metric: "COUNT(school_id)", grain: "district", tables: ["districts", "schools"],
        columns: ["district_code", "district_name", "school_id"],
        joins: [{ left: "districts", right: "schools", on: "district_code", type: "1:N, aggregated" }],
        sql: "SELECT d.district_code, d.district_name, COUNT(s.school_id) AS schools FROM districts d LEFT JOIN schools s ON s.district_code = d.district_code GROUP BY d.district_code, d.district_name ORDER BY d.district_code",
        assumptions: ["Counts every school record regardless of school_status.", "Districts with no schools show 0 (a true count, not a missing value)."],
      }),
      evidence: [
        {
          label: "School status not 'active'",
          sql: "SELECT COUNT(*) AS n, group_concat(quote(school_status)) AS detail FROM schools WHERE school_status IS NULL OR school_status <> 'active'",
          message: (n, d) => `${n} counted schools have a status other than 'active' (${d ?? "—"}).`,
          warnWhenPositive: true,
        },
        {
          label: "Similar school names",
          sql: "SELECT COUNT(*) AS n, group_concat(school_id) AS detail FROM schools WHERE school_name LIKE '%Bassi%'",
          message: (n, d) => `${n} schools have near-identical names (ids ${d ?? "—"}); counted separately because IDs differ.`,
          warnWhenPositive: true,
        },
      ],
      summarize: (rows) => `${rows.length} districts listed.`,
    };
  }
  if (/payment/.test(t) && /school/.test(t)) {
    return {
      id: "payments-by-school", definitions: ["payment_total"], rule: "answerable",
      plan: base({
        decision: "answer", resolved_question: "Sum of completed payment amounts per school, all academic years combined.",
        metric: "payment_total", grain: "school_id", time_interpretation: "All academic years combined.",
        tables: ["payments", "schools"], columns: ["school_id", "amount", "payment_status", "school_name"],
        joins: [{ left: "p (filtered payments)", right: "schools", on: "school_id", type: "N:1" }],
        sql: "WITH p AS (SELECT school_id, amount FROM payments WHERE payment_status = ? AND amount IS NOT NULL AND school_id IS NOT NULL) SELECT s.school_id, s.school_name, SUM(p.amount) AS completed_total, COUNT(*) AS completed_payments FROM p JOIN schools s ON s.school_id = p.school_id GROUP BY s.school_id, s.school_name ORDER BY completed_total DESC",
        params: ["completed"],
        assumptions: ["Only payment_status = 'completed' is included.", "Missing amounts are excluded, never treated as zero; genuine zero payments are kept."],
      }),
      evidence: [
        {
          label: "Completed payments with missing amount",
          sql: "SELECT COUNT(*) AS n, group_concat(payment_id) AS detail FROM payments WHERE payment_status = 'completed' AND amount IS NULL",
          message: (n, d) => `${n} completed payments have a missing amount and were excluded (payment_id ${d ?? "—"}).`,
          warnWhenPositive: true,
        },
        {
          label: "Non-completed payments",
          sql: "SELECT COUNT(*) AS n, group_concat(DISTINCT payment_status) AS detail FROM payments WHERE payment_status IS NULL OR payment_status <> 'completed'",
          message: (n, d) => `${n} payments were excluded by status (${d ?? "—"}).`,
          warnWhenPositive: true,
        },
        {
          label: "Genuine zero payments",
          sql: "SELECT COUNT(*) AS n, NULL AS detail FROM payments WHERE payment_status = 'completed' AND amount = 0",
          message: (n) => `${n} completed payment(s) of exactly 0 were kept as genuine zeros.`,
          warnWhenPositive: false,
        },
      ],
      summarize: (rows) => `Completed payment totals for ${rows.length} schools.`,
    };
  }
  const code = t.match(/district code ([a-z]{3})\b/);
  if (code) {
    return {
      id: "schools-in-district", definitions: [], rule: "grounded value",
      plan: base({
        decision: "answer", resolved_question: `Schools whose district_code is '${code[1]!.toUpperCase()}'.`,
        grain: "school", tables: ["schools"], columns: ["school_id", "school_name", "district_code", "school_status"],
        sql: "SELECT school_id, school_name, district_code, school_status FROM schools WHERE district_code = ? ORDER BY school_id",
        params: [code[1]!.toUpperCase()],
        assumptions: ["District matched by exact code chosen by the user."],
      }),
      summarize: (rows) => `${rows.length} schools in district ${code[1]!.toUpperCase()}.`,
    };
  }
  const place = t.match(/schools? in ([a-z ]+)$/);
  if (place) {
    return {
      id: "ground-place", definitions: [], rule: "value grounding", grounding: place[1]!.trim(),
      plan: base({ decision: "clarify", resolved_question: question, clarifications: [] }),
    };
  }
  if (/(best|top|perform)/.test(t) || /growth|grow/.test(t)) {
    return {
      id: "clarify-metric", definitions: [], rule: "undefined business term",
      plan: base({
        decision: "clarify", resolved_question: question,
        clarifications: ["Which metric defines performance or growth? There is no approved definition for this term."],
      }),
      suggestions: METRIC_SUGGESTIONS,
    };
  }
  if (/enrol/.test(t) && /(fall|decreas|drop|declin|fell)/.test(t)) {
    return {
      id: "clarify-falling", definitions: [], rule: "ambiguous metric and time",
      plan: base({
        decision: "clarify", resolved_question: question,
        clarifications: [
          "Does enrolment mean distinct active students or enrolment rows?",
          "Does last year mean calendar year or academic year?",
          "Does falling mean any decrease or a percentage threshold?",
        ],
      }),
      suggestions: [{ label: "Distinct active students · academic year 2023-24 → 2024-25 · any decrease", question: "Which schools had a decrease in distinct active students from academic year 2023-24 to 2024-25?" }],
    };
  }
  return null;
}

export const DEMO_QUESTIONS = [
  "Which schools performed best?",
  "Which schools had falling enrolment last year?",
  "Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?",
  "Compare enrolment and payment totals by school.",
  "Which schools will have falling enrolment next year?",
  "What caused enrolment to fall?",
  "Show schools in Jaipur",
  "Delete all records.",
];
