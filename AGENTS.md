<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## ProofSQL architecture
- The demo database runs in the browser (sql.js WASM) and is rebuilt from a seeded fixture; app state (contract, runs, mode) lives in localStorage, kept separate from the analytical DB.
- Model-generated SQL must pass the AST firewall (`src/lib/proofsql/firewall.ts`, node-sql-parser) and the join radar before execution; never add regex-only checks as the boundary.
- The model is called only through server functions in `src/lib/model.functions.ts` so the key stays server-side; never fall back silently to another model.
- Core rules are covered by `src/lib/proofsql/proofsql.test.ts`; keep it passing.
- Evaluation correctness compares normalized result rows (reference SQL is only a trace); summary metrics must be derived from the per-case rows so they can never contradict them.
- Live mode uses the Lovable AI connection when LOVABLE_API_KEY is set, otherwise the MODEL_* endpoint; UI status uses presentation-only labels while original model identity stays in recorded evidence and exports, so presentation cannot change provider selection or analytical traces.
- Plain-language answer presentation derives only from recorded result rows and preserves the original SQL/evidence/export payloads so simplifying copy cannot change analytical results.
- Live model output is a strict JSON plan (LivePlanSchema, no SQL) compiled deterministically by compileLivePlan; deterministic precheck runs before any model call. Why: the model must never author executable SQL.
- Live/scripted status labels come only from the shared PlannerReadiness (src/lib/proofsql/readiness.ts) derived from the health check. Why: pages must never disagree about whether the planner is verified.
- Uploaded datasets: public `datasets` table + private storage bucket with anon read/insert policies; files are validated by opening them in sql.js before upload. Why: owner wants uploads without sign-in.
- This remix starts with an empty Drizzle migration journal; add future schema changes through the migration tool rather than restoring the source project's history, to avoid replaying copied changes against the new database.
- Dataset selection is shared by the app provider; COVID and school use their own deterministic pipelines, schema allowlists and evaluation cases to prevent cross-dataset queries.
- Final interactive SQL runs in a terminable read-only Web Worker with its own database copy; model requests and auxiliary evidence queries are not covered by worker cancellation.
- No sign-in in the UI (owner request); definition approvals are local and open to every visitor. Why: owner wants no login.
