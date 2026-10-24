// Single source of truth for planner readiness. Every page derives its labels from this object.
import type { ModelStatus } from "@/lib/model.functions";
import type { Mode, RunResult } from "./pipeline";

export type Tri = "pass" | "fail" | "unknown";
export type PlannerReadiness = {
  transport: Tri; chatCompletion: Tri; plannerSchema: Tri; openWeightCompliance: Tri;
  eligibleForLive: boolean; provider: string | null; model: string | null; endpointHost: string | null;
  parameterCount: number | null; lastCheckedAt: string | null; errorCode: string | null; errorMessage: string | null;
  configFingerprint: string | null; fallback: boolean;
};

/** Fresh browser / not yet checked: explicit unknowns, never eligible. */
export const UNKNOWN_READINESS: PlannerReadiness = {
  transport: "unknown", chatCompletion: "unknown", plannerSchema: "unknown", openWeightCompliance: "unknown",
  eligibleForLive: false, provider: null, model: null, endpointHost: null, parameterCount: null, lastCheckedAt: null,
  errorCode: null, errorMessage: "Health check has not run yet in this browser session.", configFingerprint: null, fallback: false,
};

const tri = (s: string | undefined): Tri => (s === "PASS" ? "pass" : s === "FAIL" ? "fail" : "unknown");

export function readinessFromStatus(s: ModelStatus): PlannerReadiness {
  const n = parseFloat(s.maxParams);
  const all = tri(s.transport) === "pass" && tri(s.chat) === "pass" && tri(s.planner) === "pass";
  return {
    transport: tri(s.transport), chatCompletion: tri(s.chat), plannerSchema: tri(s.planner), openWeightCompliance: tri(s.openWeight),
    // Eligible only when every probe really passed — never from a single flag.
    eligibleForLive: all && s.eligible,
    provider: s.providerLabel || null, model: s.modelName || null, endpointHost: s.endpointHost,
    parameterCount: Number.isFinite(n) ? n : null, lastCheckedAt: s.checkedAt,
    errorCode: s.error ? (s.error.match(/\b([A-Z_]{6,})\b/)?.[1] ?? "CHECK_FAILED") : null,
    errorMessage: s.error, configFingerprint: s.configFingerprint ?? null, fallback: s.fallback,
  };
}

/** A cached readiness is only reusable for the exact same provider/model/config. */
export function reuseCached(cached: PlannerReadiness | null, fingerprint: string | null): PlannerReadiness {
  if (!cached || !fingerprint || cached.configFingerprint !== fingerprint) return UNKNOWN_READINESS;
  return cached;
}

export const LABELS = {
  verified: "Live · planner verified",
  transport: "Live · transport only",
  scripted: "Scripted · no live model inference",
  unavailable: "Model unavailable",
} as const;

/** The one status label every page shows. */
export function statusLabel(mode: Mode, r: PlannerReadiness): string {
  if (mode === "scripted") return LABELS.scripted;
  if (r.eligibleForLive) return `${LABELS.verified} — ${r.model}`;
  if (r.transport === "pass") return `${LABELS.transport} — ${r.model ?? "unknown model"}`;
  return LABELS.unavailable;
}

export type RunMode = "Live" | "Scripted" | "Deterministic guard";
/** Mode actually used for one run, read from the run record (not from the current setting). */
export function runModeOf(run: Pick<RunResult, "liveInference" | "plannerLabel" | "mode">): RunMode {
  if (run.liveInference) return "Live";
  if (run.plannerLabel.includes("deterministic")) return "Deterministic guard";
  return run.mode === "live" ? "Live" : "Scripted";
}
