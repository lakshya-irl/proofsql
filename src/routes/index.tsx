import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Ban, CircleHelp, Loader2, ShieldAlert, Square, Globe, SearchCheck } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { SchemaPanel } from "@/components/proofsql/SchemaPanel";
import { ProofCard, ResultTable } from "@/components/proofsql/ProofCard";
import { JoinRadarPanel } from "@/components/proofsql/JoinRadarPanel";
import { DecisionBadge, JoinBadge } from "@/components/proofsql/badges";
import { PrepareDemoButton, ReadinessList } from "@/components/proofsql/PrepareDemo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_QUESTIONS } from "@/lib/proofsql/planner";
import { isAnswer, type RunResult } from "@/lib/proofsql/pipeline";
import { toast } from "sonner";
import { safeMessage } from "@/components/proofsql/ErrorBoundary";
import { CovidSchema } from "@/components/proofsql/CovidViews";
import { COVID_CASES } from "@/lib/proofsql/covidEvaluation";
import { simpleAnswer } from "@/lib/proofsql/presentation";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ask & Verify — ProofSQL" },
      { name: "description", content: "Ask a question, then see whether ProofSQL answers, clarifies, abstains or blocks — with SQL and evidence." },
      { property: "og:title", content: "Ask & Verify — ProofSQL" },
      { property: "og:description", content: "Answer, clarify, abstain or block — with SQL, join safety and a Proof Card." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AskPage,
});

function AskPage() {
  const { ask, db, mode, livePlanner, dataset, covidDb, askCovid } = useApp();
  const [q, setQ] = useState("");
  const [run, setRun] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const liveBlocked = mode === "live" && !livePlanner;
  const proofPane = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | null>(null);
  const activeDb = dataset === "covid" ? covidDb : db;
  const schema = dataset === "covid" ? <CovidSchema /> : <SchemaPanel />;
  const questions = dataset === "covid" ? COVID_CASES.map((c) => c.question) : DEMO_QUESTIONS;
  useEffect(() => { setRun(null); setQ(""); }, [dataset]);
  // A new result always opens at its summary header, never mid-way through the previous card.
  useEffect(() => { proofPane.current?.scrollTo({ top: 0 }); }, [run?.id]);

  const submit = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ(question); setBusy(true); setRun(null);
    const control = new AbortController(); controller.current = control;
    try { setRun(await (dataset === "covid" ? askCovid(question, mode === "scripted" ? COVID_CASES.find((c) => c.question === question)?.menu : undefined, control.signal) : ask(question, control.signal))); }
    catch (e) { toast.error("The question could not be checked", { description: `${safeMessage(e)} — nothing was executed. Please try again.` }); }
    finally { setBusy(false); controller.current = null; }
  };

  const center = (
    <div className="space-y-4">
      <div className="border-y border-border bg-card p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="q" className="text-lg font-semibold">What would you like to know?</label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {dataset === "school" && <PrepareDemoButton size="sm" />}
          </div>
        </div>
        <Textarea id="q" value={q} onChange={(e) => setQ(e.target.value)} rows={2} className="mt-2"
          placeholder={dataset === "covid" ? "How many deaths did India report in December 2021?" : "Which schools had falling enrolment last year?"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(q); } }} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={() => submit(q)} disabled={!activeDb || busy || !q.trim() || liveBlocked}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {busy ? "Checking…" : "Ask & verify"}
          </Button>
          {busy && <Button variant="destructive" onClick={() => controller.current?.abort()}><Square className="h-4 w-4" /> Stop query</Button>}
          {!activeDb && <span className="text-xs text-muted-foreground">Waiting for database…</span>}
          {liveBlocked && <span className="text-xs text-destructive">Question processing is unavailable. Check the connection in Settings.</span>}
        </div>
        <div className="mt-3">
          <p className="mb-3 text-xs font-medium text-muted-foreground">{mode === "scripted" ? "Choose a supported question below" : "Suggested questions"}</p>
          <div className="flex flex-wrap gap-1.5">
            {questions.slice(0, 5).map((d) => (
              <Button variant="outline" key={d} onClick={() => submit(d)} disabled={!activeDb || busy || liveBlocked}
                className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-left text-sm"><ArrowRight className="h-3 w-3 shrink-0" />{d}</Button>
            ))}
          </div>
          <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">More questions</summary><div className="mt-2 flex flex-wrap gap-2">{questions.slice(5).map((d) => <Button key={d} variant="outline" className="h-auto whitespace-normal text-left text-xs" disabled={!activeDb || busy || liveBlocked} onClick={() => submit(d)}>{d}</Button>)}</div></details>
        </div>
      </div>
      {dataset === "school" && <ReadinessList compact />}
      {run ? <Outcome run={run} onAsk={submit} /> : (
        <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <SearchCheck className="h-6 w-6 text-primary" /> No question answered yet.
        </div>
      )}
    </div>
  );

  const proof = busy ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking “{q}”…</p>
    : run ? <ProofCard key={run.id} run={run} onAsk={submit} /> : <p className="text-sm text-muted-foreground">No evidence to review yet.</p>;

  return (
    <>
      <div className="mb-7 flex items-start gap-4"><Globe className="mt-1 h-8 w-8 shrink-0 text-primary" /><div><h1 className="text-3xl font-semibold">{dataset === "covid" ? "COVID-19 insights" : "School data insights"}</h1><p className="mt-2 text-sm text-muted-foreground">{dataset === "covid" ? "Reported cases, deaths and recoveries · January 2020 – April 2022" : "Synthetic education records for testing · Not real student data"}</p></div></div>
      <div className="hidden gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Question and answer">{center}</section>
        <aside ref={proofPane} aria-label="Proof Card" className="max-h-[calc(100vh-7rem)] overflow-auto border-l border-border bg-card p-4"><h2 className="mb-5 text-lg font-semibold">Evidence &amp; notes</h2>{proof}<details className="mt-6 border-t border-border pt-3"><summary className="cursor-pointer text-sm">About this data</summary><div className="pt-3">{schema}</div></details></aside>
      </div>
      <Tabs defaultValue="ask" className="lg:hidden">
        <TabsList className="w-full"><TabsTrigger value="schema">About the data</TabsTrigger><TabsTrigger value="ask">Ask</TabsTrigger><TabsTrigger value="proof">Evidence</TabsTrigger></TabsList>
        <TabsContent value="schema">{schema}</TabsContent>
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
        </div>
        <p className="mt-3 text-xl font-medium leading-relaxed">{simpleAnswer(run)}</p>
        {run.datasetName.includes("COVID") && <p className="mt-3 text-xs text-muted-foreground">Source: Johns Hopkins CSSE. Historical reported totals, not current figures.</p>}
        {run.evidence.filter((e) => e.state === "WARNING").map((e, i) => <p key={i} className="mt-2 border-l-2 border-warning pl-3 text-sm text-warning-foreground">{e.detail}</p>)}
        {run.radar && <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">Join radar: <JoinBadge status={run.radar.status} />{run.joinStatus && run.joinStatus !== run.radar.status && <JoinBadge status={run.joinStatus} />}</p>}
        {isAnswer(run.decision) && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Answer confidence: {run.confidence.level}</summary><p className="mt-2">{run.confidence.reasons[0]}</p></details>}
        {run.decision === "CLARIFY" && (
          <div className="mt-3 space-y-2">
            <ul className="space-y-1">{run.clarifications.map((c) => <li key={c} className="flex gap-2 text-sm"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />{c}</li>)}</ul>
            {run.suggestions.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                {run.suggestions.map((s) => (
                  <Button key={s.label} variant="outline" onClick={() => onAsk(s.question)} className="h-auto whitespace-normal justify-start text-left">{s.label}</Button>
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
          <div className="mt-2 text-sm text-destructive">
            <p className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" aria-hidden /> {run.error}</p>
            {run.developerTrace && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Developer trace (secrets removed)</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">{run.developerTrace}</pre></details>}
          </div>
        )}
      </div>
      {run.radar && <JoinRadarPanel run={run} />}
      {run.result && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-base font-semibold">The numbers</h3>
          <ResultTable run={run} />
        </div>
      )}
    </div>
  );
}
