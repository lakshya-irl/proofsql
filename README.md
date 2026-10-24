# ProofSQL

### Answers you can trust from messy databases

ProofSQL is an **answerability-first data-analyst agent** for natural-language questions over imperfect relational data.

It does not stop at generating SQL. ProofSQL first checks whether the question is sufficiently defined, whether the database can support the requested conclusion, whether the proposed plan matches an approved metric definition, and whether the resulting query is safe to execute.

> **Other teams generate SQL. ProofSQL checks whether the database, the query, and the evidence actually justify the answer.**

[Live demo](https://proofsql.lovable.app)

---

## Why ProofSQL?

Real databases are rarely clean. They contain missing values, duplicate records, inconsistent date formats, sentinel values such as `N/A`, and relationships that can silently inflate an otherwise valid-looking query.

ProofSQL is designed around a conservative workflow:

```text
Profile the database
        ↓
Understand the question
        ↓
Clarify ambiguity or abstain when evidence is insufficient
        ↓
Resolve the approved metric definition
        ↓
Ask the model for a structured analytical plan
        ↓
Compile the plan into supported deterministic SQL
        ↓
Validate read-only safety and join risks
        ↓
Execute against isolated browser SQLite
        ↓
Return a Proof Card with evidence, warnings, and limitations
```

The goal is not to make the agent answer every question. The goal is to make its decision—**answer, clarify, abstain, block, or report an error**—inspectable and honest.

---

## Core capabilities

### Answer / Clarify / Abstain / Block

ProofSQL uses explicit decision states:

| State | Meaning |
|---|---|
| `ANSWER` | The question is defined, the required data exists, the query is safe, and validation completed. |
| `ANSWER_WITH_WARNING` | A supported answer exists, but data-quality or join risks require review. |
| `CLARIFY` | Multiple interpretations could materially change the result. |
| `ABSTAIN` | The available data cannot support the requested conclusion, such as forecasting or causal claims. |
| `BLOCKED` | The request violates the read-only or access policy. |
| `ERROR` | A technical failure occurred. The app does not replace it with a fabricated answer. |

### Messy-database health scan

The profiler calculates findings from the fixture instead of displaying hard-coded demo numbers. It checks for:

- table and row counts;
- observed data types;
- nulls and empty strings;
- sentinel values;
- duplicate keys and duplicate business records;
- candidate keys;
- inferred relationships and cardinality;
- approximate row grain;
- mixed academic-year formats;
- numeric ranges;
- one-to-many join fan-out risks;
- near-identical values that may be different entities.

### Semantic Contract

The demo includes versioned, human-reviewable definitions for:

- **Enrolment:** distinct active students by school and normalized academic year.
- **Payment total:** completed payment amounts by school and normalized academic year.
- **Academic year:** an explicit normalization rule for supported raw formats.

Definitions are versioned. Editing a definition creates a draft; older runs keep the definition version they used.

### Structured planning instead of unrestricted SQL

The model returns a constrained analytical plan—for example, what metric to use, which dimension to group by, and which comparison years are intended.

The application then:

1. validates the plan schema;
2. checks it against the approved semantic contract;
3. compiles it into one of the supported deterministic SQLite queries;
4. parses and checks the resulting SQL;
5. checks permissions, row limits, and join safety;
6. executes only the validated query.

The model is not trusted to directly execute arbitrary SQL.

### Join Safety Radar

ProofSQL detects the classic fan-out problem:

```text
schools → enrolments      one-to-many
schools → payments        one-to-many
```

Joining both raw child tables before aggregation can multiply rows and inflate totals. The app reports the risk and, for supported query shapes, applies an aggregate-before-join repair.

### Proof Card

Completed analyses expose the evidence behind the result:

- original question;
- resolved interpretation;
- decision state;
- dataset snapshot;
- model and inference mode;
- semantic-contract version;
- metric and grain;
- assumptions;
- normalization rules;
- excluded rows;
- data-quality warnings;
- compiled SQL and parameters when applicable;
- tables and columns used;
- safety and join checks;
- supporting result rows;
- execution timing;
- export as JSON, Markdown, CSV, or SQL where applicable.

Checks use explicit statuses such as `PASS`, `WARNING`, `FAIL`, and `NOT CHECKED`. A check that did not run is not presented as a successful check.

### Read-only SQL firewall

The analytical database is isolated from application metadata and runs in browser SQLite for the demo. The safety boundary rejects destructive or unsupported operations, including:

- `INSERT`;
- `UPDATE`;
- `DELETE`;
- `DROP`;
- `ALTER`;
- `CREATE`;
- multiple statements;
- unauthorized tables or columns;
- unsupported query shapes.

Blocked requests do not expose a copy-pastable destructive statement.

---

## Supported demo datasets

### School fixture

The primary fixture is a reproducible synthetic education database with intentionally injected data-quality issues.

Tables:

- `districts`
- `schools`
- `enrolments`
- `payments`

The public preview currently reports:

```text
4 tables
1,003 rows
12 warnings
55 duplicate enrolment rows
143 missing/sentinel cells
651 academic-year values requiring normalization
3 unresolved academic-year values
3 inferred relationships
1 join fan-out risk
```

### COVID-19 fixture

The app also includes a historical country-total snapshot labelled:

```text
COVID-19 · JHU CSSE country totals
```

Schema:

- `country`
- `month`
- `as_of_date`
- `confirmed`
- `deaths`
- `recovered`

The COVID fixture is useful for demonstrating that the workflow can adapt to a different schema, while still applying the same answerability, safety, and evidence principles.

---

## Measured preview results

The following results were observed in the deployed preview on **October 25, 2026**. They are fixture-specific measurements, not claims of generalization.

### School fixture

```text
13/13 total cases passed
5/13 cases used live model inference
8/13 cases used deterministic guards
0/13 wrong-answer rate
3/3 semantic answer correctness
3/3 clarification rate
1/1 value-grounding clarification
3/3 abstention rate
2/2 join-risk detection
1/1 security block
```

The live model cases were `A1`, `A2`, `A3`, `J1`, and `J2`.

### COVID fixture

```text
8/8 total cases passed
5/8 cases used live model inference
3/8 cases used deterministic guards
0/8 wrong-answer rate
4/4 semantic answer correctness
3/3 abstention rate
1/1 security block
```

These scores are measured against small local fixtures. They do not establish production reliability or generalization to arbitrary databases.

---

## Current model status

The current public deployment uses:

```text
Provider: Lovable AI Gateway (hosted Google model)
Model: google/gemini-3-flash-preview
Parameter count: UNKNOWN
Open-weight compliance: FAIL
```

The app intentionally displays:

> **Fallback provider — does not satisfy the AI-02 open-weight constraint.**

The application architecture supports a configurable OpenAI-compatible model endpoint, but the current public deployment should not be described as using an open-weight model. A verified open-weight model with no more than 8B parameters must be configured separately before making that claim.

---

## Live readiness checks

Before enabling live planner mode, the application performs separate server-side checks for:

1. endpoint transport;
2. a small chat-completion response;
3. a ProofSQL planner response that passes the runtime schema and compiler contract.

The UI distinguishes:

- `Live · planner verified`;
- `Live · transport only`;
- `Scripted · no live model inference`;
- `Model unavailable`.

The readiness state is shared across the top bar, Ask & Verify, Settings, and Evaluation Lab. If the provider, model, or relevant configuration changes, the previous readiness result is invalidated.

---

## Running the demo

Open the [live ProofSQL preview](https://proofsql.lovable.app).

Recommended judging flow:

1. Select **School** from the dataset switcher.
2. Open **Database Health** and show the duplicate, missing-value, normalization, and join-risk findings.
3. Ask:
   ```text
   Which schools performed best?
   ```
   Expected result: `CLARIFY`.
4. Ask:
   ```text
   Which schools had a decrease in distinct active students from academic year 2023–24 to 2024–25?
   ```
   Expected result: an evidence-backed answer with SQL and warnings.
5. Ask:
   ```text
   Compare enrolment and payment totals by school.
   ```
   Expected result: `ANSWER_WITH_WARNING`, join-risk detection, and a safe repair.
6. Ask:
   ```text
   Which schools will have falling enrolment next year?
   ```
   Expected result: `ABSTAIN` because the fixture contains historical records but no forecasting model or future observations.
7. Ask:
   ```text
   Delete all records.
   ```
   Expected result: `BLOCKED`; no destructive SQL is shown.
8. Open **Evaluation Lab** and run the measured fixture suite.
9. Open **Settings** and show the provider, planner readiness, and open-weight compliance warning.

To demonstrate schema adaptation, switch to **COVID** and run its evaluation suite.

---

## Configuration

Model configuration belongs in server-side secrets or environment settings. Never commit a key to GitHub, frontend code, screenshots, logs, or this README.

Supported configuration names:

```text
MODEL_BASE_URL=https://your-openai-compatible-host/v1
MODEL_API_KEY=<private-server-side-key>
MODEL_NAME=<verified-model-id>
MODEL_MAX_PARAMETERS=<parameter-limit-or-size>
```

The provider must support the application’s server-side chat-completion flow. After configuration, run the health check in **Settings** and verify all three readiness probes before selecting live mode.

If live configuration is unavailable, ProofSQL can use a clearly labelled scripted mode for predefined demo questions. Scripted mode uses real SQLite execution for supported questions but does not claim live model inference.

---

## Data and privacy notes

- The built-in School and COVID fixtures are separate from application metadata.
- Demo analytical queries run against browser SQLite in read-only mode.
- Run History is local to the current browser unless an explicit export/import is used.
- The public Datasets page currently warns that uploaded files are public and downloadable by anyone.
- Uploaded datasets are profiled but are **not yet queryable through Ask & Verify**.
- Do not upload personal, confidential, or production data to the public preview.
- Do not claim that data stays on-device when using a hosted model provider.

---

## Known limitations

The current prototype intentionally does not claim to provide:

- an open-weight-compliant live provider in the public deployment;
- arbitrary natural-language SQL over every schema;
- production database connectors;
- forecasting;
- causal inference;
- unrestricted SQL execution;
- query execution over uploaded datasets;
- full enterprise role-based access control;
- three-turn follow-up evaluation;
- schema rename/split recovery evaluation;
- query cancellation.

Query cancellation remains explicitly:

```text
NOT CHECKED
```

It should remain labelled that way until SQLite execution is moved into a worker or another genuinely cancellable execution boundary is implemented and tested.

---

## Project documentation

This repository includes the design and implementation notes used to shape the prototype:

- [`docs/ProofSQL_Hackathon_MVP_and_Lovable_Prompt.md`](docs/ProofSQL_Hackathon_MVP_and_Lovable_Prompt.md) — MVP scope, architecture, demo flow, safety boundary, and acceptance criteria.
- [`docs/ProofSQL_AI02_USPs.md`](docs/ProofSQL_AI02_USPs.md) — differentiation blueprint and the answerability, join-safety, Proof Card, and evaluation concepts.
- [`docs/ProofSQL_HYPNEXIS26_AI02_Deck.pptx`](docs/ProofSQL_HYPNEXIS26_AI02_Deck.pptx) — presentation for the HYPNEXIS 2026 AI-02 problem.

---

## Design principles

ProofSQL follows these principles:

1. **Do not guess when ambiguity changes the result.**
2. **Do not turn missing data into zero.**
3. **Do not trust model-generated SQL as executable code.**
4. **Do not hide join fan-out risk behind a successful query.**
5. **Do not call a technical failure an abstention.**
6. **Do not display a green check for a check that did not run.**
7. **Do not present scripted output as live inference.**
8. **Do not claim open-weight compliance when the active provider is hosted and its parameter count is unknown.**

---

## License

No open-source license has been selected in this project yet. Add a `LICENSE` file before treating the repository as reusable open-source software.

---

## Status

ProofSQL is a working hackathon prototype and deployed demo. Its strongest current capability is the combination of:

```text
database profiling
→ answerability decisions
→ structured planning
→ deterministic SQL compilation
→ join-risk detection
→ read-only execution
→ evidence-backed Proof Cards
```

The prototype is intentionally transparent about what is live, what is deterministic, what is scripted, what is unsupported, and which model-compliance requirements remain open.
