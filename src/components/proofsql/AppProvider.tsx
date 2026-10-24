import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Database } from "sql.js";
import { buildFixtureSql } from "@/lib/proofsql/fixture";
import { scanHealth, type Health } from "@/lib/proofsql/health";
import { DEFAULT_CONTRACT, current, type Contract, type DefKey, type DefVersion } from "@/lib/proofsql/contract";
import { runPipeline, type Mode, type RunResult } from "@/lib/proofsql/pipeline";
import { callPlanner, getModelStatus, type ModelStatus } from "@/lib/model.functions";

type Ctx = {
  db: Database | null; dbError: string | null; health: Health | null; loadedAt: string | null;
  contract: Contract; runs: RunResult[]; mode: Mode; model: ModelStatus | null; lastOkCheck: string | null; checking: boolean;
  setMode: (m: Mode) => void; resetDataset: () => Promise<void>; refreshModel: () => Promise<void>;
  approve: (k: DefKey) => void; editDefinition: (k: DefKey, patch: Partial<DefVersion>) => void;
  ask: (q: string) => Promise<RunResult>; livePlanner: ((p: string) => Promise<string>) | undefined;
  modelStatusLabel: string;
};

const AppCtx = createContext<Ctx | null>(null);
const LS = { contract: "proofsql.contract.v1", runs: "proofsql.runs.v1", mode: "proofsql.mode.v1", ok: "proofsql.lastok.v1" };

async function createDb(): Promise<Database> {
  const initSqlJs = (await import("sql.js")).default;
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  db.exec(buildFixtureSql());
  return db;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract>(DEFAULT_CONTRACT);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [mode, setModeState] = useState<Mode>("scripted");
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [lastOkCheck, setLastOk] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await createDb();
      setDb((old) => { old?.close(); return d; });
      setHealth(scanHealth(d));
      setLoadedAt(new Date().toISOString());
      setDbError(null);
    } catch (e) {
      setDbError(e instanceof Error ? e.message : "Database failed to load");
    }
  }, []);

  const refreshModel = useCallback(async () => {
    setChecking(true);
    try {
      const s = await getModelStatus();
      setModel(s);
      if (s.reachable) { setLastOk(s.checkedAt); localStorage.setItem(LS.ok, s.checkedAt); }
    } catch (e) {
      setModel({ configured: false, reachable: false, modelName: "Qwen/Qwen2.5-Coder-7B-Instruct", maxParams: "8B", withinLimit: true, endpointHost: null, checkedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "Status check failed" });
    } finally { setChecking(false); }
  }, []);

  useEffect(() => {
    try {
      const c = localStorage.getItem(LS.contract); if (c) setContract(JSON.parse(c));
      const r = localStorage.getItem(LS.runs); if (r) setRuns(JSON.parse(r));
      const m = localStorage.getItem(LS.mode); if (m === "live" || m === "scripted") setModeState(m);
      setLastOk(localStorage.getItem(LS.ok));
    } catch { /* corrupted local state is ignored */ }
    setHydrated(true);
    void load();
    void refreshModel();
  }, [load, refreshModel]);

  useEffect(() => { if (hydrated) localStorage.setItem(LS.contract, JSON.stringify(contract)); }, [contract, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(LS.runs, JSON.stringify(runs.slice(0, 100))); }, [runs, hydrated]);

  const setMode = (m: Mode) => { setModeState(m); localStorage.setItem(LS.mode, m); };

  const approve = (k: DefKey) => setContract((c) => {
    const list = [...c[k]]; const cur = list[list.length - 1]!;
    list[list.length - 1] = { ...cur, status: "APPROVED", updatedAt: new Date().toISOString() };
    return { ...c, [k]: list };
  });
  const editDefinition = (k: DefKey, patch: Partial<DefVersion>) => setContract((c) => {
    const cur = current(c, k);
    return { ...c, [k]: [...c[k], { ...cur, ...patch, version: cur.version + 1, status: "DRAFT", updatedAt: new Date().toISOString() }] };
  });

  const liveReady = Boolean(model?.reachable && model.withinLimit);
  const livePlanner = liveReady ? async (prompt: string) => (await callPlanner({ data: { prompt } })).content : undefined;
  const modelStatusLabel = mode === "scripted"
    ? "Scripted planner — no live model inference"
    : liveReady ? `Live · ${model!.modelName} (≤${model!.maxParams})` : "Model endpoint not connected";

  const ask = async (q: string) => {
    if (!db) throw new Error("Database not loaded");
    const r = await runPipeline({ question: q, mode, contract, db, modelName: model?.modelName ?? "Qwen/Qwen2.5-Coder-7B-Instruct", modelStatus: modelStatusLabel, livePlanner });
    setRuns((rs) => [r, ...rs]);
    return r;
  };

  const resetDataset = async () => { setHealth(null); await load(); };

  const value = useMemo<Ctx>(() => ({
    db, dbError, health, loadedAt, contract, runs, mode, model, lastOkCheck, checking,
    setMode, resetDataset, refreshModel, approve, editDefinition, ask, livePlanner, modelStatusLabel,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db, dbError, health, loadedAt, contract, runs, mode, model, lastOkCheck, checking, modelStatusLabel]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
