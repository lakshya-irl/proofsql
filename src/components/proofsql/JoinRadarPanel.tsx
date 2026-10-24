import { Radar } from "lucide-react";
import type { RunResult } from "@/lib/proofsql/pipeline";
import { CheckBadge } from "./badges";
import { SqlBlock } from "./ProofCard";

export function JoinRadarPanel({ run }: { run: RunResult }) {
  if (!run.radar) return null;
  const { radar, repair } = run;
  return (
    <div className={`rounded-lg border p-4 ${radar.state === "FAIL" ? "border-destructive bg-destructive-soft" : "border-border bg-card"}`}>
      <div className="mb-2 flex items-center gap-2">
        <Radar className="h-4 w-4" aria-hidden />
        <h3 className="text-sm font-semibold">Join Safety Radar</h3>
        <CheckBadge state={radar.state} />
      </div>
      <p className="text-sm font-medium">{radar.title}</p>
      {radar.path && <p className="mt-1 font-mono text-xs">Path: {radar.path}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{radar.explanation}</p>
      {radar.affected.length > 0 && <p className="mt-1 font-mono text-xs">Affected: {[...new Set(radar.affected)].join(", ")}</p>}
      {repair && (
        <div className="mt-3 space-y-3">
          <p className="text-xs"><span className="font-medium">Observed multiplicity:</span> {repair.multiplicity}</p>
          <div className="overflow-auto rounded border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted"><tr><th className="px-2 py-1 text-left">Total</th><th className="px-2 py-1 text-right">Risky join</th><th className="px-2 py-1 text-right">Repaired</th><th className="px-2 py-1 text-right">Inflation</th></tr></thead>
              <tbody>
                {repair.totals.map((t) => (
                  <tr key={t.column} className="border-t border-border font-mono">
                    <td className="px-2 py-1">{t.column}</td>
                    <td className="px-2 py-1 text-right text-destructive">{t.risky?.toLocaleString() ?? "NULL"}</td>
                    <td className="px-2 py-1 text-right">{t.repaired?.toLocaleString() ?? "NULL"}</td>
                    <td className="px-2 py-1 text-right">{t.risky != null && t.repaired ? `${(t.risky / t.repaired).toFixed(1)}×` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="mb-1 text-xs font-medium text-destructive">Risky SQL (not used for the answer)</p><SqlBlock sql={repair.riskySql} /></div>
            <div><p className="mb-1 text-xs font-medium">Repaired: aggregate before join (executed)</p><SqlBlock sql={repair.repairedSql} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{repair.explanation}</p>
        </div>
      )}
    </div>
  );
}
