import { cn } from "@/lib/utils";
import type { CheckState } from "@/lib/proofsql/firewall";
import type { Decision } from "@/lib/proofsql/pipeline";
import type { JoinStatus } from "@/lib/proofsql/joinRadar";

const decisionStyle: Record<Decision, string> = {
  ANSWER: "bg-primary text-primary-foreground",
  ANSWER_WITH_WARNING: "bg-primary text-primary-foreground ring-2 ring-warning",
  CLARIFY: "bg-warning text-warning-foreground",
  ABSTAIN: "bg-secondary text-secondary-foreground border border-border",
  BLOCKED: "bg-destructive text-destructive-foreground",
  ERROR: "bg-destructive-soft text-destructive border border-destructive",
};

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  const label = { ANSWER: "Answer available", ANSWER_WITH_WARNING: "Answer with a note", CLARIFY: "More detail needed", ABSTAIN: "Not enough evidence", BLOCKED: "Request not allowed", ERROR: "Could not complete" }[decision];
  return <span className={cn("inline-flex items-center rounded px-2 py-1 text-xs font-semibold", decisionStyle[decision], className)}>{label}</span>;
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

const joinStyle: Record<JoinStatus, string> = {
  SAFE: "bg-success-soft text-success",
  RISK_DETECTED: "bg-warning-soft text-warning-foreground",
  REPAIR_AVAILABLE: "bg-warning-soft text-warning-foreground",
  REPAIR_APPLIED: "bg-success-soft text-success",
  NOT_CHECKED: "bg-muted text-muted-foreground",
  VALIDATION_ERROR: "bg-destructive-soft text-destructive",
};

export function JoinBadge({ status }: { status: JoinStatus }) {
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide", joinStyle[status])}>{status.replace(/_/g, " ")}</span>;
}
