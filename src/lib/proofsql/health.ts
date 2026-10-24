// Health scan: every number here is computed from the loaded database (full scan).
import type { Database } from "sql.js";
import { runQuery, scalar } from "./db";
import { RELATIONSHIPS, SENTINELS, TABLES, normYear } from "./schema";

export type ColumnStats = {
  name: string; declaredType: string; typePatterns: string; nulls: number; empty: number; sentinels: number;
  distinct: number; min: string | null; max: string | null; examples: string[];
};
export type TableStats = {
  name: string; rowCount: number; grain: string; columns: ColumnStats[];
  pk: { column: string; unique: boolean; duplicates: number; nulls: number };
};
export type RelStats = {
  parent: string; parentKey: string; child: string; childKey: string;
  maxChildren: number; avgChildren: number; orphans: number; cardinality: string; label: string;
};
export type HealthWarning = {
  id: string; severity: "warning" | "fail"; title: string; detail: string; why: string; sampleSql: string;
};
export type YearFormat = { table: string; raw: string | null; normalized: string | null; rows: number };
export type Health = {
  scannedAt: string; scanType: "Full scan"; tables: TableStats[]; relationships: RelStats[];
  yearFormats: YearFormat[]; warnings: HealthWarning[]; totalRows: number;
  duplicateRows: number; missingComparison: { count: number; schools: string };
};

const sentinelList = SENTINELS.map((s) => `'${s}'`).join(",");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export function scanHealth(db: Database): Health {
  const tables: TableStats[] = TABLES.map((t) => {
    const rowCount = num(scalar(db, `SELECT COUNT(*) AS n FROM ${t.name}`)["n"]);
    const columns = t.columns.map((c) => {
      const r = scalar(db, `SELECT COUNT(*) - COUNT(${c.name}) AS nulls, SUM(CASE WHEN CAST(${c.name} AS TEXT) = '' THEN 1 ELSE 0 END) AS empty, SUM(CASE WHEN lower(trim(CAST(${c.name} AS TEXT))) IN (${sentinelList}) THEN 1 ELSE 0 END) AS sentinels, COUNT(DISTINCT ${c.name}) AS distinct_n, MIN(${c.name}) AS mn, MAX(${c.name}) AS mx FROM ${t.name}`);
      const types = runQuery(db, `SELECT typeof(${c.name}) AS t, COUNT(*) AS n FROM ${t.name} GROUP BY 1 ORDER BY 2 DESC`).rows.map((x) => `${x["t"]}:${x["n"]}`).join(", ");
      const ex = runQuery(db, `SELECT DISTINCT quote(${c.name}) AS v FROM ${t.name} LIMIT 4`).rows.map((x) => String(x["v"]));
      const numeric = c.type === "INTEGER" || c.type === "REAL";
      return {
        name: c.name, declaredType: c.type, typePatterns: types, nulls: num(r["nulls"]), empty: num(r["empty"]), sentinels: num(r["sentinels"]),
        distinct: num(r["distinct_n"]), min: numeric && r["mn"] != null ? String(r["mn"]) : null, max: numeric && r["mx"] != null ? String(r["mx"]) : null, examples: ex,
      };
    });
    const pkr = scalar(db, `SELECT COUNT(${t.primaryKey}) - COUNT(DISTINCT ${t.primaryKey}) AS d, COUNT(*) - COUNT(${t.primaryKey}) AS nn FROM ${t.name}`);
    return { name: t.name, rowCount, grain: t.grain, columns, pk: { column: t.primaryKey, unique: num(pkr["d"]) === 0 && num(pkr["nn"]) === 0, duplicates: num(pkr["d"]), nulls: num(pkr["nn"]) } };
  });

  const relationships: RelStats[] = RELATIONSHIPS.map((r) => {
    const s = scalar(db, `SELECT MAX(n) AS mx, AVG(n) AS av FROM (SELECT p.${r.parentKey}, COUNT(c.${r.childKey}) AS n FROM ${r.parent} p LEFT JOIN ${r.child} c ON c.${r.childKey} = p.${r.parentKey} GROUP BY p.${r.parentKey})`);
    const o = scalar(db, `SELECT COUNT(*) AS n FROM ${r.child} c WHERE c.${r.childKey} IS NULL OR c.${r.childKey} NOT IN (SELECT ${r.parentKey} FROM ${r.parent} WHERE ${r.parentKey} IS NOT NULL)`);
    const mx = num(s["mx"]);
    return { ...r, maxChildren: mx, avgChildren: Math.round(num(s["av"]) * 10) / 10, orphans: num(o["n"]), cardinality: mx > 1 ? "one-to-many" : "one-to-one", label: "Inferred (key-name match, cardinality measured)" };
  });

  const N = normYear("academic_year");
  const yearFormats: YearFormat[] = ["enrolments", "payments"].flatMap((tb) =>
    runQuery(db, `SELECT academic_year AS raw, ${N} AS normalized, COUNT(*) AS n FROM ${tb} GROUP BY academic_year ORDER BY normalized, raw`).rows.map((x) => ({
      table: tb, raw: x["raw"] == null ? null : String(x["raw"]), normalized: x["normalized"] == null ? null : String(x["normalized"]), rows: num(x["n"]),
    })),
  );

  const dupSql = `SELECT school_id, student_id, ${N} AS norm_year, COUNT(*) AS copies, group_concat(enrolment_id) AS enrolment_ids FROM enrolments WHERE student_id IS NOT NULL GROUP BY school_id, student_id, norm_year HAVING COUNT(*) > 1`;
  const duplicateRows = num(scalar(db, `SELECT COALESCE(SUM(copies - 1), 0) AS n FROM (${dupSql})`)["n"]);
  const missSql = `SELECT s.school_id, s.school_name, SUM(CASE WHEN ${normYear("e.academic_year")} = '2023-24' THEN 1 ELSE 0 END) AS rows_2023_24, SUM(CASE WHEN ${normYear("e.academic_year")} = '2024-25' THEN 1 ELSE 0 END) AS rows_2024_25 FROM schools s LEFT JOIN enrolments e ON e.school_id = s.school_id GROUP BY s.school_id, s.school_name HAVING rows_2023_24 = 0 OR rows_2024_25 = 0`;
  const miss = runQuery(db, missSql).rows;

  const warnings: HealthWarning[] = [];
  if (duplicateRows > 0) warnings.push({ id: "dups", severity: "warning", title: `${duplicateRows} duplicate student-school-year enrolment rows`, detail: "Same student, school and normalized academic year appear more than once.", why: "Row counts overstate enrolment; distinct-student counts are required.", sampleSql: dupSql });
  if (miss.length) warnings.push({ id: "missing-year", severity: "warning", title: `${miss.length} schools are missing one comparison year`, detail: "They will be excluded from a 2023-24 vs 2024-25 comparison unless the user changes the policy.", why: "Treating a missing year as zero would fabricate a 100% decline or growth.", sampleSql: missSql });
  const unresolved = yearFormats.filter((y) => y.normalized === null);
  const normalizedRows = yearFormats.filter((y) => y.normalized !== null && y.raw !== y.normalized).reduce((a, y) => a + y.rows, 0);
  if (normalizedRows || unresolved.length) warnings.push({ id: "years", severity: "warning", title: `Mixed academic-year formats: ${normalizedRows} rows need normalization, ${unresolved.reduce((a, y) => a + y.rows, 0)} unresolvable`, detail: `Raw formats: ${[...new Set(yearFormats.map((y) => y.raw ?? "NULL"))].join(", ")}`, why: "Grouping by the raw value splits one academic year into several.", sampleSql: `SELECT 'enrolments' AS source_table, enrolment_id AS id, academic_year AS raw, ${N} AS normalized FROM enrolments WHERE academic_year IS NULL OR ${N} IS NULL OR academic_year <> ${N} LIMIT 50` });
  for (const t of tables) for (const c of t.columns) {
    const issues = c.nulls + c.empty + c.sentinels;
    if (issues > 0 && c.name !== "academic_year") warnings.push({ id: `col-${t.name}-${c.name}`, severity: "warning", title: `${t.name}.${c.name}: ${c.nulls} NULL, ${c.empty} empty, ${c.sentinels} sentinel`, detail: "Missing and sentinel values are kept as-is; never converted to zero or a valid category.", why: "Silently treating missing as zero or 'unknown' as valid changes totals and categories.", sampleSql: `SELECT * FROM ${t.name} WHERE ${c.name} IS NULL OR CAST(${c.name} AS TEXT) = '' OR lower(trim(CAST(${c.name} AS TEXT))) IN (${sentinelList}) LIMIT 50` });
  }
  const fan = relationships.filter((r) => r.parent === "schools" && r.cardinality === "one-to-many");
  if (fan.length >= 2) warnings.push({ id: "fanout", severity: "fail", title: `Join fan-out risk: schools → ${fan.map((f) => `${f.child} (max ${f.maxChildren}/school)`).join(" and ")}`, detail: "Joining both raw child tables through schools multiplies rows before aggregation.", why: "SUM and COUNT become inflated while the SQL still runs successfully.", sampleSql: "SELECT s.school_id, (SELECT COUNT(*) FROM enrolments e WHERE e.school_id = s.school_id) AS enrolment_rows, (SELECT COUNT(*) FROM payments p WHERE p.school_id = s.school_id) AS payment_rows, (SELECT COUNT(*) FROM enrolments e WHERE e.school_id = s.school_id) * (SELECT COUNT(*) FROM payments p WHERE p.school_id = s.school_id) AS joined_rows FROM schools s" });
  const similar = runQuery(db, "SELECT a.school_id AS id_a, a.school_name AS name_a, b.school_id AS id_b, b.school_name AS name_b FROM schools a JOIN schools b ON a.school_id < b.school_id AND substr(lower(replace(replace(a.school_name, '.', ''), 'Senior', 'Sr')), 1, 12) = substr(lower(replace(replace(b.school_name, '.', ''), 'Senior', 'Sr')), 1, 12)").rows;
  if (similar.length) warnings.push({ id: "similar", severity: "warning", title: `${similar.length} pair(s) of near-identical school names with different IDs`, detail: "Grouping by name instead of ID could merge or confuse them.", why: "Names are not keys; always group by school_id.", sampleSql: "SELECT a.school_id AS id_a, a.school_name AS name_a, b.school_id AS id_b, b.school_name AS name_b FROM schools a JOIN schools b ON a.school_id < b.school_id AND substr(lower(replace(replace(a.school_name, '.', ''), 'Senior', 'Sr')), 1, 12) = substr(lower(replace(replace(b.school_name, '.', ''), 'Senior', 'Sr')), 1, 12)" });

  return {
    scannedAt: new Date().toISOString(), scanType: "Full scan", tables, relationships, yearFormats, warnings,
    totalRows: tables.reduce((a, t) => a + t.rowCount, 0), duplicateRows,
    missingComparison: { count: miss.length, schools: miss.map((m) => String(m["school_id"])).join(", ") },
  };
}
