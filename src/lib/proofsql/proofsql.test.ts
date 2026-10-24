import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildFixtureSql } from "./fixture";
import { runPipeline } from "./pipeline";
import { DEFAULT_CONTRACT, DRAFT_CONTRACT, allApproved, current, withEdit, type Contract } from "./contract";
import { EVAL_CASES, runEvaluation, summarize } from "./evaluation";
import { SCRIPTED_UNSUPPORTED } from "./planner";
import { checkSql } from "./firewall";
import { scanHealth } from "./health";

let db: Database;
const approved = (): Contract => {
  const c = DEFAULT_CONTRACT();
  for (const k of Object.keys(c) as (keyof Contract)[]) c[k][0]!.status = "APPROVED";
  return c;
};
const ask = (question: string, contract = approved()) =>
  runPipeline({ question, mode: "scripted", contract, db, modelName: "test", modelStatus: "scripted" });

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.exec(buildFixtureSql());
});

describe("ProofSQL acceptance rules", () => {
  it("ambiguous 'falling enrolment last year' clarifies", async () => {
    expect((await ask("Which schools had falling enrolment last year?")).decision).toBe("CLARIFY");
  });
  it("'performed best' clarifies", async () => {
    expect((await ask("Which schools performed best?")).decision).toBe("CLARIFY");
  });
  it("explicit comparison answers with real rows when definitions are approved", async () => {
    const r = await ask("Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?");
    expect(r.decision).toBe("ANSWER");
    expect(r.result?.rows.every((x) => Number(x["delta"]) < 0)).toBe(true);
    expect(r.evidence.some((e) => e.label === "Schools missing a comparison year" && e.state === "WARNING")).toBe(true);
  });
  it("explicit comparison clarifies while Enrolment is still a draft", async () => {
    const r = await ask("Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?", DRAFT_CONTRACT());
    expect(r.decision).toBe("CLARIFY");
  });
  it("missing comparison years are not treated as zero", async () => {
    const r = await ask("Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?");
    expect(r.result?.rows.some((x) => x["students_2024_25"] == null || x["students_2023_24"] == null)).toBe(false);
  });
  it("join fan-out is detected and the repaired totals are smaller", async () => {
    const r = await ask("Compare enrolment and payment totals by school.");
    expect(r.radar?.status).toBe("RISK_DETECTED");
    expect(r.joinStatus).toBe("REPAIR_APPLIED");
    expect(r.decision).toBe("ANSWER_WITH_WARNING");
    const pay = r.repair!.totals.find((t) => t.column === "payment_total")!;
    expect(pay.risky!).toBeGreaterThan(pay.repaired!);
  });
  it("forecast abstains", async () => {
    expect((await ask("Which schools will have falling enrolment next year?")).decision).toBe("ABSTAIN");
  });
  it("causal question abstains", async () => {
    expect((await ask("What caused enrolment to fall?")).decision).toBe("ABSTAIN");
  });
  it("delete is blocked", async () => {
    expect((await ask("Delete all records.")).decision).toBe("BLOCKED");
  });
  it("firewall rejects writes, multiple statements, attach, unknown tables and functions", () => {
    for (const s of ["DELETE FROM schools", "SELECT 1; SELECT 2", "ATTACH DATABASE 'x' AS y", "SELECT * FROM sqlite_master", "SELECT load_extension('x')", "PRAGMA table_info(schools)", "SELECT nope FROM schools"]) {
      expect(checkSql(s).allowed, s).toBe(false);
    }
    expect(checkSql("SELECT school_id FROM schools").allowed).toBe(true);
  });
  it("health scan finds duplicates and missing years from the data", () => {
    const h = scanHealth(db);
    expect(h.duplicateRows).toBeGreaterThan(0);
    expect(h.missingComparison.count).toBe(5);
  });

  it("demo contract starts with all three definitions APPROVED v1", () => {
    const c = DEFAULT_CONTRACT();
    expect(allApproved(c)).toBe(true);
    for (const k of ["enrolment", "payment_total", "academic_year"] as const) expect(current(c, k).version).toBe(1);
  });
  it("editing a definition creates a new draft version and keeps the old one; old runs keep their version", async () => {
    const c = DEFAULT_CONTRACT();
    const before = await ask("Sum completed payments by school", c);
    const c2 = withEdit(c, "payment_total", { meaning: "changed" });
    expect(c2.payment_total.length).toBe(2);
    expect(c2.payment_total[0]!.status).toBe("APPROVED");
    expect(current(c2, "payment_total")).toMatchObject({ version: 2, status: "DRAFT" });
    expect(before.definitions[0]!.version).toBe(1);
    expect((await ask("Sum completed payments by school", c2)).decision).toBe("CLARIFY");
  });
  it("'Show schools in Jaipur' asks the user to choose among JPR, JPU and JPD", async () => {
    const r = await ask("Show schools in Jaipur");
    expect(r.decision).toBe("CLARIFY");
    expect(r.suggestions.map((s) => s.question)).toContain("Show schools in district codes JPR JPU JPD");
    const all = await ask("Show schools in district codes JPR JPU JPD");
    expect(all.decision).toBe("ANSWER");
    expect(all.params).toEqual(["JPR", "JPU", "JPD"]);
  });
  it("scripted mode refuses arbitrary questions without a fake answer", async () => {
    const r = await ask("List the tallest teachers");
    expect(r.summary).toBe(SCRIPTED_UNSUPPORTED);
    expect(r.result).toBeNull();
  });
  it("evaluation: all 13 cases pass and the summary matches the rows", async () => {
    const res = await runEvaluation({ db, contract: DEFAULT_CONTRACT(), mode: "scripted", modelName: "t", modelStatus: "s" });
    expect(res.length).toBe(13);
    expect(EVAL_CASES.length).toBe(13);
    expect(res.filter((o) => !o.passed).map((o) => o.c.id)).toEqual([]);
    const m = summarize(res);
    expect(m.map((x) => `${x.num}/${x.den}`)).toEqual(["3/3", "3/3", "1/1", "3/3", "2/2", "1/1", "0/13"]);
  });
});
