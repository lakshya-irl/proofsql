import type { Database, SqlValue } from "sql.js";

export type Rows = { columns: string[]; rows: Record<string, SqlValue>[] };

/** Runs one prepared statement with bound parameters. */
export function runQuery(db: Database, sql: string, params: (string | number)[] = []): Rows {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: Record<string, SqlValue>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return { columns: stmt.getColumnNames(), rows };
  } finally {
    stmt.free();
  }
}

export const scalar = (db: Database, sql: string, params: (string | number)[] = []) =>
  runQuery(db, sql, params).rows[0] ?? {};
