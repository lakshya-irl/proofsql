// Server-side provider adapter for OpenAI-compatible endpoints. The API key never reaches the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LivePlanSchema, buildPlannerPrompt, compileLivePlan } from "@/lib/proofsql/livePlan";

const DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct";
const PROBE_TIMEOUT_MS = 15000;
const PLAN_TIMEOUT_MS = 45000;

// Lovable AI connection (owner decision while no ≤8B host works). Hosted proprietary model:
// shown as a fallback provider that does not satisfy the open-weight constraint.
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const GATEWAY_MODEL = "google/gemini-3-flash-preview";

type Cfg = { baseUrl: string; apiKey: string; modelName: string; maxParams: string; withinLimit: boolean; providerLabel: string; openWeight: "PASS" | "FAIL" | "UNKNOWN"; fallback: boolean; gateway: boolean };

function config(): Cfg {
  const gatewayKey = process.env["LOVABLE_API_KEY"] ?? "";
  if (gatewayKey) return { baseUrl: GATEWAY_URL, apiKey: gatewayKey, modelName: GATEWAY_MODEL, maxParams: "UNKNOWN", withinLimit: true, providerLabel: "Lovable AI Gateway (hosted Google model)", openWeight: "FAIL", fallback: true, gateway: true };
  const baseUrl = (process.env["MODEL_BASE_URL"] ?? "").replace(/\/$/, "");
  const maxParams = process.env["MODEL_MAX_PARAMETERS"] || "UNKNOWN";
  const limit = parseFloat(maxParams);
  const ow = (process.env["MODEL_IS_OPEN_WEIGHT"] ?? "").toLowerCase();
  return {
    baseUrl, apiKey: process.env["MODEL_API_KEY"] ?? "", modelName: process.env["MODEL_NAME"] || DEFAULT_MODEL, maxParams,
    withinLimit: Number.isFinite(limit) && limit <= 8, providerLabel: process.env["MODEL_PROVIDER_LABEL"] || "OpenAI-compatible endpoint",
    openWeight: ow === "true" ? "PASS" : ow === "false" ? "FAIL" : "UNKNOWN", fallback: false, gateway: false,
  };
}

function headers(c: Cfg): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (c.apiKey) h["Authorization"] = `Bearer ${c.apiKey}`;
  return h;
}

/** Error messages are prefixed with a stable code and never contain secrets. */
class CodedError extends Error { constructor(code: string, msg: string) { super(`${code}: ${msg}`); } }

async function chat(c: Cfg, messages: { role: string; content: string }[], timeoutMs: number): Promise<{ content: string; latencyMs: number }> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST", headers: headers(c), signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: c.modelName, messages, response_format: { type: "json_object" } }),
    });
  } catch (e) {
    const to = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new CodedError(to ? "PROVIDER_TIMEOUT" : "PROVIDER_HTTP_ERROR", to ? `No response within ${timeoutMs / 1000}s.` : "Endpoint unreachable.");
  }
  if (!res.ok) {
    const hint = res.status === 401 ? " Key rejected." : res.status === 402 ? " No credits left." : res.status === 404 ? " Model not found." : res.status === 429 ? " Rate limited; try again shortly." : "";
    throw new CodedError("PROVIDER_HTTP_ERROR", `HTTP ${res.status}.${hint}`);
  }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new CodedError("INVALID_JSON", "Model returned no content.");
  return { content, latencyMs: Date.now() - t0 };
}

const extractJson = (raw: string): unknown => { try { return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { return null; } };

export type ProbeState = "PASS" | "FAIL" | "NOT CHECKED";
export type ModelStatus = {
  configured: boolean; reachable: boolean; modelName: string; maxParams: string; withinLimit: boolean;
  endpointHost: string | null; checkedAt: string; error: string | null; latencyMs: number | null;
  providerLabel: string; openWeight: "PASS" | "FAIL" | "UNKNOWN"; fallback: boolean;
  transport: ProbeState; chat: ProbeState; planner: ProbeState; eligible: boolean;
  configFingerprint: string;
};

/** Canonical planner probe: a question the compiler supports exactly. */
export const PROBE_QUESTION = "Count schools by district.";

const PROBE_SCHEMA = "districts(district_code, district_name)\nschools(school_id, school_name, district_code, school_status)\nenrolments(enrolment_id, school_id, student_id, academic_year, student_status, enrolment_count)\npayments(payment_id, school_id, academic_year, amount, payment_status)";

/** Three separate probes: transport, chat completion, planner schema. "reachable" means the planner probe passed. */
export const getModelStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ModelStatus> => {
  const c = config();
  let host: string | null = null;
  try { host = c.baseUrl ? new URL(c.baseUrl).host : null; } catch { host = "invalid URL"; }
  const s: ModelStatus = {
    configured: Boolean(c.baseUrl), reachable: false, modelName: c.modelName, maxParams: c.maxParams, withinLimit: c.withinLimit,
    endpointHost: host, checkedAt: new Date().toISOString(), error: null, latencyMs: null,
    providerLabel: c.providerLabel, openWeight: c.openWeight, fallback: c.fallback,
    transport: "NOT CHECKED", chat: "NOT CHECKED", planner: "NOT CHECKED", eligible: false,
    // Non-secret identity of the configuration; cached readiness is discarded when it changes.
    configFingerprint: [c.providerLabel, host ?? "", c.modelName, c.maxParams, c.openWeight].join("|"),
  };
  if (!c.baseUrl) return { ...s, error: "Model endpoint not connected (MODEL_BASE_URL is not set)." };
  if (host === "invalid URL") return { ...s, error: "MODEL_BASE_URL is not a valid URL." };
  if (!c.gateway && !c.withinLimit) return { ...s, error: `MODEL_MAX_PARAMETERS=${c.maxParams} is unknown or exceeds 8B; live mode refused.` };
  // (a) transport: any HTTP answer counts; the model list is optional.
  try {
    await fetch(`${c.baseUrl}/models`, { headers: headers(c), signal: AbortSignal.timeout(8000) });
    s.transport = "PASS";
  } catch { return { ...s, transport: "FAIL", error: "Transport probe failed: endpoint unreachable or timed out." }; }
  // (b) chat completion
  try {
    const r = await chat(c, [{ role: "user", content: 'Reply with exactly this JSON object: {"ok":true}' }], PROBE_TIMEOUT_MS);
    const o = extractJson(r.content) as { ok?: unknown } | null;
    s.latencyMs = r.latencyMs;
    if (o?.ok !== true) return { ...s, chat: "FAIL", error: "Chat probe: model did not return {\"ok\":true}." };
    s.chat = "PASS";
  } catch (e) { return { ...s, chat: "FAIL", error: `Chat probe failed — ${e instanceof Error ? e.message : "error"}` }; }
  // (c) planner schema probe (no SQL executed)
  try {
    const p = buildPlannerPrompt({ question: PROBE_QUESTION, profile: "Synthetic education demo.", schema: PROBE_SCHEMA, definitions: [], candidates: {} });
    const r = await chat(c, [{ role: "system", content: p.system }, { role: "user", content: p.user }], PLAN_TIMEOUT_MS);
    const parsed = LivePlanSchema.safeParse(extractJson(r.content));
    if (!parsed.success) return { ...s, planner: "FAIL", error: `Planner probe: PLAN_SCHEMA_INVALID (${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")})` };
    const compiled = compileLivePlan(parsed.data, PROBE_QUESTION);
    if (!compiled.ok) return { ...s, planner: "FAIL", error: `Planner probe: ${compiled.code} (${compiled.message})` };
    if (compiled.sc.plan.decision !== "answer") return { ...s, planner: "FAIL", error: `Planner probe: UNSUPPORTED_PLAN (expected answer, got ${compiled.sc.plan.decision})` };
    s.planner = "PASS";
  } catch (e) { return { ...s, planner: "FAIL", error: `Planner probe failed — ${e instanceof Error ? e.message : "error"}` }; }
  return { ...s, reachable: true, eligible: true };
});

const AnalyzeInput = z.object({
  question: z.string().min(1).max(1000),
  mode: z.enum(["scripted", "live"]),
  profile: z.string().max(4000),
  schema: z.string().max(4000),
  definitions: z.array(z.object({ title: z.string(), version: z.number(), meaning: z.string(), expression: z.string(), grain: z.string() })).max(10),
  candidates: z.record(z.string(), z.array(z.string().max(200)).max(50)),
});

/** analyze-question: returns the model's raw JSON plan text; validated and compiled in the app, never executed directly. */
export const analyzeQuestion = createServerFn({ method: "POST" })
  .inputValidator(AnalyzeInput)
  .handler(async ({ data }): Promise<{ content: string; latencyMs: number; modelName: string }> => {
    const c = config();
    if (!c.baseUrl) throw new CodedError("PROVIDER_HTTP_ERROR", "Model endpoint not connected.");
    const p = buildPlannerPrompt(data);
    const r = await chat(c, [{ role: "system", content: p.system }, { role: "user", content: p.user }], PLAN_TIMEOUT_MS);
    return { ...r, modelName: c.modelName };
  });
