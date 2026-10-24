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
import { UNKNOWN_READINESS, readinessFromStatus, reuseCached, statusLabel, type PlannerReadiness } from "@/lib/proofsql/readiness";
import { runCovidPipeline, scanCovidHealth, type CovidHealth } from "@/lib/proofsql/covidPipeline";
import { COVID_FILE, type CovidQuestion } from "@/lib/proofsql/covid";
import { analyzeCovidQuestion } from "@/lib/model.functions";
import { LEGACY_RUN_KEYS, mergeRuns, parseRuns, type Skipped } from "@/lib/proofsql/runHistory";
import { workerExecutor } from "@/lib/proofsql/queryExecution";
import { COVID_SCHEMA } from "@/lib/proofsql/covidPipeline";
import { ACCESS_ROLES, type AccessRole } from "@/lib/proofsql/access";

export type ReadinessItem = { label: string; state: "ok" | "warn" | "fail" | "not-run"; detail: string };
export type Readiness = { at: string; items: ReadinessItem[] };

type Ctx = {
  db: Database | null; dbError: string | null; health: Health | null; loadedAt: string | null;
  contract: Contract; runs: RunResult[]; mode: Mode; model: ModelStatus | null; lastOkCheck: string | null; checking: boolean;
  setMode: (m: Mode) => void; resetDataset: () => Promise<void>; refreshModel: () => Promise<ModelStatus>;
  approve: (k: DefKey) => void; editDefinition: (k: DefKey, patch: Partial<DefVersion>) => void;
  ask: (q: string, signal?: AbortSignal) => Promise<RunResult>; livePlanner: ((r: LiveRequest) => Promise<LiveResponse>) | undefined;
  modelStatusLabel: string; lastFailCheck: string | null; resetContract: () => void;
  prepareDemo: (clearHistory: boolean) => Promise<Readiness>; readiness: Readiness | null; preparing: boolean;
  /** Shared planner readiness: the only source for live/scripted labels on every page. */
  planner: PlannerReadiness;
  importRuns: (text: string) => { added: number; duplicates: number; skipped: Skipped[] };
  clearRuns: () => void;
  legacyReport: { migrated: number; skipped: Skipped[] } | null;
  /** Active dataset for Ask & Verify, Health and Contract. COVID-19 is the main line. */
  dataset: Dataset; setDataset: (d: Dataset) => void;
  covidDb: Database | null; covidHealth: CovidHealth | null; countries: string[]; months: string[];
  askCovid: (q: string, menu?: CovidQuestion, signal?: AbortSignal, previous?: CovidQuestion) => Promise<RunResult>;
  /** Access role for COVID questions (no sign-in). */ role: AccessRole; setRole: (r: AccessRole) => void;
};
export type Dataset = "covid" | "school";

// Kept on globalThis so a hot reload of this file reuses the same context instead of orphaning consumers.
const g = globalThis as unknown as { __proofsqlCtx?: React.Context<Ctx | null> };
const AppCtx = (g.__proofsqlCtx ??= createContext<Ctx | null>(null));
// contract key v2: the demo-ready baseline (APPROVED v1) replaces older draft-only state.
const LS = { contract: "proofsql.contract.v2", runs: "proofsql.runs.v2", mode: "proofsql.mode.v1", ok: "proofsql.lastok.v1", fail: "proofsql.lastfail.v1", planner: "proofsql.planner.v1", dataset: "proofsql.dataset.v1", role: "proofsql.role.v1" };

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
  const [legacyReport, setLegacyReport] = useState<{ migrated: number; skipped: Skipped[] } | null>(null);
  const [dataset, setDatasetState] = useState<Dataset>("covid");
  const [covidDb, setCovidDb] = useState<Database | null>(null);
  const [covidHealth, setCovidHealth] = useState<CovidHealth | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [role, setRoleState] = useState<AccessRole>("admin");
  useEffect(() => { const v = localStorage.getItem(LS.role); if (v && (ACCESS_ROLES as string[]).includes(v)) setRoleState(v as AccessRole); }, []);
  const setRole = (r: AccessRole) => { setRoleState(r); localStorage.setItem(LS.role, r); };

  useEffect(() => {
    let d: Database | null = null;
    (async () => {
      try {
        const SQL = await (await import("sql.js")).default({ locateFile: (f: string) => `/wasm/${f}` });
        d = new SQL.Database(new Uint8Array(await (await fetch(COVID_FILE)).arrayBuffer()));
        setCountries(d.exec("SELECT DISTINCT country FROM covid_monthly ORDER BY country")[0]?.values.map((v) => String(v[0])) ?? []);
        setMonths(d.exec("SELECT DISTINCT month FROM covid_monthly ORDER BY month")[0]?.values.map((v) => String(v[0])) ?? []);
        setCovidHealth(scanCovidHealth(d));
        setCovidDb(d);
      } catch (e) { setDbError(`COVID data: ${e instanceof Error ? e.message : String(e)}`); }
    })();
    return () => d?.close();
  }, []);
  const setDataset = (d: Dataset) => { setDatasetState(d); localStorage.setItem(LS.dataset, d); };

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
      s = { configured: false, reachable: false, modelName: "unknown", maxParams: "UNKNOWN", withinLimit: false, endpointHost: null, checkedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "Status check failed", latencyMs: null, providerLabel: "unknown", openWeight: "UNKNOWN", fallback: false, transport: "NOT CHECKED", chat: "NOT CHECKED", planner: "NOT CHECKED", eligible: false, configFingerprint: "" };
    }
    setModel(s);
    // Cached readiness from an older provider/model/config is never reused.
    const cached = (() => { try { return JSON.parse(localStorage.getItem(LS.planner) ?? "null") as PlannerReadiness | null; } catch { return null; } })();
    if (reuseCached(cached, s.configFingerprint) === UNKNOWN_READINESS) localStorage.removeItem(LS.planner);
    localStorage.setItem(LS.planner, JSON.stringify(readinessFromStatus(s)));
    if (s.reachable) { setLastOk(s.checkedAt); localStorage.setItem(LS.ok, s.checkedAt); }
    else { setLastFail(s.checkedAt); localStorage.setItem(LS.fail, s.checkedAt); }
    setChecking(false);
    return s;
  }, []);

  useEffect(() => {
    let savedMode: string | null = null;
    try {
      const c = localStorage.getItem(LS.contract); if (c) setContract(JSON.parse(c));
      const r = localStorage.getItem(LS.runs);
      let current = r ? parseRuns(r).runs : [];
      // Legacy storage: migrate what validates, report what was skipped, never invent missing detail.
      for (const key of LEGACY_RUN_KEYS) {
        const old = localStorage.getItem(key); if (!old) continue;
        const rep = parseRuns(old);
        current = mergeRuns(current, rep.runs).runs;
        setLegacyReport({ migrated: rep.runs.length, skipped: rep.skipped });
        localStorage.removeItem(key);
      }
      setRuns(current);
      savedMode = localStorage.getItem(LS.mode); if (savedMode === "live" || savedMode === "scripted") setModeState(savedMode);
      setLastOk(localStorage.getItem(LS.ok));
      setLastFail(localStorage.getItem(LS.fail));
      const ds = localStorage.getItem(LS.dataset); if (ds === "covid" || ds === "school") setDatasetState(ds);
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

  // Fresh session: explicit unknowns until this session's health check returns.
  const planner = useMemo(() => (model ? readinessFromStatus(model) : UNKNOWN_READINESS), [model]);
  const liveReady = planner.eligibleForLive;
  const livePlanner = liveReady ? async (req: LiveRequest) => analyzeQuestion({ data: req }) : undefined;
  const modelStatusLabel = statusLabel(mode, planner);

  const ask = async (q: string, signal?: AbortSignal) => {
    if (!db) throw new Error("Database not loaded");
    const r = await runPipeline({ question: q, mode, contract, db, modelName: model?.modelName ?? "unknown", modelStatus: modelStatusLabel, livePlanner, execute: workerExecutor(db, signal), signal });
    setRuns((rs) => [r, ...rs]);
    return r;
  };

  const askCovid = async (q: string, menu?: CovidQuestion, signal?: AbortSignal, previous?: CovidQuestion) => {
    if (!covidDb) throw new Error("COVID database not loaded");
    const live = mode === "live" && liveReady ? async (question: string) => analyzeCovidQuestion({ data: { question } }) : undefined;
    const r = await runCovidPipeline({ question: q, db: covidDb, countries, mode, modelStatus: modelStatusLabel, menu, livePlanner: live, execute: workerExecutor(covidDb, signal, COVID_SCHEMA), signal, role, previous });
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
        ? { label: "Question processing verified", state: "ok", detail: `Transport, chat and planner-schema probes passed${s.latencyMs != null ? ` in ${s.latencyMs} ms` : ""}.` }
        : { label: "Question processing unavailable", state: "warn", detail: "Check the connection in Settings. The selected processing mode has not changed." });
    } finally { setPreparing(false); }
    const r = { at: new Date().toISOString(), items };
    setReadiness(r);
    return r;
  };

  const importRuns = (text: string) => {
    const rep = parseRuns(text);
    const merged = mergeRuns(runs, rep.runs);
    setRuns(merged.runs);
    return { added: rep.runs.length - merged.duplicates, duplicates: merged.duplicates, skipped: rep.skipped };
  };
  const clearRuns = () => setRuns([]);

  const value = useMemo<Ctx>(() => ({
    db, dbError, health, loadedAt, contract, runs, mode, model, lastOkCheck, checking,
    setMode, resetDataset, refreshModel, approve, editDefinition, ask, livePlanner, modelStatusLabel,
    lastFailCheck, resetContract, prepareDemo, readiness, preparing, planner, importRuns, clearRuns, legacyReport,
    dataset, setDataset, covidDb, covidHealth, countries, months, askCovid, role, setRole,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db, dbError, health, loadedAt, contract, runs, mode, model, lastOkCheck, checking, modelStatusLabel, lastFailCheck, readiness, preparing, planner, legacyReport, dataset, covidDb, covidHealth, countries, months, role]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
