import { createFileRoute } from "@tanstack/react-router";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { CheckBadge } from "@/components/proofsql/badges";
import { PrepareDemoButton, ReadinessList } from "@/components/proofsql/PrepareDemo";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ProofSQL" },
      { name: "description", content: "Model endpoint status, parameter limit, live or scripted mode, and demo preparation." },
      { property: "og:title", content: "Settings — ProofSQL" },
      { property: "og:description", content: "Honest model status: live open-weight model or clearly labelled scripted mode." },
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
  const { model, mode, setMode, refreshModel, checking, lastOkCheck, lastFailCheck, livePlanner } = useApp();
  const liveReady = Boolean(livePlanner);
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Settings</h1>
        <PrepareDemoButton className="ml-auto" />
      </div>
      <ReadinessList />
      {!liveReady && <p className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Live inference is unavailable. Scripted planner — no live model inference. Only predefined demo and evaluation questions are supported.</p>}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-semibold">Model endpoint</h2>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void refreshModel()} disabled={checking}>{checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Run health check</Button>
        </div>
        <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Model name</dt><dd className="font-mono">{model?.modelName ?? "—"}</dd>
          <dt className="text-muted-foreground">Parameter limit</dt><dd className="font-mono">{model?.maxParams ?? "8B"} {model && !model.withinLimit && <span className="text-destructive">(exceeds 8B — live mode refused)</span>}</dd>
          <dt className="text-muted-foreground">Endpoint</dt><dd>{model?.configured ? <span className="font-mono">{model.endpointHost}</span> : "Model endpoint not connected"}</dd>
          <dt className="text-muted-foreground">Connection</dt><dd className="flex items-center gap-2">{model ? <CheckBadge state={model.reachable ? "PASS" : "FAIL"} /> : <CheckBadge state="NOT CHECKED" />}<span className="text-xs">{model?.reachable ? `Reachable${model.latencyMs != null ? ` (${model.latencyMs} ms)` : ""}` : model?.error ?? "Checking…"}</span></dd>
          <dt className="text-muted-foreground">Last check</dt><dd className="text-xs">{model ? new Date(model.checkedAt).toLocaleString() : "—"}</dd>
          <dt className="text-muted-foreground">Last successful check</dt><dd className="text-xs">{lastOkCheck ? new Date(lastOkCheck).toLocaleString() : "Never"}</dd>
          <dt className="text-muted-foreground">Last failed check</dt><dd className="text-xs">{lastFailCheck ? new Date(lastFailCheck).toLocaleString() : "Never"}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Health check calls the endpoint's model list with an 8-second timeout. The key stays on the server. No hidden fallback model is used.</p>
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
          <button onClick={() => setMode("scripted")} className={`rounded-lg border p-3 text-left ${mode === "scripted" ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-sm font-medium">Scripted demo</div>
            <div className="text-xs text-muted-foreground">Scripted planner — no live model inference. Predefined questions only; anything else is refused, never faked. SQL still runs against the real demo database.</div>
          </button>
          <button onClick={() => liveReady && setMode("live")} disabled={!liveReady} className={`rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${mode === "live" ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-sm font-medium">Live model</div>
            <div className="text-xs text-muted-foreground">{liveReady ? "Arbitrary questions go to the configured open-weight model; every plan is schema-validated, firewalled and join-checked before execution." : "Unavailable: model endpoint not connected. Run a health check after configuring it."}</div>
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Current: <span className="font-medium">{mode}</span>. The mode never switches automatically between live and scripted.</p>
      </section>
    </div>
  );
}
