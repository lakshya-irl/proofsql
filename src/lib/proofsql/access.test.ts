import { expect, test } from "vitest";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { ATTACKS, CONVERSATIONS, runAttackSuite, runConversationSuite } from "./accessEvaluation";
import { gateQuestion, resolveFollowUp } from "./access";

const load = async () => {
  const db = new (await initSqlJs()).Database(readFileSync("public/data/covid-monthly.sqlite"));
  const countries = (db.exec("SELECT DISTINCT country FROM covid_monthly")[0]?.values ?? []).map((v) => String(v[0]));
  return { db, countries };
};

test("viewer sees South Asia confirmed cases only; analyst never sees recoveries", () => {
  expect(gateQuestion("viewer", { kind: "country_month", country: "India", month: "2021-06", metric: "confirmed" }).allowed).toBe(true);
  expect(gateQuestion("viewer", { kind: "country_month", country: "Germany", month: "2021-06", metric: "confirmed" }).allowed).toBe(false);
  expect(gateQuestion("viewer", { kind: "country_month", country: "India", month: "2021-06", metric: "deaths" }).allowed).toBe(false);
  expect(gateQuestion("analyst", { kind: "country_month", country: "India", month: "2021-06", metric: "recovered" }).allowed).toBe(false);
  expect(gateQuestion("admin", { kind: "country_month", country: "India", month: "2021-06", metric: "recovered" }).allowed).toBe(true);
});

test("30+ attack questions produce zero leaks", async () => {
  const { db, countries } = await load();
  expect(ATTACKS.length).toBeGreaterThanOrEqual(30);
  const res = await runAttackSuite(db, countries);
  expect(res.flatMap((r) => r.leaks)).toEqual([]);
  expect(res.filter((r) => !r.pass).map((r) => `${r.id}:${r.actual}`)).toEqual([]);
});

test("follow-up 'now only for 2020' keeps country and metric", () => {
  const r = resolveFollowUp({ kind: "country_month", country: "India", month: "2021-06", metric: "deaths" }, "now only for 2020", ["India"]);
  expect(r).toEqual({ question: { kind: "country_month", country: "India", month: "2020-06", metric: "deaths" } });
  expect("clarify" in resolveFollowUp({ kind: "country_month", country: "India", month: "2021-06", metric: "deaths" }, "now only for 2023", ["India"])).toBe(true);
});

test("50 three-turn conversations all resolve and match reference rows", async () => {
  const { db, countries } = await load();
  expect(CONVERSATIONS.length).toBe(50);
  const res = await runConversationSuite(db, countries);
  expect(res.filter((r) => !r.pass).map((r) => `${r.id}:${r.turns.map((t) => t.actual).join("|")}`)).toEqual([]);
});
