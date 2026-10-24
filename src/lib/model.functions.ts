// Server-side proxy to the configured open-weight model. The API key never reaches the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct";
const HEALTH_TIMEOUT_MS = 8000;
const PLAN_TIMEOUT_MS = 45000;

function config() {
  const baseUrl = process.env["MODEL_BASE_URL"] ?? "";
  const apiKey = process.env["MODEL_API_KEY"] ?? "";
  const modelName = process.env["MODEL_NAME"] || DEFAULT_MODEL;
  const maxParams = process.env["MODEL_MAX_PARAMETERS"] || "8B";
  const limit = parseFloat(maxParams);
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, modelName, maxParams, withinLimit: Number.isFinite(limit) && limit <= 8 };
}

const authHeaders = (apiKey: string): Record<string, string> => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

export type ModelStatus = {
  configured: boolean; reachable: boolean; modelName: string; maxParams: string; withinLimit: boolean;
  endpointHost: string | null; checkedAt: string; error: string | null; latencyMs: number | null;
};

/** Real health check with timeout. Never reports reachable unless the endpoint answered. */
export const getModelStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ModelStatus> => {
  const c = config();
  let host: string | null = null;
  try { host = c.baseUrl ? new URL(c.baseUrl).host : null; } catch { host = "invalid URL"; }
  const base: ModelStatus = {
    configured: Boolean(c.baseUrl), reachable: false, modelName: c.modelName, maxParams: c.maxParams, withinLimit: c.withinLimit,
    endpointHost: host, checkedAt: new Date().toISOString(), error: null, latencyMs: null,
  };
  if (!c.baseUrl) return { ...base, error: "Model endpoint not connected (MODEL_BASE_URL is not set)." };
  if (host === "invalid URL") return { ...base, error: "MODEL_BASE_URL is not a valid URL." };
  if (!c.withinLimit) return { ...base, error: `MODEL_MAX_PARAMETERS=${c.maxParams} exceeds the 8B limit; live mode refused.` };
  const t0 = Date.now();
  try {
    const res = await fetch(`${c.baseUrl}/models`, { headers: authHeaders(c.apiKey), signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ...base, latencyMs, error: `Endpoint responded HTTP ${res.status}.` };
    return { ...base, latencyMs, reachable: true };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ...base, error: timedOut ? `Endpoint did not respond within ${HEALTH_TIMEOUT_MS / 1000}s.` : "Endpoint unreachable (network error)." };
  }
});

const AnalyzeInput = z.object({
  question: z.string().min(1).max(1000),
  mode: z.enum(["scripted", "live"]),
  profile: z.string().max(4000),
  schema: z.string().max(4000),
  definitions: z.array(z.object({ title: z.string(), version: z.number(), meaning: z.string(), expression: z.string(), grain: z.string() })).max(10),
  candidates: z.record(z.string(), z.array(z.string().max(200)).max(50)),
});

function buildPrompt(d: z.infer<typeof AnalyzeInput>) {
  return `You are a SQL planner for a read-only SQLite database. Return ONLY one JSON object, no prose, with keys:
decision ("answer"|"clarify"|"abstain"|"blocked"), resolved_question (string), metric (string|null), grain (string|null), time_interpretation (string|null), tables (string[]), columns (string[]), joins (array), sql (string|null; one SELECT or WITH statement; use ? placeholders for user values), params (array of bound values), clarifications (string[]), assumptions (string[]), abstain_reason (string|null), recommended_fix (string|null).
Rules: never write data; clarify undefined business terms or ambiguous values; abstain on forecasts, causation or fields that do not exist; aggregate each one-to-many table before joining; use only approved definitions; missing values are never zero; academic_year has mixed formats and must be normalized to YYYY-YY.
Dataset profile: ${d.profile}
Schema:
${d.schema}
Approved definitions:
${d.definitions.map((x) => `- ${x.title} v${x.version}: ${x.meaning} | ${x.expression} | grain ${x.grain}`).join("\n") || "- none approved"}
Value candidates:
${Object.entries(d.candidates).map(([k, v]) => `- ${k}: ${v.join(", ")}`).join("\n")}
Question: ${d.question}`;
}

/** analyze-question: sends the structured request to the configured model and returns its raw JSON text (validated again in the browser). */
export const analyzeQuestion = createServerFn({ method: "POST" })
  .inputValidator(AnalyzeInput)
  .handler(async ({ data }): Promise<{ content: string; latencyMs: number; modelName: string }> => {
    const c = config();
    if (!c.baseUrl) throw new Error("Model endpoint not connected.");
    if (!c.withinLimit) throw new Error("Configured model exceeds the 8B parameter limit.");
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(c.apiKey) },
        body: JSON.stringify({ model: c.modelName, temperature: 0, messages: [{ role: "user", content: buildPrompt(data) }] }),
        signal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
      });
    } catch {
      throw new Error(`Model endpoint did not respond within ${PLAN_TIMEOUT_MS / 1000}s or is unreachable.`);
    }
    if (!res.ok) throw new Error(`Model endpoint error HTTP ${res.status}.`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model returned no content.");
    return { content, latencyMs: Date.now() - t0, modelName: c.modelName };
  });
