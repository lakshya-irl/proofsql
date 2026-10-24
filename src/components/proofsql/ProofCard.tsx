import { ArrowDown, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { isAnswer, type RunResult } from "@/lib/proofsql/pipeline";
import { download, toCsv, toJson, toMarkdown } from "@/lib/proofsql/exporters";
import { Button } from "@/components/ui/button";
import { CheckBadge, DecisionBadge, JoinBadge } from "./badges";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function SqlBlock({ sql }: { sql: string }) {
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted p-2 font-mono text-[11px] leading-relaxed">{formatSql(sql)}</pre>;
}

export function formatSql(sql: string) {
  return sql.replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|JOIN|LEFT JOIN|HAVING|LIMIT|SELECT)\s/g, (m, k) => (k === "SELECT" ? ` ${k} ` : `\n${k} `)).replace(/\),\s*(\w+) AS \(/g, "),\n$1 AS (");
}

export function ResultTable({ run, max = 50 }: { run: RunResult; max?: number }) {
  if (!run.result) return null;
  const { columns, rows, truncated } = run.result;
  return (
    <div className="overflow-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted"><tr>{columns.map((c) => <th key={c} className="px-2 py-1.5 text-left font-mono font-medium">{c}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => <td key={c} className="px-2 py-1 font-mono">{r[c] == null ? <span className="text-warning-foreground">NULL</span> : String(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground">{rows.length} rows{truncated ? " (truncated at limit)" : ""}{rows.length > max ? `, showing ${max}` : ""}</div>
    </div>
  );
}

function inferenceLabel(run: RunResult) {
  if (run.liveInference) return "Live model inference";
  if (run.mode === "live") return "No live model inference — deterministic safety/answerability guard";
  return "Scripted planner — no live model inference";
}

export function ProofCard({ run }: { run: RunResult }) {
  const slug = run.id;
  const evidenceId = `evidence-${run.id}`;
  const warnings = run.evidence.filter((e) => e.state === "WARNING").length + run.checks.filter((c) => c.state === "WARNING").length;
  return (
    <div className="text-sm">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 border-b border-border bg-card/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={run.decision} />
          {isAnswer(run.decision) && <span className="text-xs font-medium">{run.confidence.level}</span>}
          {warnings > 0 && <span className="text-xs text-warning-foreground">{warnings} warning{warnings === 1 ? "" : "s"}</span>}
          <button type="button" onClick={() => document.getElementById(evidenceId)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary">
            <ArrowDown className="h-3 w-3" aria-hidden /> Jump to evidence
          </button>
        </div>
        <p className="mt-2 font-medium leading-snug">{run.summary || run.error}</p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <dt>Inference</dt><dd className="text-foreground">{inferenceLabel(run)}</dd>
          <dt>Model</dt><dd className="truncate font-mono">{run.liveInference ? run.modelName : "none used"}</dd>
          <dt>Snapshot</dt><dd className="font-mono">{run.snapshotId}</dd>
          <dt>Contract</dt><dd>{run.definitions.length ? run.definitions.map((d) => `${d.title} v${d.version}`).join(", ") : "—"}</dd>
          <dt>Time</dt><dd className="font-mono">{run.executionMs != null ? `SQL ${run.executionMs} ms` : "SQL not executed"}{run.latencyMs != null ? ` · total ${run.latencyMs} ms` : ""}</dd>
          <dt>Run</dt><dd className="truncate font-mono">{run.id}</dd>
        </dl>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => download(`${slug}.json`, toJson(run), "application/json")}><Download className="h-3 w-3" /> JSON</Button>
        <Button size="sm" variant="outline" onClick={() => download(`${slug}.md`, toMarkdown(run), "text/markdown")}><Download className="h-3 w-3" /> Markdown</Button>
        <Button size="sm" variant="outline" disabled={!run.result} title={run.result ? "" : "No result rows for this decision"} onClick={() => download(`${slug}.csv`, toCsv(run), "text/csv")}><Download className="h-3 w-3" /> Rows CSV</Button>
        <Button size="sm" variant="outline" disabled={!run.sql} title={run.sql ? "" : "No SQL for this decision"} onClick={() => download(`${slug}.sql`, run.sql ?? "", "text/plain")}><Download className="h-3 w-3" /> SQL</Button>
        <Button size="sm" variant="outline" disabled={!run.sql} onClick={async () => { try { await navigator.clipboard.writeText(run.sql ?? ""); toast.success("SQL copied"); } catch { toast.error("Clipboard not available"); } }}><Copy className="h-3 w-3" /> Copy SQL</Button>
      </div>
      {run.decision === "BLOCKED" && <p className="mb-3 rounded-md border border-destructive/50 bg-destructive-soft p-2 text-xs text-destructive">SQL withheld: this request is not permitted on a read-only analyst, so no executable statement is shown.</p>}
      {run.decision === "ERROR" && <p className="mb-3 rounded-md border border-destructive/50 bg-destructive-soft p-2 text-xs text-destructive">Operational failure{run.errorCode ? ` (code ${run.errorCode})` : ""}. No rows were produced and none are shown. Retrying is safe.</p>}

      <Section title="Question">
        <p><span className="text-muted-foreground">Original:</span> {run.question}</p>
        <p><span className="text-muted-foreground">Resolved:</span> {run.resolvedQuestion}</p>
      </Section>
      <Section title="Provenance">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Dataset</dt><dd>{run.datasetName}</dd>
          <dt className="text-muted-foreground">Snapshot</dt><dd className="font-mono">{run.snapshotId}</dd>
          <dt className="text-muted-foreground">Planner</dt><dd>{run.plannerLabel}</dd>
          <dt className="text-muted-foreground">Model</dt><dd className="font-mono">{run.liveInference ? run.modelName : "none used for this run"}</dd>
          <dt className="text-muted-foreground">Model mode</dt><dd>{run.mode}{run.liveInference ? " · live inference" : " · no live model inference"}{run.modelLatencyMs != null ? ` · model ${run.modelLatencyMs} ms` : ""}</dd>
          <dt className="text-muted-foreground">Model status</dt><dd>{run.modelStatus}</dd>
          <dt className="text-muted-foreground">Contract</dt><dd>{run.definitions.length ? run.definitions.map((d) => `${d.title} v${d.version} (${d.status})`).join(", ") : "No governed definition used"}</dd>
          <dt className="text-muted-foreground">Metric</dt><dd>{run.metric ?? "—"}</dd>
          <dt className="text-muted-foreground">Grain</dt><dd>{run.grain ?? "—"}</dd>
          <dt className="text-muted-foreground">Time</dt><dd>{run.timeInterpretation ?? "—"}</dd>
          <dt className="text-muted-foreground">Tables</dt><dd className="font-mono">{run.tables.join(", ") || "—"}</dd>
          <dt className="text-muted-foreground">Columns</dt><dd className="font-mono">{run.columns.join(", ") || "—"}</dd>
          <dt className="text-muted-foreground">Joins</dt><dd className="font-mono text-[11px]">{run.joins.length ? run.joins.map((j) => JSON.stringify(j)).join("; ") : "—"}</dd>
          <dt className="text-muted-foreground">Join safety</dt><dd className="flex flex-wrap gap-1">{run.radar ? <><JoinBadge status={run.radar.status} />{run.joinStatus && run.joinStatus !== run.radar.status && <JoinBadge status={run.joinStatus} />}</> : <JoinBadge status="NOT_CHECKED" />}</dd>
          <dt className="text-muted-foreground">SQL safety</dt><dd>{(() => { const fw = run.checks.filter((c) => /firewall|parsed|statement|read-only|tables|columns|function/i.test(c.name)); if (!fw.length) return <CheckBadge state="NOT CHECKED" />; return <CheckBadge state={fw.some((c) => c.state === "FAIL") ? "FAIL" : fw.some((c) => c.state === "WARNING") ? "WARNING" : "PASS"} />; })()}</dd>
          <dt className="text-muted-foreground">Exec time</dt><dd>{run.executionMs != null ? `${run.executionMs} ms` : "—"}{run.latencyMs != null ? ` · total ${run.latencyMs} ms` : ""}</dd>
        </dl>
      </Section>
      {run.definitions.map((d) => (
        <Section key={d.key} title={`Metric definition · ${d.title} v${d.version}`}>
          <p className="text-xs">{d.meaning}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{d.expression} · grain {d.grain}</p>
        </Section>
      ))}
      {run.sql && (
        <Section title="SQL">
          <SqlBlock sql={run.sql} />
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">Bound parameters: {JSON.stringify(run.params)}</p>
        </Section>
      )}
      {run.assumptions.length > 0 && <Section title="Assumptions"><ul className="list-disc space-y-0.5 pl-4 text-xs">{run.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></Section>}
      {run.normalizationRules.length > 0 && <Section title="Normalization rules"><ul className="list-disc space-y-0.5 pl-4 font-mono text-[11px]">{run.normalizationRules.map((a) => <li key={a}>{a}</li>)}</ul></Section>}
      {run.evidence.length > 0 && (
        <Section title="Evidence & data-quality warnings">
          <ul className="space-y-1.5">{run.evidence.map((e, i) => <li key={i} className="flex gap-2 text-xs"><CheckBadge state={e.state} /><span>{e.detail}</span></li>)}</ul>
        </Section>
      )}
      {(run.clarifications.length > 0 || run.reason) && (
        <Section title="Decision reasoning">
          {run.clarifications.length > 0 && <ul className="list-disc pl-4 text-xs">{run.clarifications.map((c) => <li key={c}>{c}</li>)}</ul>}
          {run.reason && <p className="text-xs">{run.reason}</p>}
          {run.recommendedFix && <p className="text-xs text-muted-foreground">Recommended fix: {run.recommendedFix}</p>}
        </Section>
      )}
      {run.blockedReasons.length > 0 && (
        <Section title="Blocked reasons"><ul className="list-disc pl-4 text-xs text-destructive">{run.blockedReasons.map((b) => <li key={b}>{b}</li>)}</ul></Section>
      )}
      <Section title="Validation checks">
        <ul className="space-y-1.5">{run.checks.map((c, i) => <li key={i} className="flex gap-2 text-xs"><CheckBadge state={c.state} /><span><span className="font-medium">{c.name}</span> — {c.detail}</span></li>)}</ul>
      </Section>
      {isAnswer(run.decision) && (
        <Section title={`Confidence · ${run.confidence.level}`}>
          <ul className="list-disc pl-4 text-xs">{run.confidence.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </Section>
      )}
      {run.result && <Section title="Supporting rows"><ResultTable run={run} max={10} /></Section>}
      <Section title="Known limitations"><ul className="list-disc pl-4 text-xs text-muted-foreground">{run.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Section>
    </div>
  );
}
