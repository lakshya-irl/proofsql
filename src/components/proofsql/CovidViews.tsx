import { useState } from "react";
import { useApp } from "./AppProvider";
import { COVID_DEFINITIONS, COVID_DATASET_NAME, COVID_SNAPSHOT_ID } from "@/lib/proofsql/covidPipeline";
import { Button } from "@/components/ui/button";
import { SqlBlock } from "./ProofCard";
import { SharedApproval } from "./SharedApproval";

export function CovidSchema() {
  return <section className="space-y-3 text-sm"><h2 className="font-semibold">About the COVID-19 data</h2><p>Johns Hopkins CSSE country totals: reported cases, deaths and recoveries.</p><p className="text-muted-foreground">One record per country per month. January 2020 – April 2022. April ends on the 16th; later recoveries were not reported.</p></section>;
}

export function CovidContract() {
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Data definitions · COVID-19</h1>{COVID_DEFINITIONS.map((d) => <section key={d.key} className="border-b border-border py-4"><h2 className="font-semibold">{d.title} <span className="text-xs text-muted-foreground">Fixed definition · v1</span></h2><p className="mt-2 text-sm">{d.meaning}</p><p className="my-2 font-mono text-xs">{d.expression} · {d.grain}</p><SharedApproval dataset="covid" definition={d} /></section>)}</div>;
}

export function CovidHealthView() {
  const { covidDb, covidHealth: h } = useApp();
  const [sample, setSample] = useState<{ sql: string; columns: string[]; values: unknown[][] } | null>(null);
  if (!h || !covidDb) return <p>Scanning COVID-19 data…</p>;
  return <div className="space-y-5"><h1 className="text-xl font-semibold">Data quality · COVID-19</h1><p className="text-sm text-muted-foreground">{COVID_DATASET_NAME} · {h.months.first} — {h.months.last}</p><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Rows", h.rows], ["Countries", h.countries], ["Months", h.months.count], ["Duplicate country-months", h.duplicates]].map(([label, value]) => <div key={label} className="border-b border-border py-3"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}</div><table className="w-full text-sm"><thead><tr><th className="text-left">Column</th><th>Missing</th><th>Negative</th></tr></thead><tbody>{h.columns.map((c) => <tr key={c.name} className="border-t border-border"><td className="py-2 font-mono">{c.name}</td><td className="text-center">{c.nulls}</td><td className="text-center">{c.negatives}</td></tr>)}</tbody></table>{h.warnings.map((w) => <section key={w.title} className="border-b border-border py-3"><h2 className="text-sm font-semibold text-warning-foreground">{w.title}</h2><p className="my-2 text-sm">{w.detail}</p><Button variant="outline" size="sm" onClick={() => { const r = covidDb.exec(`SELECT * FROM (${w.sql}) LIMIT 50`)[0]; setSample({ sql: w.sql, columns: r?.columns ?? [], values: r?.values ?? [] }); }}>Inspect records</Button></section>)}{sample && <section className="space-y-2"><SqlBlock sql={sample.sql} /><div className="overflow-auto"><table className="w-full text-xs"><thead><tr>{sample.columns.map((c) => <th key={c} className="p-2 text-left">{c}</th>)}</tr></thead><tbody>{sample.values.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className="p-2">{v == null ? "missing" : String(v)}</td>)}</tr>)}</tbody></table></div></section>}</div>;
}