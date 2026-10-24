// @vitest-environment node
import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildFixtureSql } from "./fixture";
import { runPipeline } from "./pipeline";
import { DEFAULT_CONTRACT, type Contract } from "./contract";
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
    const r = await ask("Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?", DEFAULT_CONTRACT());
    expect(r.decision).toBe("CLARIFY");
  });
  it("missing comparison years are not treated as zero", async () => {
    const r = await ask("Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?");
    expect(r.result?.rows.some((x) => x["students_2024_25"] == null || x["students_2023_24"] == null)).toBe(false);
  });
  it("join fan-out is detected and the repaired totals are smaller", async () => {
    const r = await ask("Compare enrolment and payment totals by school.");
    expect(r.radar?.state).toBe("FAIL");
    expect(r.decision).toBe("ANSWER");
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
});
