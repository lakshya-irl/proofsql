import { Link, createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/components/proofsql/AppProvider";
import { DecisionBadge } from "@/components/proofsql/badges";

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

function HistoryPage() {
  const { runs } = useApp();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Run History</h1>
        <p className="text-sm text-muted-foreground">Stored in this browser. Runs are snapshots: later definition edits never change them.</p>
      </div>
      {runs.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No runs yet. Ask a question on Ask & Verify.</p> : (
        <div className="overflow-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted"><tr>{["Time", "Question", "Decision", "Result", "Warnings", "Semantic version", "Dataset", "Model status", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</td>
                <td className="max-w-xs px-2 py-1.5">{r.question}</td>
                <td className="px-2 py-1.5"><DecisionBadge decision={r.decision} /></td>
                <td className="max-w-xs px-2 py-1.5">{r.summary || r.error}</td>
                <td className="px-2 py-1.5 font-mono">{r.evidence.filter((e) => e.state === "WARNING").length + r.checks.filter((c) => c.state === "WARNING").length}</td>
                <td className="px-2 py-1.5 font-mono">{r.definitions.map((d) => `${d.title} v${d.version}`).join(", ") || "—"}</td>
                <td className="px-2 py-1.5 font-mono">{r.snapshotId}</td>
                <td className="px-2 py-1.5">{r.modelStatus}</td>
                <td className="px-2 py-1.5"><Link to="/runs/$runId" params={{ runId: r.id }} className="text-primary hover:underline">Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
