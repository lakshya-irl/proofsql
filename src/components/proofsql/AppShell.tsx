import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, BookCheck, FlaskConical, History, SearchCheck, Settings } from "lucide-react";
import { useApp } from "./AppProvider";
import { ModeBadge } from "./badges";
import { DATASET_LABEL } from "@/lib/proofsql/schema";
import mark from "@/assets/proofsql-mark.png.asset.json";

const NAV = [
  { to: "/", label: "Ask & Verify", icon: SearchCheck },
  { to: "/health", label: "Database Health", icon: Activity },
  { to: "/contract", label: "Semantic Contract", icon: BookCheck },
  { to: "/history", label: "Run History", icon: History },
  { to: "/evaluation", label: "Evaluation Lab", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, modelStatusLabel, dbError, db, planner } = useApp();
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0">
        <Link to="/" className="flex items-center gap-2.5 px-4 py-3 lg:border-b lg:border-sidebar-border lg:py-5">
          <img src={mark.url} alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">Proof<span className="text-sidebar-primary">SQL</span></div>
            <div className="hidden text-[11px] lg:block">Answers you can trust</div>
          </div>
        </Link>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
              className="flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
              <n.icon className="h-4 w-4" aria-hidden /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden px-4 pt-6 text-[11px] leading-relaxed lg:block">
          {DATASET_LABEL}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs">
          <ModeBadge label={modelStatusLabel} live={mode === "live" && planner.eligibleForLive} />
          <span className="text-muted-foreground">
            {dbError ? <span className="text-destructive">Database failed to load: {dbError}</span> : db ? "Demo SQLite loaded in browser (read-only queries)" : "Loading demo database…"}
          </span>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
