import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, Globe, BookCheck, Database, FlaskConical, History, SearchCheck, Settings, ShieldCheck } from "lucide-react";
import { useApp } from "./AppProvider";
import { DATASET_LABEL } from "@/lib/proofsql/schema";
import mark from "@/assets/proofsql-mark.png.asset.json";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const NAV = [
  { to: "/", label: "Ask & Verify", icon: SearchCheck },
  { to: "/health", label: "Data quality", icon: Activity },
  { to: "/contract", label: "Data definitions", icon: BookCheck },
  { to: "/history", label: "Past questions", icon: History },
  { to: "/evaluation", label: "Accuracy checks", icon: FlaskConical },
  { to: "/datasets", label: "Datasets", icon: Database },
  { to: "/covid", label: "COVID-19 data", icon: Globe },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { dbError, db, dataset, setDataset, covidDb } = useApp();
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0">
        <Link to="/" className="flex items-center gap-2.5 px-4 py-3 lg:border-b lg:border-sidebar-border lg:py-5">
          <img src={mark.url} alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          <div>
            <div className="text-xl font-semibold text-sidebar-accent-foreground">Proof<span className="text-sidebar-primary">SQL</span></div>
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
          {dataset === "school" ? DATASET_LABEL : "COVID-19 · JHU CSSE country totals"}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 text-xs lg:px-8">
          <ToggleGroup type="single" value={dataset} aria-label="Dataset" onValueChange={(d) => { if (d === "covid" || d === "school") setDataset(d); }}>
            <ToggleGroupItem value="covid" aria-label="COVID dataset"><Globe className="h-4 w-4" /> COVID-19</ToggleGroupItem>
            <ToggleGroupItem value="school" aria-label="School dataset">School example</ToggleGroupItem>
          </ToggleGroup>
          <span className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {dbError ? <span className="text-destructive">Data could not load: {dbError}</span> : (dataset === "covid" ? covidDb : db) ? dataset === "covid" ? "Johns Hopkins · Historical public data" : "Synthetic school example · Not real records" : "Loading data…"}
          </span>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
