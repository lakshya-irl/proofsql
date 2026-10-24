import { test, expect } from "vitest";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { planCovid } from "./covid";

const load = async () => new (await initSqlJs()).Database(readFileSync("public/data/covid-monthly.sqlite"));
const run = (db: import("sql.js").Database, sql: string, p: (string | number)[]) => { const r = db.exec(sql, p)[0]; return r ? r.values : []; };

test("recovered after July 2021 abstains instead of showing zero", () => {
  expect(planCovid({ kind: "country_month", country: "India", month: "2021-12", metric: "recovered" }).decision).toBe("ABSTAIN");
});

test("country lookup returns the real reported total", async () => {
  const db = await load();
  const p = planCovid({ kind: "country_month", country: "India", month: "2021-12", metric: "deaths" });
  if (p.decision !== "ANSWER") throw new Error();
  expect(Number(run(db, p.sql, p.params)[0]![3])).toBeGreaterThan(400000);
});

test("change compares two months and user text is a bound parameter", async () => {
  const db = await load();
  const p = planCovid({ kind: "change", country: "x' OR 1=1 --", metric: "confirmed", from: "2021-01", to: "2021-06" });
  if (p.decision !== "ANSWER") throw new Error();
  expect(run(db, p.sql, p.params)).toEqual([]);
  expect(planCovid({ kind: "change", country: "India", metric: "deaths", from: "2021-06", to: "2021-01" }).decision).toBe("CLARIFY");
});

import { interpretModelOutput } from "./covid";
test("off-menu or malformed model output becomes CLARIFY, never an answer", () => {
  expect(interpretModelOutput("not json", ["India"]).plan.decision).toBe("CLARIFY");
  expect(interpretModelOutput('{"kind":"top","month":"2021-01","metric":"vaccinations","n":5}', ["India"]).plan.decision).toBe("CLARIFY");
  expect(interpretModelOutput('{"kind":"country_month","country":"Atlantis","month":"2021-01","metric":"deaths"}', ["India"]).plan.decision).toBe("CLARIFY");
  expect(interpretModelOutput('{"kind":"country_month","country":"india","month":"2021-01","metric":"deaths"}', ["India"]).plan.decision).toBe("ANSWER");
});
