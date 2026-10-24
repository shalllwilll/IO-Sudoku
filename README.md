# IO Signal Sudoku

VIT Code Apex 3.0, Emerson track, PS #02: allocate DeltaV IO signals from an MDB workbook into
cabinets, CIOCs, baseplates and CHARMs, and write the 76-column allocation template.

## Branches

- `backend`: allocation engine, REST API and a plain React test UI (`testapp/`).
- `frontend`: the 3D plant view and screens (separate teammate).
- `main`: integration only, at release.

## Install

Python 3.11 or newer.

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.lock
pip install -e . --no-deps
```

## Configure

Copy `backend/.env.example` to `backend/.env` (git-ignored). Every variable is optional.

| Variable | Default | Meaning |
|---|---|---|
| `SUDOKU_DATA_DIR` | none | folder with the hackathon workbooks (sample MDB, blank template) |
| `GEMINI_API_KEY` | empty | enables the AI helpers; empty means AI is off, nothing else changes |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | see `.env.example` | models tried in order |
| `DB_PATH` | `sudoku.db` | SQLite file for projects and runs |
| `SUDOKU_CPSAT` | `1` | `0` turns CP-SAT off (greedy only) |
| `SUDOKU_QIGA` | `1` | `0` turns the QIGA third stage off |
| `MAX_UPLOAD_MB` | `25` | upload size limit |
| `TEMPLATE_PATH` | none | allocation template; found in the data folder if unset |
| `CORS_ORIGINS` | empty | comma-separated origins allowed to call the API |

The hackathon data files are for hackathon use only. They stay in `backend/data/`, which is
git-ignored; never commit them. The API key lives only in `.env`.

## Run

```bash
cd backend
SUDOKU_DATA_DIR=data uvicorn app.main:app      # http://localhost:8000, docs at /docs
```

Test UI (a plain React app against the same API):

```bash
cd testapp && npm install && npm run dev       # http://localhost:5173
```

It reads the API address from `VITE_API_BASE` (see `testapp/.env.example`). Add its origin to
`CORS_ORIGINS` if you serve it from anywhere other than `localhost:5173`.

## Demo

With the backend running and the sample MDB in `backend/data/`:

```bash
cd backend && python scripts/demo.py
```

It creates a project, uploads the sample, runs the allocation, prints the result, the TQs and
the rule check, and writes `demo_allocation.xlsx`. Pass another workbook as the first argument.

## Test

```bash
cd backend
SUDOKU_DATA_DIR=data pytest -q     # without SUDOKU_DATA_DIR the data-dependent tests skip
ruff check . && ruff format --check .
```

## Docs

In `backend/docs/`: [architecture](backend/docs/architecture.md),
[pipeline](backend/docs/pipeline.md), [rules](backend/docs/rules.md),
[TQ codes](backend/docs/tq-codes.md), [performance](backend/docs/performance.md),
[benchmark](backend/docs/benchmark.md), [known limitations](backend/docs/known-limitations.md),
[integration notes](backend/docs/integration-notes.md) and the OpenAPI file `openapi.json`.

## Docker

```bash
docker compose up --build        # API on http://localhost:8000
```

The image does not contain the hackathon data; the compose file mounts `backend/data` read-only.
