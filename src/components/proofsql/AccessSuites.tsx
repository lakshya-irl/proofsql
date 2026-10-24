import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckBadge } from "@/components/proofsql/badges";
import { useApp } from "@/components/proofsql/AppProvider";
import { ATTACKS, CONVERSATIONS, runAttackSuite, runConversationSuite, type AttackOutcome, type ConversationOutcome } from "@/lib/proofsql/accessEvaluation";
import { ROLE_POLICIES } from "@/lib/proofsql/access";

/** Runs the role-attack and follow-up suites against the loaded COVID data; every number comes from the rows below. */
export function AccessSuites() {
  const { covidDb, countries } = useApp();
  const [attacks, setAttacks] = useState<AttackOutcome[] | null>(null);
  const [convs, setConvs] = useState<ConversationOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!covidDb) return;
    setBusy(true);
    try { setAttacks(await runAttackSuite(covidDb, countries)); setConvs(await runConversationSuite(covidDb, countries)); }
    finally { setBusy(false); }
  };
  const leaks = attacks?.reduce((n, a) => n + a.leaks.length, 0) ?? 0;
  return (
    <section className="space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Roles & follow-ups</h2>
        <Button size="sm" className="ml-auto" onClick={run} disabled={!covidDb || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run {ATTACKS.length} attacks + {CONVERSATIONS.length} conversations</Button>
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        {(Object.keys(ROLE_POLICIES) as (keyof typeof ROLE_POLICIES)[]).map((r) => <li key={r} className="rounded border border-border bg-card p-3"><span className="font-medium">{ROLE_POLICIES[r].label}</span><br /><span className="text-xs text-muted-foreground">{ROLE_POLICIES[r].summary}</span></li>)}
      </ul>
      {!attacks && <p className="text-sm text-muted-foreground">Not run yet. Results are measured on the real COVID data when you click Run.</p>}
      {attacks && convs && <>
        <p className="text-sm"><span className="font-semibold">Attacks:</span> {attacks.filter((a) => a.pass).length}/{attacks.length} handled as expected · <span className="font-semibold">{leaks} leaks</span> · <span className="font-semibold">Follow-ups:</span> {convs.filter((c) => c.pass).length}/{convs.length} conversations correct ({convs.flatMap((c) => c.turns).filter((t) => t.pass).length}/{convs.flatMap((c) => c.turns).length} follow-up turns)</p>
        <details><summary className="cursor-pointer text-sm">Attack results</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">ID</th><th className="p-1">Role</th><th className="p-1">Question</th><th className="p-1">Outcome</th><th className="p-1">Leaks</th><th className="p-1">Result</th></tr></thead>
            <tbody>{attacks.map((a) => <tr key={a.id} className="border-t border-border"><td className="p-1 font-mono">{a.id}</td><td className="p-1">{ROLE_POLICIES[a.role].label}</td><td className="p-1">{a.question}</td><td className="p-1 font-mono">{a.actual}</td><td className="p-1">{a.leaks.length ? a.leaks.join(", ") : "none"}</td><td className="p-1"><CheckBadge state={a.pass ? "PASS" : "FAIL"} /></td></tr>)}</tbody></table></div>
        </details>
        <details><summary className="cursor-pointer text-sm">Conversation results</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-1">ID</th><th className="p-1">Turn 2</th><th className="p-1">Turn 3</th><th className="p-1">Result</th></tr></thead>
            <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-border"><td className="p-1 font-mono">{c.id}</td>{c.turns.map((t, k) => <td key={k} className="p-1">“{t.text}” → {t.actual}{!t.pass && <span className="text-destructive"> (expected {t.expected})</span>}</td>)}<td className="p-1"><CheckBadge state={c.pass ? "PASS" : "FAIL"} /></td></tr>)}</tbody></table></div>
        </details>
      </>}
    </section>
  );
}
