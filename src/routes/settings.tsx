import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { CheckBadge } from "@/components/proofsql/badges";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ProofSQL" },
      { name: "description", content: "Model endpoint status, parameter limit and live or scripted mode." },
      { property: "og:title", content: "Settings — ProofSQL" },
      { property: "og:description", content: "Honest model status: live open-weight model or clearly labelled scripted mode." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { model, mode, setMode, refreshModel, checking, lastOkCheck, livePlanner } = useApp();
  const liveReady = Boolean(livePlanner);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-semibold">Model endpoint</h2>
          <Button size="sm" variant="outline" className="ml-auto" onClick={refreshModel} disabled={checking}>{checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Run health check</Button>
        </div>
        <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Model name</dt><dd className="font-mono">{model?.modelName ?? "—"}</dd>
          <dt className="text-muted-foreground">Parameter limit</dt><dd className="font-mono">{model?.maxParams ?? "8B"} {model && !model.withinLimit && <span className="text-destructive">(exceeds 8B — live mode refused)</span>}</dd>
          <dt className="text-muted-foreground">Endpoint</dt><dd>{model?.configured ? <span className="font-mono">{model.endpointHost}</span> : "Model endpoint not connected"}</dd>
          <dt className="text-muted-foreground">Connection</dt><dd className="flex items-center gap-2">{model ? <CheckBadge state={model.reachable ? "PASS" : "FAIL"} /> : <CheckBadge state="NOT CHECKED" />}<span className="text-xs">{model?.reachable ? "Reachable" : model?.error ?? "Checking…"}</span></dd>
          <dt className="text-muted-foreground">Last check</dt><dd className="text-xs">{model ? new Date(model.checkedAt).toLocaleString() : "—"}</dd>
          <dt className="text-muted-foreground">Last successful check</dt><dd className="text-xs">{lastOkCheck ? new Date(lastOkCheck).toLocaleString() : "Never"}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Configured on the server with MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME and MODEL_MAX_PARAMETERS (an OpenAI-compatible endpoint serving an open-weight model of at most 8B parameters). The key never reaches the browser. No hidden fallback model is used.</p>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Planner mode</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => setMode("scripted")} className={`rounded-lg border p-3 text-left ${mode === "scripted" ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-sm font-medium">Scripted demo</div>
            <div className="text-xs text-muted-foreground">Scripted planner — no live model inference. Predefined questions only; SQL still runs against the real demo database.</div>
          </button>
          <button onClick={() => liveReady && setMode("live")} disabled={!liveReady} className={`rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${mode === "live" ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-sm font-medium">Live model</div>
            <div className="text-xs text-muted-foreground">{liveReady ? "Uses the configured open-weight model for planning; every plan is validated before execution." : "Unavailable: model endpoint not connected. Run a health check after configuring it."}</div>
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Current: <span className="font-medium">{mode}</span>. The mode never switches automatically.</p>
      </section>
    </div>
  );
}
