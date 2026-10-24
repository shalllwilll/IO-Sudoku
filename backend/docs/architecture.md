# Architecture

The backend is a FastAPI service over a pure-Python allocation engine. The engine (`app/core`)
knows nothing about HTTP; the API (`app/api`) wraps it with projects, uploads, runs and events.

```
app/
  main.py          app factory, CORS, routers, error shape
  config.py        Settings.from_env (see ../README.md for the variables)
  api/             REST layer: projects, runs, revisions, ai, events (SSE), store (SQLite)
  core/
    ingest/        read workbook -> map columns -> normalise values -> merge files
    hardware/      signal -> hardware (IO type, duty, CHARM) lookup
    naming/        generated names for CIOC / baseplate labels
    layout/        cable blocks, grouping/affinity, spare reservation, layout derivation
    rules/         rule schema, primitives, scope language, linter, dry run, miner
    solve/         CP-SAT, greedy, QIGA, and the chain that picks between them
    tq/            technical queries: model, raising, answers
    revision/      baseline, matching, impact, history, revision solve
    reports/       KPIs, rule check, declaration sheet
    writer/        the 76-column allocation workbook
    ai/            Gemini gateway, redaction, cache, advisory features
    events/        run event models and store
    pipeline.py    runs the stages and records their hashes
  packs/default/   capacity.json and rules.json (plant parameters and rule presets)
```

## Principles

- **Deterministic core.** Same inputs, rules, pack and seed give the same allocation. Solvers
  take fixed seeds and deterministic-time limits, not wall-clock limits, as the stopping rule.
- **Nothing is guessed silently.** Missing or doubtful data becomes a technical query (TQ) with
  a stated default, never an invented value.
- **AI is advisory.** Gemini may suggest a column match, a value mapping, a rule wording or a TQ
  explanation. It never places a signal, never sees raw MDB rows (values are redacted and
  reduced to distinct samples), and every suggestion waits for a human confirmation.
- **Only hard rules are enforced.** Rules have a strength (`hard`, `soft`, `advisory`); the
  solvers and the validator enforce hard rules only.
- **Spare intent is explicit.** `capacity.json` defaults to the original `declared_pairs`
  policy, which treats each declared but unused cable pair as an installed wired spare. A plant
  can instead select `explicit_pairs` and list `wired_spare_pairs` by cable; unlisted declared
  pairs remain protected `Spare Slot` rows with no claimed CHARM hardware.

## Solver chain

1. **CP-SAT** (OR-tools) over cable blocks. Skipped before the model is built when the option
   count exceeds `cpsat_max_options` (30000); it does not model `pin` or `order` natively, so
   those are enforced by the validator on its answer.
2. **Greedy** first-fit-decreasing with a `Placed` index for fast rule rejection. Used when
   CP-SAT is off, skipped, times out, or returns an answer the validator rejects.
3. **QIGA** (quantum-inspired genetic algorithm), only when greedy left signals on the TQ list
   for want of room or a rule. Its answer is accepted only if the validator passes and fewer
   signals are unplaced. Skipped above `qiga_max_blocks` (400).
4. **TQ list.** Anything still unplaced is reported as a TQ, never dropped.

Every answer passes `validator` (all hard rules re-checked from scratch) before it is kept.

## Runs and events

A run executes in a background task: `POST /runs` answers at once with a run in status
`running`; poll `GET /runs/{rid}` or stream `GET /runs/{rid}/events` (SSE). Events:
`run.started`, `stage.started/finished`, `group.formed`, `placement` (100 per event),
`rejection`, `spare.assigned`, `solver.status`, `fallback.triggered`, `tq.raised`,
`validation.result`, `run.finished`, `error`.

Persistence is SQLite (`DB_PATH`); per-project revision chains live in
`projects/{pid}/revisions.db`. Errors always have the shape `{code, message, details}`.

See [pipeline.md](pipeline.md), [rules.md](rules.md), [tq-codes.md](tq-codes.md),
[performance.md](performance.md), [benchmark.md](benchmark.md) and
[known-limitations.md](known-limitations.md).
