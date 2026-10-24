import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { current, type DefKey } from "@/lib/proofsql/contract";
import { YEAR_RULES } from "@/lib/proofsql/schema";
import { CovidContract } from "@/components/proofsql/CovidViews";
import { SharedApproval } from "@/components/proofsql/SharedApproval";

export const Route = createFileRoute("/contract")({
  head: () => ({
    meta: [
      { title: "Semantic Contract — ProofSQL" },
      { name: "description", content: "Human-approved, versioned definitions for enrolment, payment total and academic year." },
      { property: "og:title", content: "Semantic Contract — ProofSQL" },
      { property: "og:description", content: "Approved, versioned definitions; edits become drafts until approved." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractPage,
});

const KEYS: DefKey[] = ["enrolment", "payment_total", "academic_year"];

function ContractPage() {
  const { dataset } = useApp();
  return dataset === "covid" ? <CovidContract /> : <SchoolContractPage />;
}

function SchoolContractPage() {
  const { contract, approve, editDefinition, health, resetContract } = useApp();
  const [editing, setEditing] = useState<DefKey | null>(null);
  const [draft, setDraft] = useState({ meaning: "", expression: "", grain: "" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Semantic Contract</h1>
          <p className="text-sm text-muted-foreground">The demo-ready baseline starts with every definition APPROVED v1. Edits create a new DRAFT version that is never used as authoritative until approved; earlier runs keep the version they used.</p>
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => { if (window.confirm("Restore the approved v1 baseline? Edited versions will be discarded (past runs keep their recorded versions).")) resetContract(); }}><RotateCcw className="h-3 w-3" /> Reset to demo-ready contract</Button>
      </div>
      {KEYS.map((k) => {
        const d = current(contract, k);
        return (
          <div key={k} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{d.title}</h2>
              <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${d.status === "APPROVED" ? "bg-success-soft text-success" : "bg-warning-soft text-warning-foreground"}`}>{d.status}</span>
              <span className="font-mono text-xs text-muted-foreground">v{d.version}</span>
              <div className="ml-auto flex gap-2">
                <SharedApproval dataset="school" definition={d} />
                <Button size="sm" variant="outline" onClick={() => { setEditing(k); setDraft({ meaning: d.meaning, expression: d.expression, grain: d.grain }); }}><Pencil className="h-3 w-3" /> Edit</Button>
                <Button size="sm" disabled={d.status === "APPROVED"} title={d.status === "APPROVED" ? "This version is already approved" : ""} onClick={() => approve(k)}><Check className="h-3 w-3" /> Approve v{d.version}</Button>
              </div>
            </div>
            {editing === k ? (
              <div className="mt-3 space-y-2">
                {(["meaning", "expression", "grain"] as const).map((f) => (
                  <label key={f} className="block text-xs font-medium capitalize">{f}
                    <Textarea rows={f === "meaning" ? 2 : 1} className="mt-1 font-mono text-xs" value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">Saving creates v{d.version + 1} as DRAFT. The query templates are fixed for this demo; the version and text are recorded on every Proof Card.</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { editDefinition(k, draft); setEditing(null); }}>Save as v{d.version + 1}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm md:grid-cols-[160px_1fr]">
                <dt className="text-muted-foreground">Business meaning</dt><dd>{d.meaning}</dd>
                <dt className="text-muted-foreground">Expression</dt><dd className="font-mono text-xs">{d.expression}</dd>
                <dt className="text-muted-foreground">Grain</dt><dd className="font-mono text-xs">{d.grain}</dd>
                <dt className="text-muted-foreground">Source columns</dt><dd className="font-mono text-xs">{d.sourceColumns.join(", ")}</dd>
                <dt className="text-muted-foreground">Null policy</dt><dd>{d.nullPolicy}</dd>
                <dt className="text-muted-foreground">Duplicate policy</dt><dd>{d.duplicatePolicy}</dd>
              </dl>
            )}
            {k === "academic_year" && health && (
              <div className="mt-3 overflow-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted"><tr><th className="px-2 py-1 text-left">Rule</th><th className="px-2 py-1 text-left">Example</th><th className="px-2 py-1 text-left">Normalized</th><th className="px-2 py-1 text-right">Rows in data</th></tr></thead>
                  <tbody>
                    {YEAR_RULES.map((y) => {
                      const rows = health.yearFormats.filter((f) => y.output === "NULL" ? f.normalized === null : f.normalized !== null && (y.pattern === "AYYYYY" ? f.raw?.startsWith("AY") : y.pattern === "YYYY/YY" ? f.raw?.includes("/") : f.raw === f.normalized)).reduce((a, f) => a + f.rows, 0);
                      return <tr key={y.pattern} className="border-t border-border"><td className="px-2 py-1">{y.rule}</td><td className="px-2 py-1 font-mono">{y.example}</td><td className="px-2 py-1 font-mono">{y.output}</td><td className="px-2 py-1 text-right font-mono">{rows}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Version history ({contract[k].length})</summary>
              <ul className="mt-2 space-y-1">{[...contract[k]].reverse().map((v) => (
                <li key={v.version} className="font-mono">v{v.version} · {v.status} · {v.updatedAt.startsWith("1970") ? "initial" : new Date(v.updatedAt).toLocaleString()} — <span className="font-sans">{v.meaning}</span></li>
              ))}</ul>
            </details>
          </div>
        );
      })}
    </div>
  );
}
