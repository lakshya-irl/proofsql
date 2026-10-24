// Real public COVID-19 dataset (github.com/datasets/covid-19, Johns Hopkins CSSE source),
// reduced to the last reported day of each month per country. Queries are built from a
// fixed menu of question shapes: metrics are whitelisted and every user value is a bound parameter.

export const COVID_SOURCE = "https://github.com/datasets/covid-19 (countries-aggregated.csv, JHU CSSE)";
export const COVID_FILE = "/data/covid-monthly.sqlite";
export const RECOVERED_LAST_MONTH = "2021-07"; // source stopped reporting recoveries on 2021-08-05
export const PARTIAL_LAST_MONTH = "2022-04"; // source ends 2022-04-16

export type Metric = "confirmed" | "deaths" | "recovered";
export const METRICS: Metric[] = ["confirmed", "deaths", "recovered"];

export type CovidQuestion =
  | { kind: "country_month"; country: string; month: string; metric: Metric }
  | { kind: "top"; month: string; metric: Metric; n: number }
  | { kind: "change"; country: string; metric: Metric; from: string; to: string };

export type CovidPlan =
  | { decision: "ANSWER"; sql: string; params: (string | number)[]; warnings: string[] }
  | { decision: "ABSTAIN" | "CLARIFY"; reason: string };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function planCovid(q: CovidQuestion): CovidPlan {
  if (!METRICS.includes(q.metric)) return { decision: "ABSTAIN", reason: "Unsupported metric." };
  const months = q.kind === "change" ? [q.from, q.to] : [q.month];
  if (months.some((m) => !MONTH.test(m))) return { decision: "CLARIFY", reason: "Pick a month as YYYY-MM." };
  if (q.kind !== "top" && !q.country.trim()) return { decision: "CLARIFY", reason: "Pick a country." };
  if (q.kind === "change" && q.from >= q.to) return { decision: "CLARIFY", reason: "The start month must be before the end month." };
  if (q.metric === "recovered" && months.some((m) => m > RECOVERED_LAST_MONTH))
    return { decision: "ABSTAIN", reason: `Recoveries were not reported after ${RECOVERED_LAST_MONTH}; those values are missing, not zero.` };
  const warnings = ["Figures are cumulative totals as reported on the last reported day of the month."];
  if (months.includes(PARTIAL_LAST_MONTH)) warnings.push(`${PARTIAL_LAST_MONTH} is partial: the source ends on 2022-04-16.`);
  const m = q.metric; // whitelisted above
  if (q.kind === "country_month")
    return { decision: "ANSWER", warnings, params: [q.country, q.month],
      sql: `SELECT country, month, as_of_date, ${m} FROM covid_monthly WHERE country = ? AND month = ? LIMIT 1` };
  if (q.kind === "top") {
    const n = Math.max(1, Math.min(50, Math.floor(q.n) || 10));
    return { decision: "ANSWER", warnings, params: [q.month, n],
      sql: `SELECT country, as_of_date, ${m} FROM covid_monthly WHERE month = ? AND ${m} IS NOT NULL ORDER BY ${m} DESC LIMIT ?` };
  }
  return { decision: "ANSWER", warnings: [...warnings, "Change = end-month total minus start-month total."], params: [q.from, q.to, q.country],
    sql: `SELECT a.country, a.${m} AS start_value, b.${m} AS end_value, b.${m} - a.${m} AS change FROM covid_monthly a JOIN covid_monthly b ON b.country = a.country WHERE a.month = ? AND b.month = ? AND a.country = ? LIMIT 1` };
}

import { z } from "zod";
const M = z.enum(["confirmed", "deaths", "recovered"]);
const Mo = z.string().regex(/^\d{4}-\d{2}$/);
const ModelOut = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("country_month"), country: z.string(), month: Mo, metric: M }).strict(),
  z.object({ kind: z.literal("top"), month: Mo, metric: M, n: z.number().int() }).strict(),
  z.object({ kind: z.literal("change"), country: z.string(), metric: M, from: Mo, to: Mo }).strict(),
  z.object({ kind: z.literal("clarify"), reason: z.string() }).strict(),
]);

/** Validates the model's JSON; anything malformed, off-menu, or naming an unknown country becomes CLARIFY. */
export function interpretModelOutput(raw: string, countries: string[]): { question: CovidQuestion | null; plan: CovidPlan } {
  let parsed: unknown = null;
  try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { /* handled below */ }
  const r = ModelOut.safeParse(parsed);
  if (!r.success) return { question: null, plan: { decision: "CLARIFY", reason: "I couldn't map this to a supported question. Ask for a country's total, the top countries, or a change between two months." } };
  if (r.data.kind === "clarify") return { question: null, plan: { decision: "CLARIFY", reason: r.data.reason } };
  const q = { ...r.data } as CovidQuestion;
  if (q.kind !== "top") {
    const hit = countries.find((c) => c.toLowerCase() === q.country.trim().toLowerCase());
    if (!hit) {
      const near = countries.filter((c) => c.toLowerCase().includes(q.country.trim().toLowerCase().slice(0, 4))).slice(0, 5);
      return { question: null, plan: { decision: "CLARIFY", reason: `"${q.country}" is not a country in this data.${near.length ? ` Did you mean: ${near.join(", ")}?` : ""}` } };
    }
    q.country = hit;
  }
  return { question: q, plan: planCovid(q) };
}
