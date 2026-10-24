import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { CheckBadge, DecisionBadge, JoinBadge } from "@/components/proofsql/badges";
import { EVAL_CASES, runEvaluation, summarize, type EvalOutcome } from "@/lib/proofsql/evaluation";
import { DEFAULT_CONTRACT, current } from "@/lib/proofsql/contract";
import { FIXTURE_VERSION } from "@/lib/proofsql/schema";
import { SqlBlock } from "@/components/proofsql/ProofCard";
import { runModeOf } from "@/lib/proofsql/readiness";
import { COVID_CASES, runCovidEvaluation } from "@/lib/proofsql/covidEvaluation";
import { analyzeCovidQuestion } from "@/lib/model.functions";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation Lab — ProofSQL" },
      { name: "description", content: "Thirteen evaluation cases measured live: semantic answer correctness, clarifications, value grounding, abstentions, join-risk detection and blocks." },
      { property: "og:title", content: "Evaluation Lab — ProofSQL" },
      { property: "og:description", content: "Measured results computed from the detailed rows, not claims." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EvalPage,
});

const flag = (v: boolean | null) => (v === null ? <span className="text-muted-foreground">n/a</span> : <CheckBadge state={v ? "PASS" : "FAIL"} />);

function EvalPage() {
  const { db, contract, mode, planner, modelStatusLabel, livePlanner, prepareDemo, preparing, dataset, covidDb, countries } = useApp();
  const [res, setRes] = useState<EvalOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [ranWith, setRanWith] = useState<{ mode: string; label: string } | null>(null);
  const cases = dataset === "covid" ? COVID_CASES : EVAL_CASES;
  const activeDb = dataset === "covid" ? covidDb : db;
  useEffect(() => { setRes(null); setRanAt(null); setRanWith(null); }, [dataset, mode]);
  const drafts = dataset === "covid" ? [] : (["enrolment", "payment_total", "academic_year"] as const).filter((k) => current(contract, k).status !== "APPROVED");
  const liveBlocked = mode === "live" && !livePlanner;

  const run = async (useBaseline = false) => {
    if (!activeDb) return;
    setBusy(true);
    try {
      setRes(dataset === "covid"
        ? await runCovidEvaluation({ db: activeDb, countries, mode, modelStatus: modelStatusLabel, livePlanner: mode === "live" && planner.eligibleForLive ? (question) => analyzeCovidQuestion({ data: { question } }) : undefined })
        : await runEvaluation({ db: activeDb, contract: useBaseline ? DEFAULT_CONTRACT() : contract, mode, modelName: planner.model ?? "unknown", modelStatus: modelStatusLabel, livePlanner }));
      setRanAt(new Date().toISOString());
      setRanWith({ mode, label: modelStatusLabel });
    } finally { setBusy(false); }
  };
  const resetAndRun = async () => {
    setRes(null);
    await prepareDemo(false);
    await run(true);
  };

  const metrics = res ? summarize(res) : [];
  const failed = res?.filter((o) => !o.passed) ?? [];
  const targetMet = res && failed.length === 0 && res.length === cases.length;
  const LIVE_IDS = dataset === "covid" ? ["CV1", "CV2", "CV3", "CV4", "CV5"] : ["A1", "A2", "A3", "J1", "J2"];
  const liveUsed = res?.filter((o) => o.run.liveInference).map((o) => o.c.id) ?? [];
  // "Live" headline only when every model-dependent case really used live inference.
  const fullyLive = Boolean(res) && LIVE_IDS.every((id) => liveUsed.includes(id));
  const runKind = !res ? null : fullyLive ? "Live provider" : liveUsed.length ? "Partial live (some cases without inference)" : "Scripted baseline";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Evaluation Lab</h1>
          <p className="text-sm text-muted-foreground">{cases.length} cases · {dataset === "covid" ? "Real COVID-19 country totals" : `School fixture ${FIXTURE_VERSION}`} · <span className="font-medium">{modelStatusLabel}</span></p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {dataset === "school" && <Button variant="outline" onClick={resetAndRun} disabled={busy || preparing || liveBlocked}>{preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reset and prepare evaluation</Button>}
          <Button onClick={() => run()} disabled={!activeDb || busy || liveBlocked}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run evaluation</Button>
        </div>
      </div>
      {!planner.eligibleForLive && mode === "live" && <p className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Live planner not verified{planner.errorCode ? ` (${planner.errorCode})` : ""}. Live runs are disabled; switch to scripted in Settings.</p>}
      {mode === "scripted" && <p className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Scripted · no live model inference. These results measure the validation pipeline with scripted plans and are not live-model accuracy.</p>}
      {liveBlocked && <p className="text-xs text-destructive">Live mode is selected but the model endpoint is not connected.</p>}
      {drafts.length > 0 && <p className="text-xs text-warning-foreground">Draft definitions ({drafts.join(", ")}) make governed answer cases return CLARIFY. Use "Reset and prepare evaluation" to restore the approved baseline.</p>}

      {res && (
        <>
          <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{runKind}</span> · Live inference used in {liveUsed.length}/{res.length} cases{liveUsed.length ? ` (${liveUsed.join(", ")})` : ""} · Status at run: {ranWith?.label} · Model: <span className="font-mono">{fullyLive || liveUsed.length ? res.find((o) => o.run.liveInference)?.run.modelName : "none (scripted)"}</span> · Run at {ranAt && new Date(ranAt).toLocaleString()} · Average latency {Math.round(res.reduce((a, o) => a + o.ms, 0) / res.length)} ms</div>
          {targetMet
            ? <p className="rounded border border-success bg-success-soft p-2 text-xs text-success">{runKind}: all {res.length} cases passed. Summary counts below are derived from these measured rows.</p>
            : <p className="rounded border border-destructive bg-destructive-soft p-2 text-xs text-destructive">{failed.length} case(s) failed: {failed.map((o) => o.c.id).join(", ")}. See highlighted rows below.</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((m) => {
              const bad = m.failing.length > 0;
              return (
                <div key={m.label} className={`rounded-lg border p-3 ${bad ? "border-destructive bg-destructive-soft" : "border-border bg-card"}`}>
                  <div className="text-2xl font-semibold tabular-nums">{m.num}/{m.den}</div>
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">{bad ? `${m.invert ? "Wrong" : "Failing"}: ${m.failing.join(", ")}` : `Rows: ${m.ids.length > 6 ? "all" : m.ids.join(", ")}`}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted"><tr>{["ID", "Category", "Question", "Expected", "Actual", "Decision", "Semantic answer", "Warnings", "Join radar", "Join status", "Security", "Inference used", "Mode", "Provider", "Model", "Error code", "Overall", "ms"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{cases.map((c) => {
            const o = res?.find((x) => x.c.id === c.id);
            return (
              <Fragment key={c.id}>
                <tr className={`border-t border-border ${o && !o.passed ? "bg-destructive-soft" : ""}`}>
                  <td className="px-2 py-1.5 font-mono">{c.id}</td><td className="px-2 py-1.5">{c.category}</td><td className="max-w-sm px-2 py-1.5">{c.question}</td>
                  <td className="px-2 py-1.5"><div className="flex flex-col gap-1">{c.expected.map((d) => <DecisionBadge key={d} decision={d} />)}</div></td>
                  <td className="px-2 py-1.5">{o ? <DecisionBadge decision={o.run.decision} /> : "—"}</td>
                  <td className="px-2 py-1.5">{o ? <CheckBadge state={o.decisionOk ? "PASS" : "FAIL"} /> : <CheckBadge state="NOT CHECKED" />}</td>
                  <td className="px-2 py-1.5">{o ? flag(o.answerOk) : "—"}</td>
                  <td className="px-2 py-1.5">{o ? flag(o.warningsOk) : "—"}</td>
                  <td className="px-2 py-1.5">{o ? flag(o.joinOk) : "—"}</td>
                  <td className="px-2 py-1.5">{o?.run.radar ? <div className="flex flex-col gap-1"><JoinBadge status={o.run.radar.status} />{o.run.joinStatus && o.run.joinStatus !== o.run.radar.status && <JoinBadge status={o.run.joinStatus} />}</div> : <span className="text-muted-foreground">n/a</span>}</td>
                  <td className="px-2 py-1.5">{o ? flag(o.securityOk) : "—"}</td>
                  <td className="px-2 py-1.5">{o ? (o.run.liveInference ? "Yes" : "No") : "—"}</td>
                  <td className="px-2 py-1.5">{o ? runModeOf(o.run) : "—"}</td>
                  <td className="px-2 py-1.5">{o ? (o.run.liveInference ? planner.provider ?? "unknown" : "—") : "—"}</td>
                  <td className="px-2 py-1.5 font-mono">{o ? (o.run.liveInference ? o.run.modelName : "—") : "—"}</td>
                  <td className="px-2 py-1.5 font-mono">{o?.run.errorCode ?? "—"}</td>
                  <td className="px-2 py-1.5">{o ? <CheckBadge state={o.passed ? "PASS" : "FAIL"} /> : "—"}</td>
                  <td className="px-2 py-1.5 font-mono">{o?.ms ?? "—"}</td>
                </tr>
                {(c.reference || c.expectedWarnings) && (
                  <tr className="border-t border-border/50"><td colSpan={18} className="px-2 pb-2">
                    <details>
                      <summary className="cursor-pointer text-[11px] text-muted-foreground">Debugging trace{c.expectedWarnings ? ` · expected warnings: ${c.expectedWarnings.join(", ")}` : ""}</summary>
                      {c.reference && <div className="mt-1"><p className="mb-1 text-[11px] text-muted-foreground">Reference SQL (debugging only — correctness compares normalized result rows on columns {c.compare?.join(", ")}):</p><SqlBlock sql={c.reference} /></div>}
                    </details>
                  </td></tr>
                )}
              </Fragment>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
