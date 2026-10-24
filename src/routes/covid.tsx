import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Database } from "sql.js";
import { Button } from "@/components/ui/button";
import { analyzeCovidQuestion } from "@/lib/model.functions";
import { COVID_FILE, interpretModelOutput, COVID_SOURCE, METRICS, planCovid, type CovidPlan, type CovidQuestion, type Metric } from "@/lib/proofsql/covid";

export const Route = createFileRoute("/covid")({
  head: () => ({
    meta: [
      { title: "COVID-19 data — ProofSQL" },
      { name: "description", content: "Ask checked questions about real public COVID-19 country data (Johns Hopkins CSSE)." },
      { property: "og:title", content: "COVID-19 data — ProofSQL" },
      { property: "og:description", content: "Real COVID-19 country totals with the SQL, parameters and caveats shown." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CovidPage,
});

type Kind = CovidQuestion["kind"];
const sel = "mt-1 w-full rounded border border-input bg-background px-2 py-1 text-sm";

function CovidPage() {
  const [db, setDb] = useState<Database | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("country_month");
  const [metric, setMetric] = useState<Metric>("deaths");
  const [country, setCountry] = useState("India");
  const [month, setMonth] = useState("2021-12");
  const [from, setFrom] = useState("2021-01");
  const [n, setN] = useState(10);
  const [out, setOut] = useState<{ plan: CovidPlan; cols: string[]; rows: unknown[][]; ms: number; via?: string } | null>(null);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);

  function show(plan: CovidPlan, via?: string) {
    if (!db || plan.decision !== "ANSWER") { setOut({ plan, cols: [], rows: [], ms: 0, via }); return; }
    const t = performance.now();
    const r = db.exec(plan.sql, plan.params)[0];
    setOut({ plan, cols: r?.columns ?? [], rows: r?.values ?? [], ms: performance.now() - t, via });
  }

  async function askText() {
    if (!text.trim() || thinking) return;
    setThinking(true); setOut(null);
    try {
      const r = await analyzeCovidQuestion({ data: { question: text.trim() } });
      const { question, plan } = interpretModelOutput(r.content, countries);
      show(plan, `Live AI · ${r.modelName} · ${r.latencyMs} ms${question ? ` · read as ${JSON.stringify(question)}` : ""}`);
    } catch (e) {
      setOut({ plan: { decision: "ERROR", reason: `${e instanceof Error ? e.message : String(e)}. Nothing was answered; try again.` }, cols: [], rows: [], ms: 0 });
    } finally { setThinking(false); }
  }

  useEffect(() => {
    let d: Database | null = null;
    (async () => {
      try {
        const SQL = await (await import("sql.js")).default({ locateFile: (f: string) => `/wasm/${f}` });
        const buf = await (await fetch(COVID_FILE)).arrayBuffer();
        d = new SQL.Database(new Uint8Array(buf));
        setCountries(d.exec("SELECT DISTINCT country FROM covid_monthly ORDER BY country")[0]!.values.map((v) => String(v[0])));
        setMonths(d.exec("SELECT DISTINCT month FROM covid_monthly ORDER BY month")[0]!.values.map((v) => String(v[0])));
        setDb(d);
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    })();
    return () => d?.close();
  }, []);

  function ask() {
    if (!db) return;
    const q: CovidQuestion = kind === "top" ? { kind, month, metric, n } : kind === "change" ? { kind, country, metric, from, to: month } : { kind, country, month, metric };
    show(planCovid(q), "Menu question · no AI used");
  }

  const monthSel = (v: string, set: (s: string) => void, label: string) => (
    <label className="block text-xs">{label}<select className={sel} value={v} onChange={(e) => set(e.target.value)}>{months.map((m) => <option key={m}>{m}</option>)}</select></label>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">COVID-19 data (real)</h1>
      <p className="rounded border border-border bg-muted p-3 text-xs">
        Real public data: {COVID_SOURCE}. 198 countries, Jan 2020 – Apr 2022, one row per country per month (the last reported day). The school demo on Ask &amp; Verify is unchanged — switch between them in the sidebar.
      </p>
      {err && <p className="text-sm text-destructive">Could not load the COVID database: {err}</p>}
      {!db && !err && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading database…</p>}
      {db && (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <label className="block text-xs">Ask in your own words (uses the live AI; it only picks a question type, the app writes the SQL)
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} className={sel} placeholder="How many deaths did Brazil have by June 2021?" />
          </label>
          <Button onClick={() => void askText()} disabled={thinking || !text.trim()}>{thinking ? <><Loader2 className="h-4 w-4 animate-spin" /> Asking the AI…</> : "Ask AI"}</Button>
        </section>
      )}
      {db && (
        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
          <label className="block text-xs">Question<select className={sel} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="country_month">Total for a country in a month</option>
            <option value="top">Top countries in a month</option>
            <option value="change">Change for a country between two months</option>
          </select></label>
          <label className="block text-xs">Measure<select className={sel} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>{METRICS.map((m) => <option key={m}>{m}</option>)}</select></label>
          {kind !== "top" && <label className="block text-xs">Country<select className={sel} value={country} onChange={(e) => setCountry(e.target.value)}>{countries.map((c) => <option key={c}>{c}</option>)}</select></label>}
          {kind === "change" && monthSel(from, setFrom, "From month")}
          {monthSel(month, setMonth, kind === "change" ? "To month" : "Month")}
          {kind === "top" && <label className="block text-xs">How many<input type="number" min={1} max={50} className={sel} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>}
          <div className="sm:col-span-2"><Button onClick={ask}>Ask menu question</Button></div>
        </section>
      )}
      {out && (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="font-semibold">{out.plan.decision}{out.plan.decision === "ANSWER" && ` · ${out.rows.length} row(s) · ${out.ms.toFixed(1)} ms`}</div>
          {out.via && <div className="break-all text-xs text-muted-foreground">{out.via}</div>}
          {out.plan.decision !== "ANSWER" ? <p>{out.plan.reason} No query was run.</p> : (
            <>
              {out.rows.length === 0 && <p>No matching rows — nothing was reported for this choice.</p>}
              <ul className="list-disc pl-5 text-xs text-muted-foreground">{out.plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground">{out.cols.map((c) => <th key={c} className="pr-2">{c}</th>)}</tr></thead>
                <tbody>{out.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((v, j) => <td key={j} className="pr-2">{v === null ? "missing" : typeof v === "number" ? v.toLocaleString() : String(v)}</td>)}</tr>)}</tbody></table></div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{out.plan.sql}{"\n"}-- parameters: {JSON.stringify(out.plan.params)}</pre>
            </>
          )}
        </section>
      )}
    </div>
  );
}
