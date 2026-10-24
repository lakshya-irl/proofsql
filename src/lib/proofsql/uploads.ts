import type { Database, SqlJsStatic } from "sql.js";

export type UploadKind = "csv" | "sqlite" | "sql";

export function kindOf(filename: string): UploadKind | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".csv")) return "csv";
  if (f.endsWith(".sqlite") || f.endsWith(".db") || f.endsWith(".sqlite3")) return "sqlite";
  if (f.endsWith(".sql")) return "sql";
  return null;
}

/** RFC-4180-style CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function safeIdent(name: string, fallback: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return s ? (/^[0-9]/.test(s) ? `c_${s}` : s) : fallback;
}

/** Loads a CSV as one table; every value kept as TEXT, empty cells become NULL (never 0). */
export function csvToDb(SQL: SqlJsStatic, text: string, table: string): Database {
  const rows = parseCsv(text);
  if (rows.length < 1) throw new Error("CSV is empty.");
  const seen = new Set<string>();
  const cols = rows[0]!.map((h, i) => {
    let c = safeIdent(h, `col_${i + 1}`);
    while (seen.has(c)) c = `${c}_${i + 1}`;
    seen.add(c);
    return c;
  });
  const db = new SQL.Database();
  db.run(`CREATE TABLE "${table}" (${cols.map((c) => `"${c}" TEXT`).join(", ")})`);
  const stmt = db.prepare(`INSERT INTO "${table}" VALUES (${cols.map(() => "?").join(",")})`);
  db.run("BEGIN");
  for (const r of rows.slice(1)) {
    stmt.run(cols.map((_, i) => { const v = (r[i] ?? "").trim(); return v === "" ? null : v; }));
  }
  db.run("COMMIT");
  stmt.free();
  return db;
}

export type ColumnProfile = { name: string; type: string; nulls: number; blanks: number; distinct: number };
export type TableProfile = { name: string; rows: number; duplicateRows: number; columns: ColumnProfile[] };

/** Real measured profile of every user table: row counts, NULL/blank counts, exact duplicate rows. */
export function profileDb(db: Database): TableProfile[] {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map((v) => String(v[0])) ?? [];
  return tables.map((t) => {
    const q = (sql: string) => Number(db.exec(sql)[0]?.values[0]?.[0] ?? 0);
    const info = db.exec(`PRAGMA table_info("${t.replace(/"/g, '""')}")`)[0]?.values ?? [];
    const cols = info.map((r) => ({ name: String(r[1]), type: String(r[2] || "ANY") }));
    const T = `"${t.replace(/"/g, '""')}"`;
    const rows = q(`SELECT COUNT(*) FROM ${T}`);
    const colList = cols.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
    const distinctRows = cols.length ? q(`SELECT COUNT(*) FROM (SELECT DISTINCT ${colList} FROM ${T})`) : rows;
    return {
      name: t,
      rows,
      duplicateRows: rows - distinctRows,
      columns: cols.map((c) => {
        const C = `"${c.name.replace(/"/g, '""')}"`;
        return {
          ...c,
          nulls: q(`SELECT COUNT(*) FROM ${T} WHERE ${C} IS NULL`),
          blanks: q(`SELECT COUNT(*) FROM ${T} WHERE TRIM(CAST(${C} AS TEXT)) IN ('', 'NA', 'N/A', 'null', '-')`),
          distinct: q(`SELECT COUNT(DISTINCT ${C}) FROM ${T}`),
        };
      }),
    };
  });
}
