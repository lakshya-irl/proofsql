import { Link } from "@tanstack/react-router";
import { AlertTriangle, Table2 } from "lucide-react";
import { useApp } from "./AppProvider";

export function SchemaPanel() {
  const { health } = useApp();
  if (!health) return <p className="text-sm text-muted-foreground">Scanning database…</p>;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tables</h3>
        <ul className="space-y-2">
          {health.tables.map((t) => (
            <li key={t.name} className="rounded border border-border bg-card p-2">
              <div className="flex items-center gap-1.5 font-mono text-xs font-medium"><Table2 className="h-3.5 w-3.5 text-primary" aria-hidden />{t.name}<span className="ml-auto font-sans text-muted-foreground">{t.rowCount} rows</span></div>
              <div className="mt-1 text-[11px] text-muted-foreground">Grain: {t.grain}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.columns.map((c) => (
                  <span key={c.name} className={`rounded px-1 font-mono text-[10px] ${c.nulls + c.empty + c.sentinels > 0 ? "bg-warning-soft text-warning-foreground" : "bg-muted"}`} title={`${c.declaredType} · ${c.nulls} null · ${c.sentinels} sentinel`}>{c.name}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Relationships (inferred)</h3>
        <ul className="space-y-1 font-mono text-[11px]">
          {health.relationships.map((r) => (
            <li key={r.child}>{r.parent} → {r.child} <span className="text-muted-foreground">{r.cardinality}, max {r.maxChildren}</span></li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Health warnings ({health.warnings.length})</h3>
        <ul className="space-y-1">
          {health.warnings.slice(0, 6).map((w) => (
            <li key={w.id} className="flex gap-1.5 text-xs"><AlertTriangle className={`mt-0.5 h-3 w-3 shrink-0 ${w.severity === "fail" ? "text-destructive" : "text-warning"}`} aria-hidden />{w.title}</li>
          ))}
        </ul>
        <Link to="/health" className="mt-2 inline-block text-xs text-primary underline-offset-2 hover:underline">Inspect all warnings →</Link>
      </div>
    </div>
  );
}
