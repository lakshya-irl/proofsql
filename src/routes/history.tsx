import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, HardDrive, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/proofsql/AppProvider";
import { DecisionBadge } from "@/components/proofsql/badges";
import { Button } from "@/components/ui/button";
import type { Decision, RunResult } from "@/lib/proofsql/pipeline";
import { download } from "@/lib/proofsql/exporters";
import { exportRuns, type Skipped } from "@/lib/proofsql/runHistory";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Run History — ProofSQL" },
      { name: "description", content: "Every analysis run with its decision, SQL, warnings and the definition versions it used." },
      { property: "og:title", content: "Run History — ProofSQL" },
      { property: "og:description", content: "Reopen any past run and inspect its full Proof Card." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

const modeLabel = (r: RunResult) => (r.liveInference ? `live · ${r.modelName}` : r.mode === "live" ? "deterministic guard" : "scripted");
const contractLabel = (r: RunResult) => r.definitions.map((d) => `${d.title} v${d.version}`).join(", ") || "—";

function SkippedList({ title, skipped }: { title: string; skipped: Skipped[] }) {
  if (!skipped.length) return null;
  return (
    <details className="rounded-md border border-warning/50 bg-warning-soft p-3 text-xs text-warning-foreground">
      <summary className="cursor-pointer font-medium">{title}: {skipped.length} record{skipped.length === 1 ? "" : "s"} skipped</summary>
      <ul className="mt-1 list-disc pl-5">{skipped.map((s, i) => <li key={i}>{s.index >= 0 ? `Record #${s.index + 1}: ` : ""}{s.reason}</li>)}</ul>
    </details>
  );
}

function HistoryPage() {
  const { runs, importRuns, clearRuns, legacyReport } = useApp();
  const [filter, setFilter] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<Skipped[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const f = FILTERS.find((x) => x.label === filter);
  const shown = f ? runs.filter((r) => f.match.includes(r.decision)) : runs;

  const onImport = async (fl: File | undefined) => {
    if (!fl) return;
    setBusy(true);
    try {
      const rep = importRuns(await fl.text());
      setLastImport(rep.skipped);
      if (rep.added) toast.success(`Imported ${rep.added} run${rep.added === 1 ? "" : "s"}`, { description: `${rep.duplicates} already present, ${rep.skipped.length} skipped.` });
      else toast.error("No runs imported", { description: `${rep.duplicates} already present, ${rep.skipped.length} skipped.` });
    } catch { toast.error("Could not read that file"); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Run History</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground"><HardDrive className="h-3.5 w-3.5" aria-hidden /> Local to this browser — not synced, not on a server</p>
          <p className="mt-1 text-sm text-muted-foreground">Runs are snapshots: later definition edits never change them. Keeps the newest 100.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!runs.length} onClick={() => download(`proofsql-runs-${new Date().toISOString().slice(0, 10)}.json`, exportRuns(runs), "application/json")}><Download className="h-4 w-4" /> Export all (JSON)</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}><Upload className="h-4 w-4" /> {busy ? "Importing…" : "Import JSON"}</Button>
          <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Import runs JSON file" onChange={(e) => void onImport(e.target.files?.[0])} />
          <Button size="sm" variant="ghost" disabled={!runs.length} onClick={() => { if (confirm("Delete all runs stored in this browser? Export first if you want a copy.")) clearRuns(); }}><Trash2 className="h-4 w-4" /> Clear</Button>
        </div>
      </div>

      {legacyReport && <p className="text-xs text-muted-foreground">Older saved runs found: {legacyReport.migrated} migrated.</p>}
      {legacyReport && <SkippedList title="Legacy migration" skipped={legacyReport.skipped} />}
      <SkippedList title="Last import" skipped={lastImport} />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by decision">
        <button aria-pressed={filter === null} onClick={() => setFilter(null)} className={`rounded-md border px-2.5 py-1 text-xs ${filter === null ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card"}`}>All ({runs.length})</button>
        {FILTERS.map((x) => (
          <button key={x.label} aria-pressed={filter === x.label} onClick={() => setFilter(x.label)} className={`rounded-md border px-2.5 py-1 font-mono text-xs ${filter === x.label ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card"}`}>
            {x.label} ({runs.filter((r) => x.match.includes(r.decision)).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{runs.length ? "No runs match this filter." : "No runs yet. Ask a question on Ask & Verify, or import a JSON export."}</p> : (
        <>
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2"><DecisionBadge decision={r.decision} /><span className="ml-auto font-mono text-[10px] text-muted-foreground">{new Date(r.timestamp).toLocaleString()}</span></div>
                <p className="mt-2 text-sm font-medium">{r.question}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.summary || r.error}</p>
                <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{r.id} · {r.snapshotId} · {modeLabel(r)} · {contractLabel(r)}</p>
                <Link to="/runs/$runId" params={{ runId: r.id }} className="mt-2 inline-block text-sm text-primary hover:underline">Open Proof Card →</Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-auto rounded-lg border border-border bg-card md:block">
            <table className="w-full text-xs">
              <thead className="bg-muted"><tr>{["Run ID", "Time", "Question", "Decision", "Result", "SQL", "Warnings", "Contract", "Snapshot", "Mode / model", "Latency", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id} className="border-t border-border align-top hover:bg-muted/40">
                  <td className="px-2 py-1.5 font-mono text-[10px]">{r.id}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">{new Date(r.timestamp).toLocaleString()}</td>
                  <td className="max-w-xs px-2 py-1.5">{r.question}</td>
                  <td className="px-2 py-1.5"><DecisionBadge decision={r.decision} /></td>
                  <td className="max-w-xs px-2 py-1.5">{r.summary || r.error}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[10px]" title={r.sql ?? ""}>{r.sql ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono">{r.evidence.filter((e) => e.state === "WARNING").length + r.checks.filter((c) => c.state === "WARNING").length}</td>
                  <td className="px-2 py-1.5 font-mono">{contractLabel(r)}</td>
                  <td className="px-2 py-1.5 font-mono">{r.snapshotId}</td>
                  <td className="px-2 py-1.5">{modeLabel(r)}</td>
                  <td className="px-2 py-1.5 font-mono">{r.latencyMs != null ? `${r.latencyMs} ms` : "—"}</td>
                  <td className="px-2 py-1.5"><Link to="/runs/$runId" params={{ runId: r.id }} className="text-primary hover:underline">Open</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
