import { cn } from "@/lib/utils";
import type { CheckState } from "@/lib/proofsql/firewall";
import type { Decision } from "@/lib/proofsql/pipeline";

const decisionStyle: Record<Decision, string> = {
  ANSWER: "bg-primary text-primary-foreground",
  CLARIFY: "bg-warning text-warning-foreground",
  ABSTAIN: "bg-secondary text-secondary-foreground border border-border",
  BLOCKED: "bg-destructive text-destructive-foreground",
  ERROR: "bg-destructive-soft text-destructive border border-destructive",
};

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  return <span className={cn("inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold tracking-wider", decisionStyle[decision], className)}>{decision}</span>;
}

const checkStyle: Record<CheckState, string> = {
  PASS: "bg-success-soft text-success",
  WARNING: "bg-warning-soft text-warning-foreground",
  FAIL: "bg-destructive-soft text-destructive",
  "NOT CHECKED": "bg-muted text-muted-foreground",
};

export function CheckBadge({ state }: { state: CheckState }) {
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide", checkStyle[state])}>{state}</span>;
}

export function ModeBadge({ label, live }: { label: string; live: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs", live ? "border-primary text-primary" : "border-warning bg-warning-soft text-warning-foreground")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-primary" : "bg-warning")} />
      {label}
    </span>
  );
}
