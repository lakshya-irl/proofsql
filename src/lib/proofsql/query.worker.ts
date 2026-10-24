import initSqlJs from "sql.js";
import { checkSql } from "./firewall";

self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array; sql: string; params: (string | number)[]; schema?: { tables: string[]; columns: string[] } }>) => {
  let db: import("sql.js").Database | null = null;
  try {
    const { bytes, sql, params, schema } = event.data;
    const fw = checkSql(sql, schema ? { tables: schema.tables, columns: new Set(schema.columns) } : undefined);
    if (!fw.allowed) throw new Error("SQL_AST_REJECTED");
    const SQL = await initSqlJs({ locateFile: (f: string) => `/wasm/${f}` });
    db = new SQL.Database(bytes);
    db.exec("PRAGMA query_only = ON");
    const start = performance.now();
    const out = db.exec(sql, params)[0];
    self.postMessage({ ok: true, columns: out?.columns ?? [], values: out?.values ?? [], ms: Math.round((performance.now() - start) * 10) / 10 });
  } catch { self.postMessage({ ok: false, error: "QUERY_EXECUTION_FAILED" }); }
  finally { db?.close(); }
};