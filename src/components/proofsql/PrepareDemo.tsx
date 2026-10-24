import { AlertTriangle, Check, Circle, Loader2, Rocket, X } from "lucide-react";
import { useApp, type ReadinessItem } from "./AppProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const icon = (s: ReadinessItem["state"]) =>
  s === "ok" ? <Check className="h-3.5 w-3.5 text-success" aria-label="passed" />
  : s === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="warning" />
  : s === "fail" ? <X className="h-3.5 w-3.5 text-destructive" aria-label="failed" />
  : <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-label="not run" />;

export function PrepareDemoButton({ size = "default", className, onDone }: { size?: "default" | "sm"; className?: string; onDone?: () => void }) {
  const { prepareDemo, preparing, runs } = useApp();
  const go = async () => {
    const clear = runs.length > 0 ? window.confirm(`Clear ${runs.length} existing run(s) from Run History?\n\nOK = clear history · Cancel = keep history`) : false;
    await prepareDemo(clear);
    onDone?.();
  };
  return (
    <Button size={size} className={className} onClick={go} disabled={preparing}>
      {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Prepare Demo
    </Button>
  );
}

export function ReadinessList({ compact = false }: { compact?: boolean }) {
  const { readiness } = useApp();
  if (!readiness) return null;
  return (
    <div className={cn("rounded-lg border border-border bg-card", compact ? "p-3" : "p-4")}>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">Demo readiness</h3>
        <span className="text-[11px] text-muted-foreground">checked {new Date(readiness.at).toLocaleTimeString()}</span>
      </div>
      <ul className="space-y-1">
        {readiness.items.map((i) => (
          <li key={i.label} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{icon(i.state)}</span>
            <span><span className="font-medium">{i.label}</span>{!compact && <span className="text-muted-foreground"> — {i.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
