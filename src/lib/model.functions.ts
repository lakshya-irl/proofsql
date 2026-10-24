// Server-side proxy to the configured open-weight model. The API key never reaches the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct";

function config() {
  const baseUrl = process.env["MODEL_BASE_URL"] ?? "";
  const apiKey = process.env["MODEL_API_KEY"] ?? "";
  const modelName = process.env["MODEL_NAME"] || DEFAULT_MODEL;
  const maxParams = process.env["MODEL_MAX_PARAMETERS"] || "8B";
  const limit = parseFloat(maxParams);
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, modelName, maxParams, withinLimit: Number.isFinite(limit) && limit <= 8 };
}

export type ModelStatus = {
  configured: boolean; reachable: boolean; modelName: string; maxParams: string; withinLimit: boolean;
  endpointHost: string | null; checkedAt: string; error: string | null;
};

export const getModelStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ModelStatus> => {
  const c = config();
  const base: ModelStatus = {
    configured: Boolean(c.baseUrl), reachable: false, modelName: c.modelName, maxParams: c.maxParams, withinLimit: c.withinLimit,
    endpointHost: c.baseUrl ? new URL(c.baseUrl).host : null, checkedAt: new Date().toISOString(), error: null,
  };
  if (!c.baseUrl) return { ...base, error: "Model endpoint not connected (MODEL_BASE_URL is not set)." };
  if (!c.withinLimit) return { ...base, error: `MODEL_MAX_PARAMETERS=${c.maxParams} exceeds the 8B limit; live mode refused.` };
  try {
    const res = await fetch(`${c.baseUrl}/models`, { headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} });
    if (!res.ok) return { ...base, error: `Endpoint responded ${res.status}.` };
    return { ...base, reachable: true };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Endpoint unreachable." };
  }
});

export const callPlanner = createServerFn({ method: "POST" })
  .inputValidator(z.object({ prompt: z.string().min(1).max(8000) }))
  .handler(async ({ data }): Promise<{ content: string }> => {
    const c = config();
    if (!c.baseUrl) throw new Error("Model endpoint not connected.");
    if (!c.withinLimit) throw new Error("Configured model exceeds the 8B parameter limit.");
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify({ model: c.modelName, temperature: 0, messages: [{ role: "user", content: data.prompt }] }),
    });
    if (!res.ok) throw new Error(`Model endpoint error ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model returned no content.");
    return { content };
  });
