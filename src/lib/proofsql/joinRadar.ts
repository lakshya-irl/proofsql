// Deterministic join-fan-out validator for the demo schema. Unsupported shapes report NOT CHECKED.
import { RELATIONSHIPS } from "./schema";
import type { CheckState } from "./firewall";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

export type RadarResult = {
  state: CheckState;
  title: string;
  path: string | null;
  affected: string[];
  explanation: string;
};

const CHILD_TABLES = new Set(RELATIONSHIPS.filter((r) => r.parent === "schools").map((r) => r.child));

function collectSelects(node: Node, out: Node[]) {
  if (!node || typeof node !== "object") return;
  if (node.type === "select") out.push(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((x) => collectSelects(x, out));
    else if (v && typeof v === "object") collectSelects(v, out);
  }
}

function hasAggregate(sel: Node): boolean {
  let found = false;
  const visit = (n: Node) => {
    if (!n || typeof n !== "object" || found) return;
    if (n.type === "select" && n !== sel) return; // don't descend into nested selects
    if (n.type === "aggr_func") { found = true; return; }
    for (const v of Object.values(n)) Array.isArray(v) ? v.forEach(visit) : visit(v);
  };
  visit(sel.columns);
  return found || (sel.groupby && (sel.groupby.columns?.length ?? sel.groupby.length ?? 0) > 0);
}

function aggregatedColumns(sel: Node): string[] {
  const out: string[] = [];
  const visit = (n: Node, inAgg: boolean) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "column_ref" && inAgg) out.push(`${n.table ?? "?"}.${n.column}`);
    const agg = inAgg || n.type === "aggr_func";
    for (const v of Object.values(n)) Array.isArray(v) ? v.forEach((x) => visit(x, agg)) : visit(v, agg);
  };
  visit(sel.columns, false);
  return out;
}

export function joinRadar(ast: Node, cteNames: string[]): RadarResult {
  const ctes = new Set(cteNames);
  const selects: Node[] = [];
  collectSelects(ast, selects);
  if (!selects.length) return { state: "NOT CHECKED", title: "Join safety not fully checked for this query shape.", path: null, affected: [], explanation: "No SELECT found." };

  // Subqueries inside WHERE/expressions are not modelled.
  for (const s of selects) {
    const whereSel: Node[] = [];
    collectSelects(s.where, whereSel);
    if (whereSel.length) return { state: "NOT CHECKED", title: "Join safety not fully checked for this query shape.", path: null, affected: [], explanation: "Subqueries in WHERE are outside the supported shapes." };
  }

  let joinedSafely = false;
  for (const s of selects) {
    const from: Node[] = Array.isArray(s.from) ? s.from : [];
    const baseTables = from.filter((f) => f.table && !ctes.has(String(f.table).toLowerCase())).map((f) => String(f.table).toLowerCase());
    const children = baseTables.filter((t) => CHILD_TABLES.has(t));
    if (from.length > 1 && children.length >= 2 && hasAggregate(s)) {
      const path = ["schools", ...children].join(" → ");
      return {
        state: "FAIL",
        title: "Join fan-out: two one-to-many paths joined before aggregation",
        path: `${children[0]} ← schools → ${children[1]}`,
        affected: aggregatedColumns(s),
        explanation: `Each school row is multiplied by (its ${children[0]} rows × its ${children[1]} rows) before aggregation, so SUM/COUNT values are inflated. Path: ${path}.`,
      };
    }
    if (from.length > 1) joinedSafely = true;
  }
  return joinedSafely
    ? { state: "PASS", title: "No join fan-out detected", path: null, affected: [], explanation: "At most one raw one-to-many table per join level; child tables are aggregated before joining." }
    : { state: "PASS", title: "No joins", path: null, affected: [], explanation: "Single-table query; no fan-out possible." };
}
