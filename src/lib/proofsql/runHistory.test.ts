import { describe, expect, it } from "vitest";
import { exportRuns, mergeRuns, normalizeRun, parseRuns } from "./runHistory";

const base = { id: "run_a", timestamp: "2026-10-24T10:00:00.000Z", question: "Q", decision: "ANSWER", sql: "SELECT 1" };

describe("run history import", () => {
  it("skips records without an id and reports why", () => {
    const r = parseRuns(JSON.stringify([base, { ...base, id: undefined }]));
    expect(r.runs).toHaveLength(1);
    expect(r.skipped).toEqual([{ index: 1, reason: "missing run id" }]);
  });
  it("rejects unknown decisions", () => {
    expect(normalizeRun({ ...base, decision: "MAYBE" })).toBe('unknown decision "MAYBE"');
  });
  it("strips SQL from imported BLOCKED runs", () => {
    const n = normalizeRun({ ...base, decision: "BLOCKED", sql: "DELETE FROM schools" });
    expect(typeof n !== "string" && n.sql).toBe(null);
  });
  it("never marks an imported run as live inference unless it says so", () => {
    const n = normalizeRun(base);
    expect(typeof n !== "string" && n.liveInference).toBe(false);
  });
  it("reports invalid JSON instead of throwing", () => {
    expect(parseRuns("{nope").skipped[0]?.reason).toBe("file is not valid JSON");
  });
  it("round-trips an export and drops duplicate ids on merge", () => {
    const one = parseRuns(JSON.stringify([base])).runs;
    const back = parseRuns(exportRuns(one)).runs;
    expect(mergeRuns(one, back)).toEqual({ runs: one, duplicates: 1 });
  });
});
