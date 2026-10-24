import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildFixtureSql } from "./fixture";
import { runPipeline } from "./pipeline";
import { DEFAULT_CONTRACT } from "./contract";
import { LivePlanSchema, compileLivePlan, precheck, type LivePlan } from "./livePlan";

let db: Database;
beforeAll(async () => { const SQL = await initSqlJs(); db = new SQL.Database(); db.exec(buildFixtureSql()); });

const plan = (p: Partial<LivePlan>): LivePlan => ({
  decision: "answer", resolved_question: "q", metric: null, dimensions: [], filters: [], comparison: null, time_interpretation: null,
  tables: [], columns: [], join_strategy: "none", clarifications: [], assumptions: [], abstain_reason: null, blocked_reason: null, risk_flags: [], ...p,
});
const live = (content: string, question = "Sum completed payments by school please") => runPipeline({
  question, mode: "live", contract: DEFAULT_CONTRACT(), db, modelName: "m", modelStatus: "live",
  livePlanner: async () => ({ content, latencyMs: 1, modelName: "m" }),
});

describe("live plan path", () => {
  it("rejects plans with extra keys such as sql", () => {
    expect(LivePlanSchema.safeParse({ ...plan({}), sql: "DELETE FROM schools" }).success).toBe(false);
  });
  it("compiles an enrolment decrease plan to the vetted query", () => {
    const c = compileLivePlan(plan({ metric: "enrolment", dimensions: ["school"], comparison: { from: "2023/24", to: "AY2024" }, filters: [{ field: "change", operator: "<", value: 0 }] }), "q");
    expect(c.ok && c.sc.id).toBe("enrolment-decrease");
  });
  it("rejects unsupported years with UNSUPPORTED_PLAN", () => {
    const c = compileLivePlan(plan({ metric: "enrolment", comparison: { from: "2019-20", to: "2020-21" }, filters: [{ field: "change", operator: "<", value: 0 }] }), "q");
    expect(!c.ok && c.code).toBe("UNSUPPORTED_PLAN");
  });
  it("precheck clarifies and blocks without the model", () => {
    expect(precheck("Which schools performed best?")?.plan.decision).toBe("clarify");
    expect(precheck("Delete all records.")?.plan.decision).toBe("blocked");
    expect(precheck("Sum completed payments by school")).toBeNull();
  });
  it("invalid JSON becomes ERROR with no rows", async () => {
    const r = await live("not json at all");
    expect(r.decision).toBe("ERROR"); expect(r.errorCode).toBe("INVALID_JSON"); expect(r.result).toBeNull();
  });
  it("a valid payment plan executes the compiled SQL", async () => {
    const r = await live(JSON.stringify(plan({ metric: "payment_total", dimensions: ["school"], tables: ["payments", "schools"] })));
    expect(r.decision).toBe("ANSWER"); expect(r.liveInference).toBe(true); expect(r.result?.rows.length).toBeGreaterThan(0);
  });
  it("blocked runs withhold destructive SQL", async () => {
    const r = await live("{}", "Delete all records.");
    expect(r.decision).toBe("BLOCKED"); expect(r.sql).toBeNull();
  });
});
