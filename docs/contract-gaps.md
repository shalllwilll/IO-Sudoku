# Contract notes: frontend vs backend

Checked against `origin/backend` (head `4cdfe92`, `backend/docs/openapi.json` and `backend/app/core/*`).
The backend says its contract is not frozen until the first real frontend run, so every open row
below is a candidate for the mismatch list in `backend/docs/integration-notes.md`.

## Aligned (wire vocabulary lives in `src/api/live/wire.js`; the mock emits the same shapes)

| Area | Wire shape |
|---|---|
| Run events | `run.started`, `stage.started`/`stage.finished` (`stage`), `placement` (`placements[]`), `tq.raised` (`id`), `run.finished`, `error`. Also `group.formed`, `rejection`, `spare.assigned`, `solver.status`, `fallback.triggered`, `validation.result` (logged only). Envelope `{seq,type,at,data}`. |
| Run status | `running` / `finished` / `failed` |
| Placement kind | `field` / `wired_spare` / `cabinet_alarm`; the IO type of a field signal is `signal.io_type` |
| TQ severity | `blocking` / `assumed` / `info` |
| TQ position | none. `signal_keys` are `"<source file>:<source row>"` and are matched to the placed signals' `source_file` and `source_row` |
| TQ answer | `{option, scope, target, value, fields, author}`; `option` is one of the TQ's `options[].label` |
| Mapping save | `{fileName: {field: columnName}}` |
| Report | rules: `rule`, `description`, `passed`, `violations`, `enforced`, `strength`. Spares: `cabinets[]` and `by_controller_io[]` with the backend field names |

## Still open

- The live adapter (`src/api/live/index.js`) is a stub until Phase 8; only the wire vocabulary is done.
- Mapping: the wire cannot say "ignore this auto-matched column", and it keys by file name, not sheet. The UI treats a saved file entry as the whole truth; whether the backend does the same is unverified. A field mapped to two columns keeps the first.
- The pipeline has 6 stages (`ingest`, `map`, `normalise`, `hardware`, `layout`, `pack`). Progress counts `stage.finished` events against that list.
- Answer values: some options need `value` (map-pick, capacity, value maps) or `fields` (hardware part numbers, naming, rule changes). The UI sends `value` as typed and `fields` empty; the hardware, naming and rule-revise options need a dedicated form.
- `placement` events carry only `{cioc_no, baseplate, channel, kind, tag, block_id}`, so the grid still fills from the allocation endpoint after the run.
- A `tq.raised` event carries only `{id, code, severity, category, message, signals}`: no signal key, tag or cable. The 3D view can place a TQ from the run's TQ list but not from a live event, so a TQ raised mid-run shows no marker until the run finishes (docs/scene-data.md).
- CHARM and terminal-block part numbers are resolved by the backend's hardware stage but are not on the allocation response, so the 3D detail view and the info box show them as "unknown".
- No auth, chat, preferences, cancel-run or named rule-set endpoints exist. Sign-in is local, chat uses the FAQ fallback, rule sets live in sessionStorage.
