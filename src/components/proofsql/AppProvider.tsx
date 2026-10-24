import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type React from "react";
import type { Database } from "sql.js";
import { buildFixtureSql } from "@/lib/proofsql/fixture";
import { scanHealth, type Health } from "@/lib/proofsql/health";
import { DEFAULT_CONTRACT, allApproved, withEdit, type Contract, type DefKey, type DefVersion } from "@/lib/proofsql/contract";
import { runPipeline, type LiveRequest, type LiveResponse, type Mode, type RunResult } from "@/lib/proofsql/pipeline";
import { analyzeQuestion, getModelStatus, type ModelStatus } from "@/lib/model.functions";
import { EVAL_CASES } from "@/lib/proofsql/evaluation";
import { scriptedPlan } from "@/lib/proofsql/planner";

export type ReadinessItem = { label: string; state: "ok" | "warn" | "fail" | "not-run"; detail: string };
export type Readiness = { at: string; items: ReadinessItem[] };

type Ctx = {
  db: Database | null; dbError: string | null; health: Health | null; loadedAt: string | null;
  contract: Contract; runs: RunResult[]; mode: Mode; model: ModelStatus | null; lastOkCheck: string | null; checking: boolean;
  setMode: (m: Mode) => void; resetDataset: () => Promise<void>; refreshModel: () => Promise<ModelStatus>;
  approve: (k: DefKey) => void; editDefinition: (k: DefKey, patch: Partial<DefVersion>) => void;
  ask: (q: string) => Promise<RunResult>; livePlanner: ((r: LiveRequest) => Promise<LiveResponse>) | undefined;
  modelStatusLabel: string; lastFailCheck: string | null; resetContract: () => void;
  prepareDemo: (clearHistory: boolean) => Promise<Readiness>; readiness: Readiness | null; preparing: boolean;
};

// Kept on globalThis so a hot reload of this file reuses the same context instead of orphaning consumers.
const g = globalThis as unknown as { __proofsqlCtx?: React.Context<Ctx | null> };
const AppCtx = (g.__proofsqlCtx ??= createContext<Ctx | null>(null));
// contract key v2: the demo-ready baseline (APPROVED v1) replaces older draft-only state.
const LS = { contract: "proofsql.contract.v2", runs: "proofsql.runs.v2", mode: "proofsql.mode.v1", ok: "proofsql.lastok.v1", fail: "proofsql.lastfail.v1" };

async function createDb(): Promise<Database> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: (file: string) => `/wasm/${file}` });
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
  const [lastFailCheck, setLastFail] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(async (): Promise<{ d: Database; h: Health } | null> => {
    try {
      const d = await createDb();
      setDb((old) => { old?.close(); return d; });
      const h = scanHealth(d);
      setHealth(h);
      setLoadedAt(new Date().toISOString());
      setDbError(null);
      return { d, h };
    } catch (e) {
      setDbError(e instanceof Error ? e.message : "Database failed to load");
      return null;
    }
  }, []);

  const refreshModel = useCallback(async (): Promise<ModelStatus> => {
    setChecking(true);
    let s: ModelStatus;
    try {
      s = await getModelStatus();
    } catch (e) {
      s = { configured: false, reachable: false, modelName: "unknown", maxParams: "UNKNOWN", withinLimit: false, endpointHost: null, checkedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "Status check failed", latencyMs: null, providerLabel: "unknown", openWeight: "UNKNOWN", fallback: false, transport: "NOT CHECKED", chat: "NOT CHECKED", planner: "NOT CHECKED", eligible: false };
    }
    setModel(s);
    if (s.reachable) { setLastOk(s.checkedAt); localStorage.setItem(LS.ok, s.checkedAt); }
    else { setLastFail(s.checkedAt); localStorage.setItem(LS.fail, s.checkedAt); }
    setChecking(false);
    return s;
  }, []);

  useEffect(() => {
    let savedMode: string | null = null;
    try {
      const c = localStorage.getItem(LS.contract); if (c) setContract(JSON.parse(c));
      const r = localStorage.getItem(LS.runs); if (r) setRuns(JSON.parse(r));
      savedMode = localStorage.getItem(LS.mode); if (savedMode === "live" || savedMode === "scripted") setModeState(savedMode);
      setLastOk(localStorage.getItem(LS.ok));
      setLastFail(localStorage.getItem(LS.fail));
    } catch { /* corrupted local state is ignored */ }
    setHydrated(true);
    void load();
    // Live is the primary mode: start in live when the model answered the health check and the user hasn't chosen a mode.
    void refreshModel().then((s) => { if (!savedMode && s.eligible) setModeState("live"); });
  }, [load, refreshModel]);

  useEffect(() => { if (hydrated) localStorage.setItem(LS.contract, JSON.stringify(contract)); }, [contract, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(LS.runs, JSON.stringify(runs.slice(0, 100))); }, [runs, hydrated]);

  const setMode = (m: Mode) => { setModeState(m); localStorage.setItem(LS.mode, m); };

  const approve = (k: DefKey) => setContract((c) => {
    const list = [...c[k]]; const cur = list[list.length - 1]!;
    list[list.length - 1] = { ...cur, status: "APPROVED", updatedAt: new Date().toISOString() };
    return { ...c, [k]: list };
  });
  const editDefinition = (k: DefKey, patch: Partial<DefVersion>) => setContract((c) => withEdit(c, k, patch));
  const resetContract = () => setContract(DEFAULT_CONTRACT());

  const liveReady = Boolean(model?.eligible);
  const livePlanner = liveReady ? async (req: LiveRequest) => analyzeQuestion({ data: req }) : undefined;
  const modelStatusLabel = mode === "scripted"
    ? "Scripted planner — no live model inference"
    : liveReady ? `Live · planner verified — ${model!.modelName}`
    : model?.transport === "PASS" ? `Live · transport only — ${model.modelName}` : "Model unavailable";

  const ask = async (q: string) => {
    if (!db) throw new Error("Database not loaded");
    const r = await runPipeline({ question: q, mode, contract, db, modelName: model?.modelName ?? "Qwen/Qwen2.5-Coder-7B-Instruct", modelStatus: modelStatusLabel, livePlanner });
    setRuns((rs) => [r, ...rs]);
    return r;
  };

  const resetDataset = async () => { setHealth(null); await load(); };

  /** Prepare Demo: every check reports only what actually ran. */
  const prepareDemo = async (clearHistory: boolean): Promise<Readiness> => {
    setPreparing(true);
    const items: ReadinessItem[] = [];
    try {
      setHealth(null);
      const loaded = await load();
      items.push(loaded ? { label: "Database loaded", state: "ok", detail: "Rebuilt from the fixed seed." } : { label: "Database loaded", state: "fail", detail: "The demo database failed to load." });
      items.push(loaded ? { label: "Health scan complete", state: "ok", detail: `${loaded.h.warnings.length} warnings across ${loaded.h.tables.length} tables.` } : { label: "Health scan complete", state: "not-run", detail: "Skipped: no database." });
      const c = DEFAULT_CONTRACT();
      setContract(c);
      items.push(allApproved(c) ? { label: "Semantic contract approved", state: "ok", detail: "Enrolment, Payment total, Academic year — APPROVED v1." } : { label: "Semantic contract approved", state: "fail", detail: "Baseline is not approved." });
      if (clearHistory) setRuns([]);
      const missing = EVAL_CASES.filter((e) => !scriptedPlan(e.question)).map((e) => e.id);
      if (loaded) {
        const probe = await runPipeline({ question: "Compare enrolment and payment totals by school.", mode: "scripted", contract: c, db: loaded.d, modelName: "scripted", modelStatus: "Scripted planner — no live model inference" });
        const radarOk = probe.radar?.status === "RISK_DETECTED" && probe.joinStatus === "REPAIR_APPLIED" && Boolean(probe.result);
        items.push(radarOk ? { label: "Join Safety Radar ready", state: "ok", detail: "Fan-out detected and repaired SQL executed." } : { label: "Join Safety Radar ready", state: "fail", detail: `Probe returned ${probe.decision} / ${probe.joinStatus ?? "no status"}.` });
        const cardOk = probe.checks.length > 0 && Boolean(probe.sql);
        items.push(cardOk ? { label: "Proof Card ready", state: "ok", detail: `${probe.checks.length} checks recorded on the probe run.` } : { label: "Proof Card ready", state: "fail", detail: "Probe run produced no checks." });
      } else {
        items.push({ label: "Join Safety Radar ready", state: "not-run", detail: "Skipped: no database." }, { label: "Proof Card ready", state: "not-run", detail: "Skipped: no database." });
      }
      items.push(missing.length ? { label: "Evaluation suite ready", state: "fail", detail: `No scripted plan for ${missing.join(", ")}.` } : { label: "Evaluation suite ready", state: "ok", detail: `Scripted planner covers all ${EVAL_CASES.length} cases.` });
      const s = await refreshModel();
      items.push(s.eligible
        ? { label: `Live planner verified — ${s.modelName}`, state: "ok", detail: `Transport, chat and planner-schema probes passed${s.latencyMs != null ? ` in ${s.latencyMs} ms` : ""}.` }
        : { label: "Live model unavailable — scripted mode active", state: "warn", detail: s.error ?? "Endpoint not reachable." });
    } finally { setPreparing(false); }
    const r = { at: new Date().toISOString(), items };
    setReadiness(r);
    return r;
  };

  const value = useMemo<Ctx>(() => ({
    db, dbError, health, loadedAt, contract, runs, mode, model, lastOkCheck, checking,
    setMode, resetDataset, refreshModel, approve, editDefinition, ask, livePlanner, modelStatusLabel,
    lastFailCheck, resetContract, prepareDemo, readiness, preparing,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db, dbError, health, loadedAt, contract, runs, mode, model, lastOkCheck, checking, modelStatusLabel, lastFailCheck, readiness, preparing]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
