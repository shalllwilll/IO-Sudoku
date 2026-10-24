# Integration notes

Status: **backend side of 13.1 is done; frontend integration is waiting on the frontend branch.**
The contract (`docs/openapi.json`) is **not frozen yet**: it freezes at the first successful
run of the real frontend, so that the frontend's real needs can still shape it. Until then the
backend may add endpoints; after the freeze a change needs both authors.

## What the backend added for integration

| Endpoint | Purpose |
|---|---|
| `POST /api/projects/{pid}/baseline` `{run_id, label?}` | make a finished initial run the first issue ("00") of the revision chain |
| `POST /api/projects/{pid}/baseline/upload` (file, `?label=`) | make an issued allocation workbook the first issue; 422 `not_an_allocation` if it is not one |
| `POST /api/projects/{pid}/revisions` `{label?, cpsat?, qiga?, seed?}` | allocate the project's current uploads as the next revision; answers with a run (poll it or stream its events) |
| `GET /api/projects/{pid}/revisions` | the chain, oldest first: label, parent, run id, impact |
| `GET /api/projects/{pid}/revisions/{label}` | one issue of the chain |
| `GET /api/projects/{pid}/revisions/compare?from=A&to=B` | pair comparison (`from` is the older side) |
| `GET /api/projects/{pid}/revisions/cumulative` | current slot of every signal, when it last changed and how often |
| `GET /api/projects/{pid}/signals/history?tag=T` | every recorded change of one tag (renames followed) |
| `GET /api/projects/{pid}/runs/{rid}/impact` | now returns `available: true` with `impact` and `diff` for revision runs |
| `DELETE /api/projects/{pid}/uploads/{uid}` | remove an upload (needed to swap in a revised MDB) |

Revision flow the frontend should use: run the initial allocation, `POST /baseline` with that run,
delete the old upload and upload the revised MDB, `POST /revisions`, read `/runs/{id}/impact`
(and `/allocation`, `/report`, `/tqs`, `/download` as for any run), then the chain endpoints.
A revision run's workbook also carries the "Revision Impact" and "Revision Diff" sheets.

Conventions the frontend can rely on:

- Errors are `{code, message, details}` for every status, including unknown paths
  (`404 not_found`) and validation (`422`). Extra fields in a request body are ignored.
- Revision labels are normalised (`1` -> `01`, `05a` -> `05A`); the default is the next number.
- Diff/history `change` values are capitalised words as in the workbook ("Added", "Moved"...);
  compare case-insensitively.
- Large runs deliver placements in `placement` events of 100 each; a 10,000-signal
  run produces about 110 of them.
- 3D-panel data comes only from endpoints in the contract (layout, allocation placements, groups,
  TQ events). No backend feature was added for visuals.

## CORS

Default (development): any `http://localhost` or `http://127.0.0.1` origin is allowed. In release
set `CORS_ORIGINS` to the real frontend origin(s), comma separated; then only those are allowed.

## Mismatch list

Empty: the frontend has not been run against the backend yet. Record each mismatch here as
`endpoint | what the frontend sent or expected | what the backend does | decision | owner`.
A mismatch is fixed on the backend when the contract says so; otherwise agree a change and
update both sides.

## Remaining steps of 13.1 (need the frontend)

1. Run the frontend branch against the backend locally; fill the mismatch list.
2. Fix mismatches; regenerate `docs/openapi.json` with `python scripts/export_openapi.py`.
3. T13.1.1 full demo (upload sample, run, 3D and 2D panels, answer a TQ, revise).
4. T13.1.5 a 10,000-signal run opened in the frontend stays responsive.
5. Freeze `docs/openapi.json`; merge `frontend` into a temporary `integration` branch (never
   straight into `main`); tag `ms-13.1`.
