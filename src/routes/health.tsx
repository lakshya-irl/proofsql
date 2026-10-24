import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useApp } from "@/components/proofsql/AppProvider";
import { Button } from "@/components/ui/button";
import { runQuery, type Rows } from "@/lib/proofsql/db";
import { FIXTURE_MANIFEST } from "@/lib/proofsql/fixture";
import { DATASET_LABEL, SNAPSHOT_ID } from "@/lib/proofsql/schema";
import type { HealthWarning } from "@/lib/proofsql/health";
import { CovidHealthView } from "@/components/proofsql/CovidViews";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Database Health — ProofSQL" },
      { name: "description", content: "Full health scan of the demo database: duplicates, missing values, mixed year formats and join risks." },
      { property: "og:title", content: "Database Health — ProofSQL" },
      { property: "og:description", content: "See the risks hidden in a messy database before any question is answered." },
    ],
  }),
  component: HealthPage,
});

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" | "fail" | undefined }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "fail" ? "border-destructive bg-destructive-soft" : tone === "warn" ? "border-warning bg-warning-soft" : "border-border bg-card"}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function HealthPage() {
  const { dataset } = useApp();
  return dataset === "covid" ? <CovidHealthView /> : <SchoolHealthPage />;
}

function SchoolHealthPage() {
  const { health, db, resetDataset, loadedAt } = useApp();
  const [open, setOpen] = useState<{ w: HealthWarning; rows: Rows } | null>(null);
  const [resetting, setResetting] = useState(false);
  if (!health || !db) return <p className="text-sm text-muted-foreground">Scanning database…</p>;

  const inspect = (w: HealthWarning) => setOpen({ w, rows: runQuery(db, `SELECT * FROM (${w.sampleSql}) LIMIT 50`) });
  const fan = health.warnings.find((w) => w.id === "fanout");
  const yearW = health.warnings.find((w) => w.id === "years");
  const missingCells = health.tables.reduce((a, t) => a + t.columns.reduce((b, c) => b + c.nulls + c.empty + c.sentinels, 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Database Health</h1>
          <p className="text-sm text-muted-foreground">{DATASET_LABEL} Snapshot <span className="font-mono">{SNAPSHOT_ID}</span> · {health.scanType} at {new Date(health.scannedAt).toLocaleTimeString()}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" disabled={resetting} onClick={async () => { setResetting(true); await resetDataset(); setResetting(false); }}>
          <RotateCcw className="h-4 w-4" /> Reset demo dataset
        </Button>
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">Reset rebuilds the demo database from its fixed seed. Run history and the semantic contract are kept. Loaded {loadedAt ? new Date(loadedAt).toLocaleTimeString() : "—"}.</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Tables" value={health.tables.length} />
        <Stat label="Total rows" value={health.totalRows} />
        <Stat label="Warnings" value={health.warnings.length} tone="warn" />
        <Stat label="Candidate keys unique" value={`${health.tables.filter((t) => t.pk.unique).length}/${health.tables.length}`} />
        <Stat label="Candidate relationships" value={health.relationships.length} />
        <Stat label="Duplicate enrolment rows" value={health.duplicateRows} tone={health.duplicateRows ? "warn" : undefined} />
        <Stat label="Missing / sentinel cells" value={missingCells} tone={missingCells ? "warn" : undefined} />
        <Stat label="Join fan-out risks" value={fan ? 1 : 0} tone={fan ? "fail" : undefined} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Warnings <span className="font-normal text-muted-foreground">— select one to inspect example records</span></h2>
        <ul className="space-y-2">
          {health.warnings.map((w) => (
            <li key={w.id}>
              <button onClick={() => inspect(w)} className={`w-full rounded-lg border p-3 text-left hover:border-primary ${w.severity === "fail" ? "border-destructive bg-destructive-soft" : "border-warning bg-warning-soft"}`}>
                <div className="text-sm font-medium">{w.title}</div>
                <div className="text-xs">{w.detail}</div>
                <div className="mt-1 text-xs text-muted-foreground">Why this matters: {w.why}</div>
              </button>
              {open?.w.id === w.id && (
                <div className="mt-2 overflow-auto rounded border border-border bg-card">
                  <table className="w-full text-xs">
                    <thead className="bg-muted"><tr>{open.rows.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-mono">{c}</th>)}</tr></thead>
                    <tbody>{open.rows.rows.map((r, i) => <tr key={i} className="border-t border-border">{open.rows.columns.map((c) => <td key={c} className="px-2 py-1 font-mono">{r[c] == null ? <span className="text-warning-foreground">NULL</span> : r[c] === "" ? <span className="text-warning-foreground">''</span> : String(r[c])}</td>)}</tr>)}</tbody>
                  </table>
                  <div className="px-2 py-1 text-[11px] text-muted-foreground">{open.rows.rows.length} example records (max 50)</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Relationships</h2>
          <div className="overflow-auto rounded-lg border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted"><tr><th className="px-2 py-1.5 text-left">Path</th><th className="px-2 py-1.5 text-left">Cardinality</th><th className="px-2 py-1.5 text-right">Max / avg children</th><th className="px-2 py-1.5 text-right">Orphans</th><th className="px-2 py-1.5 text-left">Status</th></tr></thead>
              <tbody>{health.relationships.map((r) => (
                <tr key={r.child} className="border-t border-border"><td className="px-2 py-1 font-mono">{r.parent}.{r.parentKey} → {r.child}.{r.childKey}</td><td className="px-2 py-1">{r.cardinality}</td><td className="px-2 py-1 text-right font-mono">{r.maxChildren} / {r.avgChildren}</td><td className="px-2 py-1 text-right font-mono">{r.orphans}</td><td className="px-2 py-1 text-muted-foreground">{r.label}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Academic-year formats {yearW && <span className="font-normal text-warning-foreground">· proposed normalization (not applied to stored data)</span>}</h2>
          <div className="max-h-72 overflow-auto rounded-lg border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1.5 text-left">Table</th><th className="px-2 py-1.5 text-left">Original</th><th className="px-2 py-1.5 text-left">Normalized</th><th className="px-2 py-1.5 text-right">Rows</th></tr></thead>
              <tbody>{health.yearFormats.map((y, i) => (
                <tr key={i} className="border-t border-border font-mono"><td className="px-2 py-1">{y.table}</td><td className="px-2 py-1">{y.raw === null ? "NULL" : `'${y.raw}'`}</td><td className={`px-2 py-1 ${y.normalized ? "" : "text-destructive"}`}>{y.normalized ?? "unresolved"}</td><td className="px-2 py-1 text-right">{y.rows}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Tables</h2>
        <div className="space-y-4">
          {health.tables.map((t) => (
            <div key={t.name} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-sm">
                <span className="font-mono font-semibold">{t.name}</span>
                <span className="text-muted-foreground">{t.rowCount} rows · grain: {t.grain}</span>
                <span className={`ml-auto text-xs ${t.pk.unique ? "text-success" : "text-warning-foreground"}`}>Candidate key {t.pk.column}: {t.pk.unique ? "unique, no NULLs" : `${t.pk.duplicates} duplicates, ${t.pk.nulls} NULLs`}</span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted"><tr>{["Column", "Declared", "Observed types", "NULL", "Empty", "Sentinel", "Distinct", "Min", "Max", "Examples"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>{t.columns.map((c) => (
                    <tr key={c.name} className="border-t border-border font-mono">
                      <td className="px-2 py-1">{c.name}</td><td className="px-2 py-1">{c.declaredType}</td><td className="px-2 py-1">{c.typePatterns}</td>
                      <td className={`px-2 py-1 ${c.nulls ? "text-warning-foreground" : ""}`}>{c.nulls}</td><td className={`px-2 py-1 ${c.empty ? "text-warning-foreground" : ""}`}>{c.empty}</td><td className={`px-2 py-1 ${c.sentinels ? "text-warning-foreground" : ""}`}>{c.sentinels}</td>
                      <td className="px-2 py-1">{c.distinct}</td><td className="px-2 py-1">{c.min ?? "—"}</td><td className="px-2 py-1">{c.max ?? "—"}</td><td className="px-2 py-1">{c.examples.join(", ")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Fixture manifest (intentionally injected issues)</h2>
        <ul className="list-disc space-y-0.5 pl-5 text-xs">{FIXTURE_MANIFEST.map((m) => <li key={m}>{m}</li>)}</ul>
      </section>
    </div>
  );
}
