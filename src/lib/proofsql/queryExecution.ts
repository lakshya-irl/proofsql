import type { Database, SqlValue } from "sql.js";
import type { AllowedSchema } from "./firewall";

export type QueryExecutor = (sql: string, params: (string | number)[]) => Promise<{ columns: string[]; values: SqlValue[][]; ms: number }>;

/** Termination really interrupts SQLite; the original database is never transferred or mutated. */
export function workerExecutor(db: Database, signal?: AbortSignal, schema?: AllowedSchema, timeoutMs = 8000): QueryExecutor {
  return (sql, params) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("QUERY_CANCELLED")); return; }
    const worker = new Worker(new URL("./query.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new Error("QUERY_CANCELLED")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("QUERY_TIMEOUT")); }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => { cleanup(); reject(new Error("QUERY_EXECUTION_FAILED")); };
    worker.onmessage = (e: MessageEvent<{ ok: boolean; columns: string[]; values: SqlValue[][]; ms: number }>) => {
      cleanup();
      if (!e.data.ok) reject(new Error("QUERY_EXECUTION_FAILED"));
      else resolve(e.data);
    };
    const bytes = db.export();
    worker.postMessage({ bytes, sql, params, schema: schema ? { tables: schema.tables, columns: [...schema.columns] } : undefined }, [bytes.buffer]);
  });
}