import { createFileRoute } from "@tanstack/react-router";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { CheckBadge } from "@/components/proofsql/badges";
import { PrepareDemoButton, ReadinessList } from "@/components/proofsql/PrepareDemo";
import { AccountControls } from "@/components/proofsql/AccountControls";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ProofSQL" },
      { name: "description", content: "Model endpoint status, parameter limit, live or scripted mode, and demo preparation." },
      { property: "og:title", content: "Settings — ProofSQL" },
      { property: "og:description", content: "Honest model status: live open-weight model or clearly labelled scripted mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const SETUP = `ProofSQL live model setup
Add these server-side secrets (never in browser code):
  MODEL_BASE_URL        OpenAI-compatible base URL, e.g. https://your-host/v1
  MODEL_API_KEY         API key for that endpoint (leave empty if none)
  MODEL_NAME            Open-weight model, default Qwen/Qwen2.5-Coder-7B-Instruct
  MODEL_MAX_PARAMETERS  Parameter size, must be 8B or less (default 8B)
Then open Settings, click "Run health check", and select "Live model".
The endpoint must serve GET /models and POST /chat/completions.`;

function SettingsPage() {
  const { model, mode, setMode, refreshModel, checking, lastOkCheck, lastFailCheck, planner, modelStatusLabel } = useApp();
  const liveReady = planner.eligibleForLive;
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Settings</h1>
        <PrepareDemoButton className="ml-auto" />
      </div>
      <ReadinessList />
      <AccountControls />
      <p className="text-xs">Current status: <span className="font-medium">{modelStatusLabel}</span></p>
      {!liveReady && <p className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Live inference is unavailable. Scripted · no live model inference. Only predefined demo and evaluation questions are supported.</p>}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-semibold">Model endpoint</h2>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void refreshModel()} disabled={checking}>{checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Run health check</Button>
        </div>
        {planner.fallback && <p className="mb-2 rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Fallback provider — does not satisfy the AI-02 open-weight constraint.</p>}
        <dl className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Provider</dt><dd>{model?.providerLabel ?? "—"}</dd>
          <dt className="text-muted-foreground">Model ID</dt><dd className="break-all font-mono">{model?.modelName ?? "—"}</dd>
          <dt className="text-muted-foreground">Endpoint host</dt><dd>{model?.configured ? <span className="break-all font-mono">{model.endpointHost}</span> : "Model endpoint not connected"}</dd>
          <dt className="text-muted-foreground">Parameter count</dt><dd className="font-mono">{model?.maxParams ?? "UNKNOWN"}</dd>
          <dt className="text-muted-foreground">Open-weight compliance</dt><dd><CheckBadge state={model?.openWeight === "PASS" ? "PASS" : model?.openWeight === "FAIL" ? "FAIL" : "NOT CHECKED"} /> <span className="text-xs">{model?.openWeight ?? "UNKNOWN"}</span></dd>
          <dt className="text-muted-foreground">Transport</dt><dd><CheckBadge state={planner.transport === "pass" ? "PASS" : planner.transport === "fail" ? "FAIL" : "NOT CHECKED"} /></dd>
          <dt className="text-muted-foreground">Chat completion</dt><dd><CheckBadge state={planner.chatCompletion === "pass" ? "PASS" : planner.chatCompletion === "fail" ? "FAIL" : "NOT CHECKED"} /></dd>
          <dt className="text-muted-foreground">Planner schema</dt><dd><CheckBadge state={planner.plannerSchema === "pass" ? "PASS" : planner.plannerSchema === "fail" ? "FAIL" : "NOT CHECKED"} /></dd>
          <dt className="text-muted-foreground">Live demo eligible</dt><dd className="text-xs"><span className="font-semibold">{liveReady ? "YES" : "NO"}</span>{!liveReady && planner.errorMessage ? ` — ${planner.errorMessage}` : model?.latencyMs != null ? ` (chat probe ${model.latencyMs} ms)` : ""}</dd>
          <dt className="text-muted-foreground">Last check</dt><dd className="text-xs">{model ? new Date(model.checkedAt).toLocaleString() : "—"}</dd>
          <dt className="text-muted-foreground">Last successful check</dt><dd className="text-xs">{lastOkCheck ? new Date(lastOkCheck).toLocaleString() : "Never"}</dd>
          <dt className="text-muted-foreground">Last failed check</dt><dd className="text-xs">{lastFailCheck ? new Date(lastFailCheck).toLocaleString() : "Never"}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Health check runs three server-side probes: transport, a tiny chat completion, and a planner-schema probe (no SQL executed). The key stays on the server. No hidden fallback model is used.</p>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-semibold">Setup instructions</h2>
          <Button size="sm" variant="outline" className="ml-auto" onClick={async () => { try { await navigator.clipboard.writeText(SETUP); toast.success("Setup instructions copied"); } catch { toast.error("Clipboard not available"); } }}><Copy className="h-3 w-3" /> Copy setup instructions</Button>
        </div>
        <pre className="whitespace-pre-wrap rounded border border-border bg-muted p-2 font-mono text-[11px]">{SETUP}</pre>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Planner mode</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => liveReady && setMode("live")} disabled={!liveReady} aria-disabled={!liveReady} className={`rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${mode === "live" ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-sm font-medium">Live model (primary)</div>
            <div className="text-xs text-muted-foreground">{liveReady ? `Any question goes to ${model?.modelName}; every plan is schema-validated, firewalled and join-checked before execution.` : checking ? "Checking the model connection… (takes a few seconds)" : model?.error ? `Unavailable: ${model.error} Click "Run health check" to retry.` : "Not checked yet. Click \"Run health check\" above."}</div>
          </button>
          <button onClick={() => setMode("scripted")} className={`rounded-lg border p-3 text-left ${mode === "scripted" ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-sm font-medium">Scripted demo (backup)</div>
            <div className="text-xs text-muted-foreground">Scripted · no live model inference. Predefined questions only; anything else is refused, never faked. SQL still runs against the real demo database.</div>
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Current: <span className="font-medium">{mode}</span>. The mode never switches automatically between live and scripted.</p>
      </section>
    </div>
  );
}
