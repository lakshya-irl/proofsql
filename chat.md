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
