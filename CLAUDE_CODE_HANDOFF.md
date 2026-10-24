# IO Signal Sudoku — Claude Code Handoff

## Purpose and scope

This repository implements the backend for the Emerson / VIT Code Apex **IO Signal
Sudoku** challenge. It reads one or more MDB-style Excel workbooks, validates and
normalises their IO-signal records, allocates cable blocks into DeltaV cabinets,
CIOCs, baseplates and CHARMs, and writes the supplied 76-column allocation
template.

The project was built incrementally from `IO_Sudoku_Backend_Prompt_Book.md` and
`HANDOFF_CONTEXT.md`. Treat the Emerson source workbooks and the allocation
fundamentals document as the governing project evidence. They are examples and
approved reference data; do not invent physical facts absent from them.

The present objective is a robust, explainable allocator for the Emerson-supplied
sample, while retaining controlled custom-rule, TQ, revision, API and AI-assist
capabilities. It is not intended to silently guess engineering decisions.

## Repository and branch rules

- Repository: `https://github.com/shalllwilll/IO-Sudoku.git`
- Local root: `/Users/sharwilhodgar/Desktop/IO-SUDOKU`
- Active branch: `backend`
- `frontend` belongs to the user's teammate. **Never commit, push, merge, reset,
  or otherwise modify it.**
- Push completed backend work only to `origin backend`, after a green test suite.
- Historic milestones were annotated and pushed through `ms-12.2`. Do not tag or
  merge a release until the frontend integration is complete and the user asks.
- Do not add co-author, assistant, session, or generated trailers to commits.
- Preserve unrelated user changes. Never use destructive Git commands unless the
  user explicitly requests them.

Recent backend commits (newest first when this document was written):

- `267dccb feat(ai): add bounded intent previews for allocation rules`
- `22d0d29 feat(reference): guide allocation from approved project workbook`
- `962efff docs(boundaries): declare derived allocation assumptions`
- `a3aeee9 fix(segregation): raise actionable TQs for unknown codes`
- `8087b22 feat(hardware): protect unresolved direct allocations with TQs`
- `a701c89 fix(spares): require confirmed wiring for wired spares`
- `5f33c90 feat(validate): enforce hierarchy and status semantics`

## Security and confidential material

- Hackathon-provided workbooks, spreadsheets, PDFs and anything copied from them
  belong under git-ignored `backend/data/`. Do not commit, paste, publish, or
  share them.
- `backend/.env` is git-ignored and contains local settings. It currently has a
  Gemini key supplied by the user. **Do not print, copy into a Markdown file,
  commit, log, or echo that key.**
- The ZIP provided for the intent agent had no usable key; its `.env.example` was
  blank. Its code was used as a design reference only, never executed as an
  authority over this backend.
- Local Gemini configuration is:
  `GEMINI_MODEL=gemini-3.8-flash` and
  `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`.
  A direct provider probe found the primary model timed out after 20 seconds and
  the fallback returned HTTP 200. The gateway tries primary first, then fallback.
- Before any commit, inspect staged changes for accidental secrets and workbook
  content. In particular, do not commit `.env`, `.xlsx`, `.db`, `data/`, output
  reports, or uploaded user files.

## Current repository state

The working branch is `backend`. The full backend, basic test UI, Docker assets,
documentation and a substantial regression suite already exist. The frontend from
the teammate is not ready, so release/interface freeze and integration are
intentionally pending.

The latest completed implementation adds a **bounded intent preview** route:

`POST /api/projects/{project_id}/intent`

It identifies a natural-language request as a supported rule suggestion,
clarification, explanation request, or conflict. It is deliberately non-mutating:
it never changes a rule, allocation, or output on its own. Explicit confirmation
remains at the existing rule-compile confirmation flow. Requests to mix mutually
exclusive A/B segregation families are surfaced as conflicts rather than accepted.

The latest focused verification for that work passed 65 API/AI/rules tests plus
Ruff. The project had also previously passed repeated full suites (434 passing
with sample data; 393 passing and 41 skipped without it). Re-run tests after any
new work rather than relying on those counts.

## What has been built

### Ingestion, normalisation and data quality

- Workbook reader with header detection, multi-file merge and source accounting.
- Column mapper with confidence, confirmation persistence, aliases, group and
  segregation-shape parsing.
- Normalisation/value maps, duty split, pair parsing, formation parsing and
  out-of-scope handling for IRC/MCC rows.
- Deterministic TQs for missing, conflicting, unknown or unaccounted data.
- Mapping/value/TQ answers with row, cable and global scopes; narrower scopes
  win. Pipeline stages are hash-cached and rerun only from the affected stage.

### Hardware, layout and allocation

- Ordered hardware decision table in `backend/packs/default/hardware.json`, with
  a 189/189 sample golden test for the implemented data.
- Cable blocks and affinity groups; blocks are packing units, not individual
  signals.
- Derived DeltaV hierarchy: 12 CHARMs/baseplate, 8 baseplates/CIOC, 4 CIOCs/
  cabinet; first baseplate alarm protection and last three baseplates of the last
  CIOC reserved as spares according to the implemented pack.
- Greedy first-fit-decreasing packing with hard rule filters, spare handling,
  protection rules and validator gating.
- Deterministic CP-SAT allocation stage before greedy. It optimises unallocated
  signals/cabinets/CIOCs, uses deterministic settings and protects against overly
  large models.
- QIGA experimental third stage after greedy for eligible hard instances. It is
  validator-gated, seeded, bounded and cannot replace a valid better solution.
- Reference-guided allocation reads approved physical reference placements where
  identities match, preserving approved locations rather than guessing. It
  matches 176/177 field identity/physical-location facts and all 22 confirmed
  wired-spare statuses in the supplied reference comparison.
- 76-column allocation template writer, spare slots, change types/remarks, KPI,
  declaration, rule-check and completion reports.

### Rules, validation and TQs

- Safe, hand-written scope parser; no `eval`.
- Nine primitives: `co_locate`, `separate`, `capacity`, `reserve`, `quota`,
  `order`, `assign`, `pin`, `limit_span`.
- Hard, soft and advisory strengths; built-in invariant rules; presets
  `plant-default` and `strict` in `packs/default/rules.json`.
- Rule linting, dry run, native/validator enforcement and deterministic rule-set
  hashes.
- TQ model/store with stable identifiers, answer history, scope, options and
  project/signal/cable context. TQ categories are missing data, rule conflicts
  and capacity issues.
- Validation covers signal accounting, duplicates, capacity, CHARM numbering,
  cable-block shape, segregation, reservation and hard rules.

### Revisions

- SQLite baseline/run storage and revision chain.
- Cable+pair matching first, tag fallback with `TQ-REV` when uncertain.
- Pinned unchanged blocks, move penalties, CP-SAT tiers, greedy-pin fallback and
  QIGA overflow attempt.
- Diff/impact sheets, move reasons and history/read endpoints.

### Service, events and basic UI

- FastAPI service under `/api`, including projects, uploads, mappings, values,
  rules, runs, allocation/report downloads, layout/groups, TQs, AI status and
  revision history.
- Structured errors: `{code, message, details}`.
- Background runs and SSE events for run/stage/placement/rejection/spare/solver/
  TQ/validation/completion/error status.
- `testapp/` contains a small React/Vite UI used to exercise the backend while
  the teammate's full frontend is in progress.
- OpenAPI contract is generated at `backend/docs/openapi.json`; regenerate it
  with `python scripts/export_openapi.py` after modifying routes or models.

### AI features

- One Gemini gateway (`app/core/ai/gateway.py`) for redaction, cache, retry,
  structured-output validation and fallback. AI never directly allocates signals.
- AI-assisted mapping hints, value classification, natural-language rule compile,
  and TQ wording all have deterministic/offline fallbacks.
- `app/core/ai/intent.py` adds intent previews; it routes explicit rule wording
  through the real `compile_rule` logic, never through the archive's placeholder
  solver or apply method.

## Allocation-engine behaviour

Important implementation choices and evidence boundaries:

- A cable is allocated as a contiguous block. A block of up to 12 fits one
  baseplate; larger blocks occupy consecutive baseplates starting at channel 1.
- Pack conflicts currently prevent A and B from sharing a CIOC. An unknown
  segregation code receives an exclusive family and actionable TQ rather than a
  fabricated classification.
- The engine will only label a pair as a **Wired Spare** when source/reference
  evidence confirms it. Unused/unknown pairs remain spare slots and generate
  truthful TQ-SPARE implications.
- The sample/reference workbook is an approved guide, not an excuse to hard-code
  its individual rows. Reference guidance is identity-matched and falls back to
  normal revision solving where it cannot safely match.
- Relay-output terminal-block hardware remains intentionally unresolved if it is
  not supplied by Emerson. It produces TQ-HW instead of guessed part numbers.
- Controller/cabinet boundaries can be derived, but exact physical boundaries
  cannot be asserted where project evidence does not specify them.

## API, UI, and execution

The backend lives in `backend/`; Python virtual environment is `backend/.venv`.
The app reads environment variables only. It does **not** load `.env` itself, so
source it when launching manually:

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU
set -a && source backend/.env && set +a
cd backend
.venv/bin/uvicorn app.main:app --reload
```

The default port is 8000 because Uvicorn uses 8000 unless `--port` is supplied.
If it is occupied, use a free port, for example:

```bash
.venv/bin/uvicorn app.main:app --reload --port 8001
```

Basic test UI:

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU/testapp
npm install
npm run dev
```

Useful existing documents:

- `README.md`
- `backend/docs/architecture.md`
- `backend/docs/pipeline.md`
- `backend/docs/rules.md`
- `backend/docs/tq-codes.md`
- `backend/docs/known-limitations.md`
- `backend/docs/benchmark.md`
- `backend/docs/performance.md`
- `backend/docs/integration-notes.md`

## AI and intent-agent integration

The user supplied `io-sudoku-intent-agent-files (1).zip`. It was inspected
without extracting its contents into the project. The archive supplied useful
ideas (closed intents, confirmation, audit), but it contains placeholder solver
and dry-run logic and must not replace real allocation logic.

The real integration is intentionally minimal and safe:

1. Client submits a short request to `/api/projects/{pid}/intent`.
2. The service builds a preview from current project rules and data when present.
3. Deterministic guardrails detect unsafe/ambiguous requests first.
4. Actual rule translation uses the existing AI/deterministic rule compiler.
5. A separately explicit confirmation route applies a valid rule.
6. All allocation runs remain solver/validator controlled.

Do not make an LLM a placement authority. Keep all model payloads redacted and
structured. If model output is malformed, unavailable, timed out or invalid, use
the deterministic path and communicate that result.

## Validation completed

Tests are in `backend/tests/`; use the local venv.

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU/backend
env -u GEMINI_API_KEY SUDOKU_DATA_DIR=data .venv/bin/pytest -q
env -u GEMINI_API_KEY .venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
```

Use `SUDOKU_DATA_DIR=data` only on the private local setup that contains the
ignored sample files. The no-data run is important because it verifies graceful
skipping and offline behaviour.

Quality work already performed includes property/metamorphic tests, fault
injection, API contract checks, mutation probes, deterministic solver checks,
scale testing to 10,000 synthetic signals, workbook output/header tests, sample
hardware golden tests and repeated full-suite runs.

## Current limitations and TQs

- Exact committee-workbook reproduction cannot be guaranteed without factual
  inputs absent from the supplied material. The engine does not invent them.
- Relay-output CHARM/TB part details are unresolved where Emerson did not provide
  them: TQ-HW.
- Physical confirmation of unused cable pairs as wired spares is not generally
  available: TQ-SPARE.
- CIOCs per controller is configurable (currently 16) but unconfirmed as a
  universal engineering fact.
- `Section / Sub Unit` is not derivable from the supplied input and is written
  conservatively.
- CP-SAT does not natively model `pin` and `order`; they are validator-gated.
- Revision solving does not grow the layout; overflow becomes a capacity TQ.
- QIGA is experimental and bounded (skips overly large block counts); the
  benchmark notes that a QPSO variant was cheaper, but no swap has been made.
- AI availability is opportunistic. The current primary model timed out in the
  direct check; fallback worked. Allocation correctness must never depend on AI.
- Frontend integration, API freeze and release tag/merge wait for the teammate's
  frontend.

## Next work, in order

1. Wait for the user's intent-agent files/requirements if they provide a newer
   or broader implementation. Keep the existing preview/confirmation design
   unless evidence justifies expanding it.
2. When the frontend is ready, validate it against `backend/docs/openapi.json`,
   exercise upload → map → rules → run → TQ → output/revision flows, resolve any
   contract mismatch, then freeze the OpenAPI contract.
3. Re-run the sample allocation and comparison after any relevant engine change.
   Report evidence-backed deltas, not a single made-up "accuracy" score.
4. Resolve only factual engineering TQs when the committee supplies evidence.
   Do not add VIT-only filters, hard-coded sample rows or assumptions merely to
   improve workbook similarity.
5. Before final release, run full suites with and without private sample data,
   lint/format, secret/data scans, Docker/fresh-clone rehearsal, API/UI
   integration, then get the user's approval for tagging/merging.

## Commands

Repository checks:

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU
git status --short
git branch --show-current
git log -1 --oneline
```

Backend test/lint:

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU/backend
env -u GEMINI_API_KEY SUDOKU_DATA_DIR=data .venv/bin/pytest -q
env -u GEMINI_API_KEY .venv/bin/pytest -q
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Regenerate OpenAPI after API changes:

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU/backend
.venv/bin/python scripts/export_openapi.py
```

Run the documented demo:

```bash
cd /Users/sharwilhodgar/Desktop/IO-SUDOKU/backend
set -a && source .env && set +a
.venv/bin/python scripts/demo.py
```

## Do-not-do list

- Do not expose, rotate, commit or print Gemini keys.
- Do not commit private hackathon workbooks, generated workbooks or SQLite data.
- Do not push to `frontend`, or merge/tag a release while frontend integration is
  pending.
- Do not use an LLM to assign physical slots or silently apply rules.
- Do not replace the real pipeline, solver, validator or TQ system with the ZIP
  agent's placeholder implementations.
- Do not turn missing physical evidence into arbitrary hard rules in order to
  force a closer match to the committee workbook.
- Do not treat prior passing test counts as proof after a change; rerun relevant
  tests before committing or pushing.
