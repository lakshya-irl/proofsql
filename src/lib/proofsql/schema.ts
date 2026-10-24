// Static description of the synthetic demo schema (structure only — never counts or totals).

export const DATASET_NAME = "Synthetic education dataset (intentionally messy)";
export const DATASET_LABEL =
  "Synthetic education dataset with intentionally injected data-quality issues.";
export const FIXTURE_VERSION = "edu-fixture-v1";
export const FIXTURE_SEED = 20260224;
export const SNAPSHOT_ID = `${FIXTURE_VERSION}-seed-${FIXTURE_SEED}`;

export type ColumnDef = { name: string; type: string };
export type TableDef = { name: string; grain: string; columns: ColumnDef[]; primaryKey: string };

export const TABLES: TableDef[] = [
  {
    name: "districts",
    grain: "one district",
    primaryKey: "district_code",
    columns: [
      { name: "district_code", type: "TEXT" },
      { name: "district_name", type: "TEXT" },
    ],
  },
  {
    name: "schools",
    grain: "one school",
    primaryKey: "school_id",
    columns: [
      { name: "school_id", type: "INTEGER" },
      { name: "school_name", type: "TEXT" },
      { name: "district_code", type: "TEXT" },
      { name: "school_status", type: "TEXT" },
    ],
  },
  {
    name: "enrolments",
    grain: "one student enrolment record",
    primaryKey: "enrolment_id",
    columns: [
      { name: "enrolment_id", type: "INTEGER" },
      { name: "school_id", type: "INTEGER" },
      { name: "student_id", type: "TEXT" },
      { name: "academic_year", type: "TEXT" },
      { name: "student_status", type: "TEXT" },
      { name: "enrolment_count", type: "INTEGER" },
    ],
  },
  {
    name: "payments",
    grain: "one payment transaction",
    primaryKey: "payment_id",
    columns: [
      { name: "payment_id", type: "INTEGER" },
      { name: "school_id", type: "INTEGER" },
      { name: "academic_year", type: "TEXT" },
      { name: "amount", type: "REAL" },
      { name: "payment_status", type: "TEXT" },
    ],
  },
];

export type Relationship = { parent: string; parentKey: string; child: string; childKey: string };

/** Candidate relationships (inferred by matching key names; cardinality is measured at runtime). */
export const RELATIONSHIPS: Relationship[] = [
  { parent: "districts", parentKey: "district_code", child: "schools", childKey: "district_code" },
  { parent: "schools", parentKey: "school_id", child: "enrolments", childKey: "school_id" },
  { parent: "schools", parentKey: "school_id", child: "payments", childKey: "school_id" },
];

export const SENTINELS = ["n/a", "na", "unknown", "null", "-", "none"];

export const tableNames = () => TABLES.map((t) => t.name);
export const allColumns = () => new Set(TABLES.flatMap((t) => t.columns.map((c) => c.name)));

/** Normalizes a raw academic-year expression to 'YYYY-YY'. Unsupported formats become NULL (never guessed). */
export const normYear = (col = "academic_year") =>
  `CASE WHEN ${col} LIKE 'AY____' THEN substr(${col}, 3, 4) || '-' || substr(CAST(substr(${col}, 3, 4) AS INTEGER) + 1, 3, 2) ` +
  `WHEN ${col} LIKE '____/__' THEN replace(${col}, '/', '-') ` +
  `WHEN ${col} LIKE '____-__' THEN ${col} ELSE NULL END`;

export const YEAR_RULES = [
  { pattern: "AYYYYY", example: "AY2023", rule: "AY + start year → start-year + '-' + last two digits of next year", output: "2023-24" },
  { pattern: "YYYY/YY", example: "2023/24", rule: "Replace '/' with '-'", output: "2023-24" },
  { pattern: "YYYY-YY", example: "2024-25", rule: "Already canonical", output: "2024-25" },
  { pattern: "anything else", example: "2024, '', N/A", rule: "Unresolved — left as NULL, never guessed", output: "NULL" },
];
