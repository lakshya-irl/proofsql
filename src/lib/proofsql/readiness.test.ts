import { describe, expect, it } from "vitest";
import type { ModelStatus } from "@/lib/model.functions";
import { LivePlanSchema, compileLivePlan } from "./livePlan";
import { LABELS, UNKNOWN_READINESS, readinessFromStatus, reuseCached, runModeOf, statusLabel } from "./readiness";

const status = (p: Partial<ModelStatus>): ModelStatus => ({
  configured: true, reachable: true, modelName: "google/gemini-3-flash-preview", maxParams: "UNKNOWN", withinLimit: true,
  endpointHost: "ai.gateway.lovable.dev", checkedAt: "2026-10-24T00:00:00Z", error: null, latencyMs: 10,
  providerLabel: "Lovable AI Gateway", openWeight: "FAIL", fallback: true,
  transport: "PASS", chat: "PASS", planner: "PASS", eligible: true, configFingerprint: "a|b|m", ...p,
});
const canonical = {
  decision: "answer", resolved_question: "Count schools by district", metric: null, dimensions: ["district"], filters: [],
  comparison: null, time_interpretation: null, tables: ["districts", "schools"], columns: ["district_code"], join_strategy: "none",
  clarifications: [], assumptions: [], abstain_reason: null, blocked_reason: null, risk_flags: [],
};

describe("planner readiness", () => {
  it("valid canonical planner probe parses and compiles to an answer", () => {
    const p = LivePlanSchema.parse(canonical);
    const c = compileLivePlan(p, "Count schools by district.");
    expect(c.ok && c.sc.plan.decision).toBe("answer");
  });
  it("rejects an unsupported filters.0.field", () => {
    const r = LivePlanSchema.safeParse({ ...canonical, filters: [{ field: "payment_status", operator: "=", value: "completed" }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path.join(".")).toBe("filters.0.field");
  });
  it("planner probe failure makes every page show non-verified status", () => {
    const r = readinessFromStatus(status({ planner: "FAIL", eligible: false, reachable: false, error: "Planner probe: PLAN_SCHEMA_INVALID (x)" }));
    expect(r.eligibleForLive).toBe(false);
    expect(r.errorCode).toBe("PLAN_SCHEMA_INVALID");
    expect(statusLabel("live", r)).toMatch(/^Live · transport only/);
    expect(statusLabel("live", r)).not.toContain("planner verified");
    expect(statusLabel("scripted", r)).toBe(LABELS.scripted);
  });
  it("eligible flag alone never verifies when a probe failed", () => {
    expect(readinessFromStatus(status({ planner: "FAIL", eligible: true })).eligibleForLive).toBe(false);
  });
  it("successful planner probe shows planner verified", () => {
    expect(statusLabel("live", readinessFromStatus(status({})))).toBe("Live · planner verified — google/gemini-3-flash-preview");
  });
  it("cached readiness is invalidated when config changes", () => {
    const r = readinessFromStatus(status({}));
    expect(reuseCached(r, "a|b|m")).toBe(r);
    expect(reuseCached(r, "a|b|other-model")).toBe(UNKNOWN_READINESS);
  });
  it("fresh browser state is explicit and never verified", () => {
    expect(UNKNOWN_READINESS.eligibleForLive).toBe(false);
    expect(UNKNOWN_READINESS.plannerSchema).toBe("unknown");
    expect(statusLabel("live", UNKNOWN_READINESS)).toBe(LABELS.unavailable);
  });
  it("evaluation records the actual mode used per run", () => {
    expect(runModeOf({ liveInference: true, plannerLabel: "Live model plan", mode: "live" })).toBe("Live");
    expect(runModeOf({ liveInference: false, plannerLabel: "No live model inference — deterministic safety/answerability guard", mode: "live" })).toBe("Deterministic guard");
    expect(runModeOf({ liveInference: false, plannerLabel: "Scripted planner — no live model inference", mode: "scripted" })).toBe("Scripted");
  });
});
