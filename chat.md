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
- 12-case Evaluation Lab with measured results. Latest scripted run: all cases matched.
- Scripted mode is clearly labelled. Live mode uses MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME / MODEL_MAX_PARAMETERS on the server (default Qwen/Qwen2.5-Coder-7B-Instruct, max 8B).
- Automated tests for the acceptance rules (11 passing).

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
