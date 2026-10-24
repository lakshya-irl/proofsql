// Three access roles with row (country) and column (metric) limits, enforced by deterministic code.
// No sign-in: the role is picked in the app and only narrows what the pipeline will run and show.
import type { CovidQuestion, Metric } from "./covid";

export type AccessRole = "admin" | "analyst" | "viewer";
export const ACCESS_ROLES: AccessRole[] = ["admin", "analyst", "viewer"];
export const SOUTH_ASIA = ["Afghanistan", "Bangladesh", "Bhutan", "India", "Maldives", "Nepal", "Pakistan", "Sri Lanka"];

export type RolePolicy = { label: string; summary: string; metrics: Metric[]; countries: string[] | null };
export const ROLE_POLICIES: Record<AccessRole, RolePolicy> = {
  admin: { label: "Admin", summary: "All countries · confirmed, deaths, recovered", metrics: ["confirmed", "deaths", "recovered"], countries: null },
  analyst: { label: "Analyst", summary: "All countries · confirmed and deaths (no recoveries)", metrics: ["confirmed", "deaths"], countries: null },
  viewer: { label: "Regional viewer", summary: "South Asia only · confirmed cases only", metrics: ["confirmed"], countries: SOUTH_ASIA },
};
const METRIC_COLUMNS: Metric[] = ["confirmed", "deaths", "recovered"];

/** Questions that try to change role or bypass rules are refused before any model call. */
export function injectionPrecheck(q: string): string | null {
  const s = q.toLowerCase();
  return /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules?|polic(y|ies)|restrictions?|limits?|role|permissions?)\b|\b(act|pretend|behave) as\b|\byou are now\b|\bas an? (admin|administrator|superuser|root)\b|\bi am (an? )?(admin|administrator)\b|\b(system|developer) prompt\b|\bgrant me\b|\belevate\b/.test(s)
    ? "Your role cannot be changed by a question. Pick a role in the app instead; the request was not run." : null;
}

/** Row and column gate for one structured question. */
export function gateQuestion(role: AccessRole, q: CovidQuestion): { allowed: true; scope: string[] | null } | { allowed: false; reason: string } {
  const p = ROLE_POLICIES[role];
  if (!p.metrics.includes(q.metric)) return { allowed: false, reason: `The ${p.label} role cannot see ${q.metric}. Allowed: ${p.metrics.join(", ")}.` };
  if (p.countries && q.kind !== "top" && !p.countries.includes(q.country))
    return { allowed: false, reason: `The ${p.label} role can only see ${p.countries.join(", ")}.` };
  return { allowed: true, scope: p.countries };
}

/** Post-execution leak check: any row or column outside the role's limits counts as a leak. */
export function findLeaks(role: AccessRole, rows: Record<string, unknown>[]): string[] {
  const p = ROLE_POLICIES[role];
  const leaks: string[] = [];
  for (const row of rows) {
    const c = row["country"];
    if (p.countries && typeof c === "string" && !p.countries.includes(c)) leaks.push(`row for ${c}`);
    for (const m of METRIC_COLUMNS) if (!p.metrics.includes(m) && m in row) leaks.push(`column ${m}`);
  }
  return [...new Set(leaks)];
}

// ---------- Follow-up questions ----------
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export const DATA_FIRST = "2020-01";
export const DATA_LAST = "2022-04";
const pad = (n: number) => String(n).padStart(2, "0");

export type FollowUp = { question: CovidQuestion } | { clarify: string };

/** Applies a short follow-up ("now only for 2021", "deaths instead", "what about Brazil") to the previous question. */
export function resolveFollowUp(prev: CovidQuestion, text: string, countries: string[]): FollowUp {
  const s = text.toLowerCase();
  let changed = false;
  let q: CovidQuestion = { ...prev };
  const metric: Metric | null = /death/.test(s) ? "deaths" : /recover/.test(s) ? "recovered" : /confirm|cases?\b/.test(s) ? "confirmed" : null;
  if (metric) { q = { ...q, metric }; changed = true; }

  const country = [...countries].sort((a, b) => b.length - a.length).find((c) => new RegExp(`\\b${c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s));
  if (country) {
    q = q.kind === "top" ? { kind: "country_month", country, month: q.month, metric: q.metric } : { ...q, country };
    changed = true;
  }

  const top = s.match(/\btop\s+(\d{1,2})\b/);
  if (top) {
    const month = q.kind === "change" ? q.to : q.month;
    q = { kind: "top", month, metric: q.metric, n: Math.min(50, Number(top[1])) };
    changed = true;
  }

  const found: string[] = [];
  for (const m of s.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g)) found.push(`${m[1]}-${m[2]}`);
  for (const m of s.matchAll(new RegExp(`\\b(${MONTHS.join("|")})\\s+(20\\d{2})\\b`, "g"))) found.push(`${m[2]}-${pad(MONTHS.indexOf(m[1]!) + 1)}`);
  const yearOnly = found.length === 0 ? s.match(/\b(20\d{2})\b/) : null;
  if (found.length >= 2) {
    if (q.kind === "top") return { clarify: "Comparing two months needs one country. Which country?" };
    q = { kind: "change", country: q.country, metric: q.metric, from: found[0]!, to: found[1]! };
    changed = true;
  } else if (found.length === 1) {
    const m = found[0]!;
    q = q.kind === "change" ? { kind: "country_month", country: q.country, month: m, metric: q.metric } : { ...q, month: m };
    changed = true;
  } else if (yearOnly) {
    const y = yearOnly[1]!;
    if (y < DATA_FIRST.slice(0, 4) || y > DATA_LAST.slice(0, 4)) return { clarify: `The data covers ${DATA_FIRST} to ${DATA_LAST}; ${y} is outside it.` };
    if (q.kind === "change") {
      const from = `${y}-01` < DATA_FIRST ? DATA_FIRST : `${y}-01`;
      const to = `${y}-12` > DATA_LAST ? DATA_LAST : `${y}-12`;
      q = { ...q, from, to };
    } else {
      const mm = q.month.slice(5);
      const m = `${y}-${mm}`;
      if (m < DATA_FIRST || m > DATA_LAST) return { clarify: `${m} is outside the data (${DATA_FIRST} to ${DATA_LAST}). Which month of ${y}?` };
      q = { ...q, month: m };
    }
    changed = true;
  }
  if (!changed) return { clarify: "I couldn't tell what to change. Name a country, a month, a metric, or 'top N'." };
  const months = q.kind === "change" ? [q.from, q.to] : [q.month];
  if (months.some((m) => m < DATA_FIRST || m > DATA_LAST)) return { clarify: `The data covers ${DATA_FIRST} to ${DATA_LAST}.` };
  return { question: q };
}
