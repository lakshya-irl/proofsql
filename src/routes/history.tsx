import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "@/components/proofsql/AppProvider";
import { DecisionBadge } from "@/components/proofsql/badges";
import type { Decision } from "@/lib/proofsql/pipeline";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Run History — ProofSQL" },
      { name: "description", content: "Every analysis run with its decision, SQL, warnings and the definition versions it used." },
      { property: "og:title", content: "Run History — ProofSQL" },
      { property: "og:description", content: "Reopen any past run and inspect its full Proof Card." },
    ],
  }),
  component: HistoryPage,
});

const FILTERS: { label: string; match: Decision[] }[] = [
  { label: "ANSWER", match: ["ANSWER", "ANSWER_WITH_WARNING"] },
  { label: "CLARIFY", match: ["CLARIFY"] },
  { label: "ABSTAIN", match: ["ABSTAIN"] },
  { label: "BLOCKED", match: ["BLOCKED"] },
  { label: "ERROR", match: ["ERROR"] },
];

function HistoryPage() {
  const { runs } = useApp();
  const [filter, setFilter] = useState<string | null>(null);
  const f = FILTERS.find((x) => x.label === filter);
  const shown = f ? runs.filter((r) => f.match.includes(r.decision)) : runs;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Run History</h1>
        <p className="text-sm text-muted-foreground">Stored in this browser. Runs are snapshots: later definition edits never change them.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by decision">
        <button onClick={() => setFilter(null)} className={`rounded border px-2 py-1 text-xs ${filter === null ? "border-primary text-primary" : "border-border"}`}>All ({runs.length})</button>
        {FILTERS.map((x) => (
          <button key={x.label} onClick={() => setFilter(x.label)} className={`rounded border px-2 py-1 font-mono text-xs ${filter === x.label ? "border-primary text-primary" : "border-border"}`}>
            {x.label} ({runs.filter((r) => x.match.includes(r.decision)).length})
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{runs.length ? "No runs match this filter." : "No runs yet. Ask a question on Ask & Verify."}</p> : (
        <div className="overflow-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted"><tr>{["Run ID", "Time", "Question", "Decision", "Result", "SQL", "Warnings", "Semantic version", "Dataset", "Mode / model", "Latency", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-2 py-1.5 font-mono text-[10px]">{r.id}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</td>
                <td className="max-w-xs px-2 py-1.5">{r.question}</td>
                <td className="px-2 py-1.5"><DecisionBadge decision={r.decision} /></td>
                <td className="max-w-xs px-2 py-1.5">{r.summary || r.error}</td>
                <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[10px]" title={r.sql ?? ""}>{r.sql ?? "—"}</td>
                <td className="px-2 py-1.5 font-mono">{r.evidence.filter((e) => e.state === "WARNING").length + r.checks.filter((c) => c.state === "WARNING").length}</td>
                <td className="px-2 py-1.5 font-mono">{r.definitions.map((d) => `${d.title} v${d.version}`).join(", ") || "—"}</td>
                <td className="px-2 py-1.5 font-mono">{r.snapshotId}</td>
                <td className="px-2 py-1.5">{r.mode} · <span className="font-mono">{r.modelName}</span>{r.liveInference ? " (live)" : ""}</td>
                <td className="px-2 py-1.5 font-mono">{r.latencyMs != null ? `${r.latencyMs} ms` : "—"}</td>
                <td className="px-2 py-1.5"><Link to="/runs/$runId" params={{ runId: r.id }} className="text-primary hover:underline">Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
