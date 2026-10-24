import { Link, createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/components/proofsql/AppProvider";
import { ProofCard, ResultTable } from "@/components/proofsql/ProofCard";
import { JoinRadarPanel } from "@/components/proofsql/JoinRadarPanel";

export const Route = createFileRoute("/runs/$runId")({
  head: () => ({
    meta: [
      { title: "Proof Card — ProofSQL" },
      { name: "description", content: "Full Proof Card for a past ProofSQL analysis run." },
      { property: "og:title", content: "Proof Card — ProofSQL" },
      { property: "og:description", content: "SQL, assumptions, validation checks and evidence for one run." },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { runId } = Route.useParams();
  const { runs } = useApp();
  const run = runs.find((r) => r.id === runId);
  if (!run) return <p className="text-sm text-muted-foreground">Run not found in this browser. <Link to="/history" className="text-primary hover:underline">Back to history</Link></p>;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/history" className="text-xs text-primary hover:underline">← Run History</Link>
      <h1 className="text-xl font-semibold">Proof Card</h1>
      {run.radar && <JoinRadarPanel run={run} />}
      <div className="rounded-lg border border-border bg-card p-4"><ProofCard run={run} /></div>
      {run.result && <div className="rounded-lg border border-border bg-card p-4"><h2 className="mb-2 text-sm font-semibold">All result rows</h2><ResultTable run={run} max={200} /></div>}
    </div>
  );
}
