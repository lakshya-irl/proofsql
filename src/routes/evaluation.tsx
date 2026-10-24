import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { CheckBadge, DecisionBadge } from "@/components/proofsql/badges";
import { EVAL_CASES, runEvaluation, type EvalOutcome } from "@/lib/proofsql/evaluation";
import { current } from "@/lib/proofsql/contract";
import { FIXTURE_VERSION } from "@/lib/proofsql/schema";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation Lab — ProofSQL" },
      { name: "description", content: "Twelve evaluation cases measured live: correct answers, clarifications, abstentions, join-risk detection and blocks." },
      { property: "og:title", content: "Evaluation Lab — ProofSQL" },
      { property: "og:description", content: "Measured results with numerators and denominators, not claims." },
    ],
  }),
  component: EvalPage,
});

function EvalPage() {
  const { db, contract, mode, model, modelStatusLabel, livePlanner } = useApp();
  const [res, setRes] = useState<EvalOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const drafts = (["enrolment", "payment_total", "academic_year"] as const).filter((k) => current(contract, k).status !== "APPROVED");
  const liveBlocked = mode === "live" && !livePlanner;

  const run = async () => {
    if (!db) return;
    setBusy(true);
    try {
      setRes(await runEvaluation({ db, contract, mode, modelName: model?.modelName ?? "Qwen/Qwen2.5-Coder-7B-Instruct", modelStatus: modelStatusLabel, livePlanner }));
      setRanAt(new Date().toISOString());
    } finally { setBusy(false); }
  };

  const metric = (label: string, cases: EvalOutcome[], ok: (o: EvalOutcome) => boolean) => ({ label, num: cases.filter(ok).length, den: cases.length });
  const metrics = res ? [
    metric("Answer correctness (matches reference SQL)", res.filter((o) => o.c.reference), (o) => o.answerOk === true),
    metric("Correct clarification", res.filter((o) => o.c.category === "clarification"), (o) => o.decisionOk),
    metric("Correct abstention", res.filter((o) => o.c.category === "abstention"), (o) => o.decisionOk),
    metric("Join-risk detection", res.filter((o) => o.c.expectJoinRisk), (o) => o.joinOk === true),
    metric("Security block", res.filter((o) => o.c.category === "blocked"), (o) => o.decisionOk),
    metric("Wrong-answer rate (ANSWER given when not expected, or incorrect)", res, (o) => (o.run.decision === "ANSWER" && o.c.expected !== "ANSWER") || o.answerOk === false),
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Evaluation Lab</h1>
          <p className="text-sm text-muted-foreground">{EVAL_CASES.length} cases run through the full pipeline against fixture <span className="font-mono">{FIXTURE_VERSION}</span>. A small local fixture does not prove generalization.</p>
        </div>
        <Button className="ml-auto" onClick={run} disabled={!db || busy || liveBlocked}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run evaluation</Button>
      </div>
      {mode === "scripted" && <p className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Scripted planner — no live model inference. These results measure the validation pipeline with scripted plans and are not live-model accuracy.</p>}
      {liveBlocked && <p className="text-xs text-destructive">Live mode is selected but the model endpoint is not connected.</p>}
      {drafts.length > 0 && <p className="text-xs text-warning-foreground">Draft definitions ({drafts.join(", ")}) will make governed answer cases return CLARIFY. Approve them in Semantic Contract to evaluate answers.</p>}

      {res && (
        <>
          <div className="text-xs text-muted-foreground">Planner: {modelStatusLabel} · Model: <span className="font-mono">{model?.modelName}</span> · Run at {ranAt && new Date(ranAt).toLocaleString()} · Average latency {Math.round(res.reduce((a, o) => a + o.ms, 0) / res.length)} ms</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-border bg-card p-3">
                <div className="text-2xl font-semibold tabular-nums">{m.num}/{m.den}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted"><tr>{["ID", "Category", "Question", "Expected", "Actual", "Decision", "Answer check", "Join radar", "ms"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{EVAL_CASES.map((c) => {
            const o = res?.find((x) => x.c.id === c.id);
            return (
              <tr key={c.id} className="border-t border-border">
                <td className="px-2 py-1.5 font-mono">{c.id}</td><td className="px-2 py-1.5">{c.category}</td><td className="max-w-sm px-2 py-1.5">{c.question}</td>
                <td className="px-2 py-1.5"><DecisionBadge decision={c.expected} /></td>
                <td className="px-2 py-1.5">{o ? <DecisionBadge decision={o.run.decision} /> : "—"}</td>
                <td className="px-2 py-1.5">{o ? <CheckBadge state={o.decisionOk ? "PASS" : "FAIL"} /> : <CheckBadge state="NOT CHECKED" />}</td>
                <td className="px-2 py-1.5">{o && o.answerOk !== null ? <CheckBadge state={o.answerOk ? "PASS" : "FAIL"} /> : <span className="text-muted-foreground">n/a</span>}</td>
                <td className="px-2 py-1.5">{o?.run.radar ? <CheckBadge state={o.run.radar.state} /> : <span className="text-muted-foreground">n/a</span>}</td>
                <td className="px-2 py-1.5 font-mono">{o?.ms ?? "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
