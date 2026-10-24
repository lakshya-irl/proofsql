// Lightweight semantic contract: three versioned definitions. Drafts are never authoritative.

export type DefKey = "enrolment" | "payment_total" | "academic_year";
export type DefStatus = "DRAFT" | "APPROVED";
export type DefVersion = {
  key: DefKey;
  title: string;
  version: number;
  status: DefStatus;
  meaning: string;
  expression: string;
  grain: string;
  sourceColumns: string[];
  nullPolicy: string;
  duplicatePolicy: string;
  updatedAt: string;
};
export type Contract = Record<DefKey, DefVersion[]>; // newest last

/** Demo-ready baseline: all three definitions APPROVED v1. */
export const DEFAULT_CONTRACT = (): Contract => {
  const now = new Date(0).toISOString();
  return {
    enrolment: [{
      key: "enrolment", title: "Enrolment", version: 1, status: "APPROVED",
      meaning: "Distinct active students by school and normalized academic year.",
      expression: "COUNT(DISTINCT student_id) WHERE student_status = 'active'",
      grain: "school_id + academic_year",
      sourceColumns: ["enrolments.school_id", "enrolments.student_id", "enrolments.academic_year", "enrolments.student_status"],
      nullPolicy: "Rows without school_id, student_id, or a resolvable academic_year are excluded and counted in a warning.",
      duplicatePolicy: "Duplicate student-school-year records are deduplicated by the distinct count and counted in a warning.",
      updatedAt: now,
    }],
    payment_total: [{
      key: "payment_total", title: "Payment total", version: 1, status: "APPROVED",
      meaning: "Sum of completed payment amounts by school and normalized academic year.",
      expression: "SUM(amount) WHERE payment_status = 'completed'",
      grain: "school_id + academic_year",
      sourceColumns: ["payments.school_id", "payments.academic_year", "payments.amount", "payments.payment_status"],
      nullPolicy: "Rows with missing amount are excluded (never treated as zero) and counted in a warning.",
      duplicatePolicy: "Payments are transactions; no deduplication. Only completed payments are included.",
      updatedAt: now,
    }],
    academic_year: [{
      key: "academic_year", title: "Academic year", version: 1, status: "APPROVED",
      meaning: "A normalized academic period 'YYYY-YY' derived from supported raw formats: 2023/24 → 2023-24, AY2023 → 2023-24, 2024-25 → 2024-25, 2024/25 → 2024-25, AY2024 → 2024-25.",
      expression: "CASE … 'AY2023' → '2023-24'; '2023/24' → '2023-24'; '2024-25' unchanged; else NULL",
      grain: "academic period",
      sourceColumns: ["enrolments.academic_year", "payments.academic_year"],
      nullPolicy: "Unsupported values such as '2024', empty string or 'N/A' become unresolved NULL and are reported as warnings; never guessed.",
      duplicatePolicy: "Not applicable.",
      updatedAt: now,
    }],
  };
};

export const current = (c: Contract, k: DefKey): DefVersion => c[k][c[k].length - 1]!;

/** Editable research/testing state: same definitions, all DRAFT (never authoritative until approved). */
export const DRAFT_CONTRACT = (): Contract => {
  const c = DEFAULT_CONTRACT();
  for (const k of Object.keys(c) as DefKey[]) c[k] = c[k].map((v) => ({ ...v, status: "DRAFT" as DefStatus }));
  return c;
};

export const allApproved = (c: Contract) => (Object.keys(c) as DefKey[]).every((k) => current(c, k).status === "APPROVED");
