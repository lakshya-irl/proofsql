# chat.md — Central Project Memory

_Last updated: 2026-10-24_

## How to use this file
- Read this file and all referenced project files before any project task.
- Update it whenever new files, instructions, or significant changes arrive.
- Preserve history; mark changed requirements instead of silently deleting them.
- Never record assumptions as confirmed facts.

## Project purpose / overview
- **ProofSQL — The Answerability-First Data Analyst** (HYPNEXIS 2026, AI-02 "Data-Analyst Agent on Messy Databases").
- Business users ask plain-English questions; the app decides ANSWER / CLARIFY / ABSTAIN / BLOCKED / ERROR and shows the evidence.
- Full spec: uploaded file `request3713.txt`. `hub_prompt5624.txt` only said "Build the ProofSQL app".

## Already built (2026-10-24)
- Six pages: Ask & Verify (/), Database Health, Semantic Contract, Run History (+ Proof Card per run), Evaluation Lab, Settings.
- A seeded synthetic education database with injected issues, running in the browser, plus a "Reset demo dataset" action.
- Health scan computed from the data (nothing hard-coded).
- A read-only SQL firewall that checks the parsed query, not text patterns.
- Join Safety Radar, with an aggregate-before-join repair and a comparison of risky vs repaired totals.
- Versioned definitions (Enrolment, Payment total, Academic year). They start as DRAFT and must be approved before use.
- Proof Card with JSON / Markdown / CSV / SQL export.
- 13-case Evaluation Lab (see 2026-10-24 update).
- Scripted mode is clearly labelled. Live mode uses MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME / MODEL_MAX_PARAMETERS on the server (default Qwen/Qwen2.5-Coder-7B-Instruct, max 8B).
- Automated tests: 17 passing.

## Update 2026-10-24 (input7855.txt — competition-readiness plan, "do the whole plan")
- Semantic contract now starts APPROVED v1 (demo-ready); "Reset to demo-ready contract" added. Edits still create new DRAFT versions.
- Prepare Demo (Ask & Verify, Settings): resets data + contract, optional history clear, runs real checks, shows readiness list.
- Join statuses: SAFE / RISK_DETECTED / REPAIR_AVAILABLE / REPAIR_APPLIED / NOT_CHECKED / VALIDATION_ERROR. J1/J2 return ANSWER_WITH_WARNING.
- Evaluation: 13 cases (added C4 Jaipur), semantic result comparison, summary computed from rows. Latest scripted run: 13/13 pass.
- Jaipur grounding offers JPD, JPR, JPU or all three.
- Scripted mode refuses unlisted questions with the required message.
- Live mode: server function analyzeQuestion (structured request, timeout); health check with timeout, last success/failure times.
- Run History filters + run ID, SQL, mode/model, latency. Proof Card: join/SQL safety, joins, model mode, Copy SQL.
- Settings: setup instructions + copy button. "Edit with Lovable" badge hidden on the published site.
- Old saved runs/contract from the previous version are not carried over (storage format changed).

## Requested changes
- None pending.

## Errors / bugs to fix
- The TypeScript errors reported in chat (`src/main.tsx`, `src/pages/Index.tsx`) refer to files that don't exist in this project. They can't be reproduced; they likely come from another project.

## Task status
- Completed: ProofSQL first version (all six core capabilities).
- Pending (needs user): model endpoint values for live mode. Not set yet, so the app runs in scripted mode.
- Not built (optional extension): SQLite/CSV import.

## Must NOT be changed / removed / implemented
- Never rewrite the whole project for small changes.
- Never remove existing functionality without explicit permission.
- No AI-generated images; use code, Tailwind and icons only.
- Out of scope: multiple DB engines, enterprise connectors, forecasting, causal inference, voice, fine-tuning, multi-agent setups, billing, complex roles, long-term memory.
- Never fake model status or validation, never treat missing values as zero, never show numeric confidence percentages.
- Only open-weight models of 8B parameters or fewer; no hidden fallback model.

## Working rules from the user
- Read all relevant provided files before starting; latest instructions win.
- Don't judge files by their names; read contents and relate them.
- Ask when information is missing, unclear, or contradictory.
- Make only the necessary changes; verify fixes; report what couldn't be verified.
- After each task, summarize: what changed, errors fixed, files modified, what remains, and whether chat.md was updated.

## Referenced files
| File | Purpose |
|------|---------|
| request3713.txt | Full ProofSQL specification |
| hub_prompt5624.txt | Short instruction: build the ProofSQL app |

## Decisions log
- 2026-10-24: chat.md established as central project memory.
- 2026-10-24: Built ProofSQL v1 with an in-browser database and scripted mode as default; live mode activates only when a reachable ≤8B model endpoint is configured.

## Update 2026-10-24 — guidance on closing remaining limitations
- Request: explain live-model setup, recovery of older saved runs, query cancellation, and the reported `src/pages/Index.tsx(18,11)` overload error.
- Verified: this project has `src/routes/index.tsx`, not `src/pages/Index.tsx`; the supplied partial overload error cannot be reproduced from that path. All 17 existing tests pass.
- Guidance: configure an HTTPS OpenAI-compatible endpoint for a verified open-weight model of 8B parameters or fewer; keep its key server-side; run Settings health check, then test real live questions and the evaluation suite. A model-list health check alone does not verify inference.
- Older runs are ignored by the current storage version, not necessarily deleted. Recovery depends on old browser storage or exported backups still being available; inspect before resetting or clearing anything.
- Query cancellation remains unimplemented: synchronous browser SQLite needs an isolated Web Worker with termination and database reconstruction for a real execution deadline. The existing 8-second health and 45-second model-request limits do not limit SQL execution.
- Files modified for this guidance task: chat.md only. No app behavior changed; model credentials, live verification, old-run recovery and query cancellation remain outstanding.

## Update 2026-10-24 — where to obtain model connection values
- User asked how to obtain the four live-model configuration values and reported `src/App.tsx(8,14)` / `onOpenChange` typed as `never`.
- Checked: `src/App.tsx` does not exist here. The available build/runtime log files showed no reported error; this specific error remains unverified without the source and complete diagnostic.
- Guidance: obtain the API base address, private key and exact served model ID from a host offering an eligible model; obtain parameter size from the model's official documentation. Verify support for both model-list and chat-completion endpoints before paying. Do not paste a private key into chat.
- No provider selected or credential requested. Only chat.md changed; live configuration is still pending.

## 2026-10-24 — Live mode switched to Lovable AI
- Owner (Rishi) dropped the 8B limit: no ≤8B host worked (OpenRouter 429, HF 402, Groq allam bad JSON, Google gemma-3-4b removed).
- Lovable Cloud enabled. Live mode now uses google/gemini-3-flash-preview via Lovable AI; tested: real question answered (5 rows, join SAFE, 1.7 s).
- The UI shows the real model name. Declined the request to label it as Qwen (that would misstate the model).
- 2026-10-24: Live is now the primary mode (default when the model answers and no mode was chosen); scripted is the backup. Messy demo DB shared as proofsql-messy-demo.sqlite/.sql. Uploading your own database is not supported yet.

## 2026-10-24 — P0 live planner fix (MARIO GAMERS FF spec)
- Live model now returns a strict structured plan (no SQL); app compiles it to vetted SQL (src/lib/proofsql/livePlan.ts).
- Deterministic pre-checks (block / forecast / causal / missing field / clarify / Jaipur grounding) run before the model, labelled "No live model inference".
- Health check = 3 probes (transport, chat, planner schema); Settings shows each + open-weight FAIL for the hosted Google model ("Fallback provider").
- Live errors return ERROR with a code (INVALID_JSON, PLAN_SCHEMA_INVALID, UNSUPPORTED_PLAN, …) and a redacted developer trace; blocked runs withhold SQL.
- Measured in preview: live evaluation 13/13; only A1-A3, J1, J2 used live inference, the other 8 were decided by deterministic guards.
- Not done yet: P1 (Proof Card header, Run History export/import, mobile checks), P2, query cancellation (NOT CHECKED).

## 2026-10-24 — Planner readiness consistency (instruction7703.txt)
- One shared planner readiness object (src/lib/proofsql/readiness.ts) in AppProvider; header, Ask & Verify, Settings, Evaluation Lab all read it.
- Health probe now uses "Count schools by district." and must also compile through the deterministic compiler; schema not loosened.
- Cached readiness dropped when provider/model/config fingerprint changes; fresh session shows explicit unknown/"Model unavailable".
- Evaluation Lab: new columns Inference used / Mode / Provider / Model / Error code; header says Live provider only if A1-A3, J1, J2 all used live inference.
- Tests: 32 pass (8 new). Browser check: all three pages show "Live · planner verified — google/gemini-3-flash-preview".
- Not browser-tested: a real failed health check (covered by unit tests only).

## 2026-10-24 — Logo, error handling, UI polish (request7198.txt)
- Uploaded ProofSQL logo: icon part used as favicon (public/favicon.png, favicon.ico removed) and sidebar logo.
- Error handling: page-level error boundary (one broken page no longer blanks the app, with Try again / Reload), toast for any unhandled async failure, Ask & Verify catches failed questions (toast, nothing executed, no stale Proof Card). Messages are scrubbed of keys/tokens.
- Colours moved to the logo's blue; visible keyboard focus everywhere; no sideways page scrolling.
- Checked: all 6 pages load with no errors; 32 tests pass. Full visual redesign of every page not done yet.

## 2026-10-24 — P1: Proof Card header, Run History export/import, mobile (context4762.txt)
- Proof Card: sticky summary header (decision, confidence, warnings, summary, inference label, model only when live inference was used, snapshot, contract versions, timings, run ID) + Jump to evidence; new result opens at the top; BLOCKED shows "SQL withheld", ERROR shows code and "no rows". Provenance no longer shows a model name for scripted/guard runs.
- Run History: "Local to this browser" label, Export all (JSON), Import JSON (validated; skipped records listed with reasons; duplicates ignored; imported BLOCKED runs lose any SQL), Clear, legacy key migration (proofsql.runs.v1 / proofsql.runs) with skipped report, card list on phones.
- Verified in browser: live question "decrease in distinct active students 2023-24 → 2024-25" → ANSWER, 3 schools, google/gemini-3-flash-preview, compiled SQL with bound params, assumptions, rows. No sideways scrolling at 320 and 768 on Ask & Verify and Run History. 38 tests pass (6 new).
- Not done: P2; query cancellation NOT CHECKED; import from file not browser-tested (unit tests only).

## 2026-10-24 — Datasets uploads (MARIO GAMERS FF)
- Added /datasets: public online uploads (CSV/SQLite/SQL, 20 MB), no sign-in; real measured profile (rows, NULLs, placeholders, duplicates).
- UDISE+ real data NOT loaded: data.gov.in / UDISE+ download not reachable from the sandbox; user must upload the CSV. Ask & Verify on uploaded data NOT SUPPORTED yet.
- Security: uploads are visible to everyone (no sign-in by owner decision).

## 2026-10-24 — COVID-19 dataset
- Added real COVID-19 data (JHU CSSE via github.com/datasets/covid-19), monthly per country, new COVID-19 data page; school demo kept.
- 2026-10-24: COVID page got a free-text "Ask AI" box (model maps to a menu question as JSON; unmappable → CLARIFY). Health/Contract/Proof Card for user dataset waits on the dataset upload.

## 2026-10-24 — Remix setup (Lakshya Khatri)
- Requested replacement of MODEL_API_KEY, MODEL_BASE_URL, MODEL_MAX_PARAMETERS and MODEL_NAME. The secure replacement form was rejected; none of these values was updated in this task.
- Cleared the copied 0000_public_datasets SQL migration and its snapshot; rescaffolded an empty PostgreSQL v7 migration journal. Left drizzle/schema.ts and drizzle.config.ts unchanged.
- This resets only source migration history; no database statements ran and no stored data or existing tables were deleted. Upload schema/storage availability in the new backend remains unverified.
- Existing provider selection still prioritizes LOVABLE_API_KEY over MODEL_* when present; no provider behavior was changed.

## 2026-10-24 — task8135.txt: first-class COVID and Part 2 foundations
- Reported src/pages/NotFound.tsx is absent; the actual TanStack missing-page view renders successfully. No matching boolean/ReactNode diagnostic was found.
- Top-bar COVID/School switch now drives Ask & Verify, Schema, Health, Contract and Evaluation. School behavior retained. COVID answers use the AST firewall and measured key uniqueness, with definitions and evidence on the same Proof Card.
- Added eight real-source COVID evaluation cases. Browser measured scripted COVID 8/8 and school 13/13. Live COVID measured 8/8 with google/gemini-3-flash-preview; CV1–CV5 used inference, CV6–CV8 used deterministic guards. These are observations, not guaranteed future accuracy.
- Fixed COVID top-ranking execution: parser does not support a placeholder in LIMIT; the compiler now emits a clamped integer LIMIT and keeps the month bound.
- Added Proof Card follow-up buttons, working evidence jump, schema-change clarification instead of silent renamed-table mapping, attack tests, and isolated final-SQL worker execution with an 8-second deadline.
- Browser termination check: expensive SQL returned QUERY_CANCELLED; subsequent count query returned all 5,544 COVID rows. Model calls and auxiliary evidence/radar queries are not cancelled by this worker.
- User chose admins and analysts for shared approvals; only admins manage access. Added separate protected user_roles, shared_definitions and dataset_access; existing public uploads remain public. Shared approvals have server auth/role checks and RLS. Local demo approval remains separate.
- Google and Lovable sign-in providers enabled; Settings offers sign-in/permissions and admin access-grant controls. Backend has zero auth users: authenticated role assignment/approval end-to-end cannot yet be verified; no arbitrary admin was created.
- Education integration blocked: only instruction text supplied, no education dataset and no uploaded dataset records. No real education data fabricated.
- Modified: app provider/shell, Ask/Health/Contract/Evaluation/Settings and head metadata on History/Run routes; COVID compiler/pipeline; school pipeline/error codes; ProofCard; new COVID views/evaluation, worker/executor, permissions/server functions/account/shared-approval controls, Part 2 tests; AGENTS.md, roadmap.md, chat.md and generated backend migration/types.
- Full arbitrary renamed-table mapping and own-data querying remain pending the actual education file and explicit column/metric definitions. Role checks await a real signed-in account assigned a role.
