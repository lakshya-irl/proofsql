import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { reportLovableError } from "@/lib/lovable-error-reporting";

/** Turns any thrown value into a short, user-safe message (no keys, no headers, no stack). */
export function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "Unexpected error";
  return raw.replace(/(bearer\s+)[\w.-]+/gi, "$1[redacted]").replace(/(api[_-]?key["'=:\s]+)[\w.-]+/gi, "$1[redacted]").slice(0, 240);
}

type Props = { children: ReactNode; area: string };
type State = { error: Error | null };

/** Page-level boundary: one broken panel never blanks the whole app. */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    reportLovableError(error, { boundary: `proofsql_${this.props.area}` });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-lg rounded-lg border border-destructive/40 bg-card p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          <h2 className="text-base font-semibold">This section stopped working</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Your saved runs and contract are safe in this browser. Try the section again; if it keeps failing, reload the page.</p>
        <p className="mt-3 rounded bg-muted px-3 py-2 font-mono text-xs text-foreground">{safeMessage(this.state.error)}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => this.setState({ error: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <RotateCcw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <button onClick={() => location.reload()} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">Reload page</button>
        </div>
      </div>
    );
  }
}

/** Catches async failures nobody handled and shows them instead of failing silently. */
export function GlobalErrorListener() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => toast.error("Something went wrong", { description: safeMessage(e.reason) });
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return null;
}
