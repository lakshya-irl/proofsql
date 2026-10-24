import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Ban, CircleHelp, Loader2, ShieldAlert } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { SchemaPanel } from "@/components/proofsql/SchemaPanel";
import { ProofCard, ResultTable } from "@/components/proofsql/ProofCard";
import { JoinRadarPanel } from "@/components/proofsql/JoinRadarPanel";
import { DecisionBadge, JoinBadge, ModeBadge } from "@/components/proofsql/badges";
import { PrepareDemoButton, ReadinessList } from "@/components/proofsql/PrepareDemo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_QUESTIONS } from "@/lib/proofsql/planner";
import { isAnswer, type RunResult } from "@/lib/proofsql/pipeline";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ask & Verify — ProofSQL" },
      { name: "description", content: "Ask a question, then see whether ProofSQL answers, clarifies, abstains or blocks — with SQL and evidence." },
      { property: "og:title", content: "Ask & Verify — ProofSQL" },
      { property: "og:description", content: "Answer, clarify, abstain or block — with SQL, join safety and a Proof Card." },
    ],
  }),
  component: AskPage,
});

function AskPage() {
  const { ask, db, mode, livePlanner, modelStatusLabel, model } = useApp();
  const [q, setQ] = useState("");
  const [run, setRun] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const liveBlocked = mode === "live" && !livePlanner;

  const submit = async (question: string) => {
    if (!question.trim()) return;
    setQ(question); setBusy(true);
    try { setRun(await ask(question)); } finally { setBusy(false); }
  };

  const center = (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="q" className="text-base font-semibold">Ask a question about the demo database</label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ModeBadge label={modelStatusLabel} live={mode === "live" && Boolean(livePlanner)} />
            <span className="text-[11px] text-muted-foreground">Model endpoint: {model ? (model.reachable ? `reachable (${model.modelName})` : "not connected") : "checking…"}</span>
            <PrepareDemoButton size="sm" />
          </div>
        </div>
        <Textarea id="q" value={q} onChange={(e) => setQ(e.target.value)} rows={2} className="mt-2"
          placeholder="e.g. Which schools had falling enrolment last year?"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(q); } }} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={() => submit(q)} disabled={!db || busy || !q.trim() || liveBlocked}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Ask & verify
          </Button>
          {!db && <span className="text-xs text-muted-foreground">Waiting for database…</span>}
          {liveBlocked && <span className="text-xs text-destructive">Live mode selected but the model endpoint is not connected. Switch to scripted mode in Settings.</span>}
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Demo questions{mode === "scripted" ? " (scripted mode supports only these and the evaluation questions)" : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_QUESTIONS.map((d) => (
              <button key={d} onClick={() => submit(d)} disabled={!db || busy || liveBlocked}
                className="rounded border border-border bg-background px-2 py-1 text-left text-xs hover:border-primary hover:text-primary disabled:opacity-50">{d}</button>
            ))}
          </div>
        </div>
      </div>
      <ReadinessList compact />
      {run ? <Outcome run={run} onAsk={submit} /> : (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          ProofSQL profiles the data first, then decides whether a question can be answered. Results appear here with SQL, warnings and a Proof Card.
        </div>
      )}
    </div>
  );

  const proof = run ? <ProofCard run={run} /> : <p className="text-sm text-muted-foreground">The Proof Card for the latest run appears here.</p>;

  return (
    <>
      <h1 className="sr-only">Ask & Verify</h1>
      <div className="hidden gap-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_380px]">
        <aside aria-label="Schema" className="max-h-[calc(100vh-7rem)] overflow-auto"><SchemaPanel /></aside>
        <section aria-label="Question and answer">{center}</section>
        <aside aria-label="Proof Card" className="max-h-[calc(100vh-7rem)] overflow-auto rounded-lg border border-border bg-card p-4">{proof}</aside>
      </div>
      <Tabs defaultValue="ask" className="lg:hidden">
        <TabsList className="w-full"><TabsTrigger value="schema">Schema</TabsTrigger><TabsTrigger value="ask">Ask</TabsTrigger><TabsTrigger value="proof">Proof Card</TabsTrigger></TabsList>
        <TabsContent value="schema"><SchemaPanel /></TabsContent>
        <TabsContent value="ask">{center}</TabsContent>
        <TabsContent value="proof"><div className="rounded-lg border border-border bg-card p-4">{proof}</div></TabsContent>
      </Tabs>
    </>
  );
}

function Outcome({ run, onAsk }: { run: RunResult; onAsk: (q: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={run.decision} />
          <span className="text-xs text-muted-foreground">{run.plannerLabel}</span>
        </div>
        <p className="mt-2 text-base font-medium">{run.summary || run.error}</p>
        {run.radar && <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">Join radar: <JoinBadge status={run.radar.status} />{run.joinStatus && run.joinStatus !== run.radar.status && <JoinBadge status={run.joinStatus} />}</p>}
        {isAnswer(run.decision) && <p className="mt-1 text-xs">Confidence: <span className="font-medium">{run.confidence.level}</span> — {run.confidence.reasons[0]}</p>}
        {run.decision === "CLARIFY" && (
          <div className="mt-3 space-y-2">
            <ul className="space-y-1">{run.clarifications.map((c) => <li key={c} className="flex gap-2 text-sm"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />{c}</li>)}</ul>
            {run.suggestions.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                {run.suggestions.map((s) => (
                  <button key={s.label} onClick={() => onAsk(s.question)} className="rounded border border-primary/40 bg-accent px-3 py-2 text-left text-sm text-accent-foreground hover:border-primary">{s.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {run.decision === "ABSTAIN" && (
          <div className="mt-3 rounded border border-border bg-muted p-3 text-sm">
            <p><span className="font-medium">Why:</span> {run.reason}</p>
            {run.recommendedFix && <p className="mt-1 text-muted-foreground">Suggested: {run.recommendedFix}</p>}
          </div>
        )}
        {run.decision === "BLOCKED" && (
          <div className="mt-3 rounded border border-destructive bg-destructive-soft p-3 text-sm text-destructive">
            <p className="flex items-center gap-2 font-medium"><Ban className="h-4 w-4" aria-hidden /> Not executed</p>
            <ul className="mt-1 list-disc pl-5">{run.blockedReasons.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        {run.decision === "ERROR" && (
          <p className="mt-2 flex items-center gap-2 text-sm text-destructive"><ShieldAlert className="h-4 w-4" aria-hidden /> {run.error}</p>
        )}
      </div>
      {run.radar && <JoinRadarPanel run={run} />}
      {run.result && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Result preview</h3>
          <ResultTable run={run} />
        </div>
      )}
    </div>
  );
}
