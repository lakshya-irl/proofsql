// Read-only SQL firewall. The security boundary is the parsed AST, not string matching.
import sqliteParser from "node-sql-parser/build/sqlite";
import { allColumns, tableNames } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const ParserCtor = (sqliteParser as Node).Parser ?? (sqliteParser as Node).default?.Parser;
const parser = new ParserCtor();
const OPT = { database: "sqlite" };

export type CheckState = "PASS" | "WARNING" | "FAIL" | "NOT CHECKED";
export type Check = { name: string; state: CheckState; detail: string };

export const ALLOWED_FUNCTIONS = new Set([
  "count", "sum", "avg", "min", "max", "round", "coalesce", "ifnull", "nullif",
  "substr", "substring", "replace", "upper", "lower", "trim", "length", "abs", "cast", "total",
]);

const FORBIDDEN_NODE_TYPES = new Set([
  "insert", "update", "delete", "replace", "create", "drop", "alter", "attach", "detach",
  "truncate", "pragma", "vacuum", "reindex", "analyze", "transaction", "grant", "rename",
]);

export type FirewallResult = {
  allowed: boolean;
  parseError: string | null;
  reasons: string[];
  checks: Check[];
  ast: Node | null;
  tables: string[];
  columns: string[];
  ctes: string[];
};

function walk(node: Node, fn: (n: Node) => void) {
  if (!node || typeof node !== "object") return;
  fn(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
    else if (v && typeof v === "object") walk(v, fn);
  }
}

export function funcName(n: Node): string {
  const nm = n.name;
  if (typeof nm === "string") return nm.toLowerCase();
  if (nm?.name && Array.isArray(nm.name)) return nm.name.map((x: Node) => x.value).join(".").toLowerCase();
  return String(nm ?? "").toLowerCase();
}

export function parseSql(sql: string): Node {
  return parser.astify(sql, OPT);
}

export function checkSql(sql: string): FirewallResult {
  const res: FirewallResult = {
    allowed: false, parseError: null, reasons: [], checks: [], ast: null, tables: [], columns: [], ctes: [],
  };
  let ast: Node;
  try {
    ast = parser.astify(sql, OPT);
  } catch (e) {
    res.parseError = e instanceof Error ? e.message.slice(0, 200) : "Parse failed";
    // Unparseable SQL is never executed. Name obviously dangerous leading verbs for the user.
    const lead = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
    if (["PRAGMA", "ATTACH", "DETACH", "VACUUM", "DROP", "DELETE", "UPDATE", "INSERT"].includes(lead)) {
      res.reasons.push(`${lead} statements are not allowed (read-only policy).`);
    } else {
      res.reasons.push("SQL could not be parsed into a supported AST, so it was not executed.");
    }
    res.checks.push({ name: "SQL parsed into AST", state: "FAIL", detail: res.parseError });
    return res;
  }
  res.checks.push({ name: "SQL parsed into AST", state: "PASS", detail: "Full statement parsed (sqlite dialect)." });

  const stmts: Node[] = Array.isArray(ast) ? ast : [ast];
  if (stmts.length !== 1) {
    res.reasons.push(`Multiple statements (${stmts.length}) are not allowed.`);
    res.checks.push({ name: "Single statement", state: "FAIL", detail: `${stmts.length} statements found.` });
  } else res.checks.push({ name: "Single statement", state: "PASS", detail: "Exactly one statement." });

  const forbidden = new Set<string>();
  stmts.forEach((s) => walk(s, (n) => {
    if (typeof n.type === "string" && FORBIDDEN_NODE_TYPES.has(n.type.toLowerCase())) forbidden.add(n.type.toUpperCase());
  }));
  const top = stmts[0];
  const isSelect = stmts.length === 1 && top?.type === "select";
  if (!isSelect || forbidden.size) {
    const kinds = forbidden.size ? [...forbidden].join(", ") : String(top?.type ?? "unknown").toUpperCase();
    res.reasons.push(`Only SELECT / WITH queries are allowed; found ${kinds}.`);
    res.checks.push({ name: "Read-only policy (SELECT/WITH only)", state: "FAIL", detail: `Found ${kinds}.` });
  } else res.checks.push({ name: "Read-only policy (SELECT/WITH only)", state: "PASS", detail: "No DML, DDL, ATTACH or PRAGMA nodes." });

  if (!isSelect) {
    res.checks.push({ name: "Tables exist", state: "NOT CHECKED", detail: "Statement rejected first." });
    res.checks.push({ name: "Columns exist", state: "NOT CHECKED", detail: "Statement rejected first." });
    return res;
  }
  res.ast = top;

  // CTE names and aliases defined inside the query
  const ctes = new Set<string>();
  const aliases = new Set<string>();
  walk(top, (n) => {
    if (Array.isArray(n.with)) n.with.forEach((w: Node) => w?.name?.value && ctes.add(String(w.name.value).toLowerCase()));
    if (typeof n.as === "string" && n.as.toLowerCase() !== "as") aliases.add(n.as.toLowerCase());
  });
  res.ctes = [...ctes];

  // Tables
  let tableList: string[] = [];
  let columnList: string[] = [];
  try {
    tableList = parser.tableList(sql, OPT);
    columnList = parser.columnList(sql, OPT);
  } catch {
    res.reasons.push("Could not resolve table/column references.");
  }
  const known = new Set(tableNames());
  const badTables: string[] = [];
  const ops = new Set<string>();
  for (const t of tableList) {
    const [op, db, name] = t.split("::");
    ops.add(op ?? "");
    const nm = (name ?? "").toLowerCase();
    if (db && db !== "null") badTables.push(`${db}.${nm}`);
    else if (!known.has(nm) && !ctes.has(nm)) badTables.push(nm);
    else if (known.has(nm)) res.tables.push(nm);
  }
  res.tables = [...new Set(res.tables)];
  if ([...ops].some((o) => o !== "select")) res.reasons.push("Non-select table access detected.");
  if (badTables.length) {
    res.reasons.push(`Unknown or unauthorized tables: ${badTables.join(", ")}.`);
    res.checks.push({ name: "Tables exist", state: "FAIL", detail: `Unknown: ${badTables.join(", ")}` });
  } else res.checks.push({ name: "Tables exist", state: "PASS", detail: `Uses ${res.tables.join(", ") || "no base tables"}${ctes.size ? `; CTEs: ${[...ctes].join(", ")}` : ""}.` });

  // Columns
  const cols = allColumns();
  const badCols: string[] = [];
  for (const c of columnList) {
    const parts = c.split("::");
    const col = (parts[2] ?? "").toLowerCase();
    if (col === "(.*)" || col === "*") continue;
    if (cols.has(col)) res.columns.push(col);
    else if (!aliases.has(col)) badCols.push(col);
  }
  res.columns = [...new Set(res.columns)];
  if (badCols.length) {
    res.reasons.push(`Unknown columns: ${[...new Set(badCols)].join(", ")}.`);
    res.checks.push({ name: "Columns exist", state: "FAIL", detail: `Unknown: ${[...new Set(badCols)].join(", ")}` });
  } else res.checks.push({ name: "Columns exist", state: "PASS", detail: `${res.columns.length} schema columns referenced; aliases resolved.` });

  // Functions
  const badFns = new Set<string>();
  walk(top, (n) => {
    if (n.type === "function" || n.type === "aggr_func") {
      const f = funcName(n);
      if (!ALLOWED_FUNCTIONS.has(f)) badFns.add(f);
    }
  });
  if (badFns.size) {
    res.reasons.push(`Unauthorized functions: ${[...badFns].join(", ")}.`);
    res.checks.push({ name: "Function allowlist", state: "FAIL", detail: [...badFns].join(", ") });
  } else res.checks.push({ name: "Function allowlist", state: "PASS", detail: "Only allowlisted functions used." });

  res.allowed = res.reasons.length === 0;
  return res;
}
