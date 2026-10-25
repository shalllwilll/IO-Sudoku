# IO Signal Sudoku frontend

React frontend for assigning IO signals to cabinets and reviewing the resulting layout. This repository branch contains frontend code only.

## Requirements

- Node.js 22 or newer
- npm

## Local setup

```powershell
git clone --branch frontend https://github.com/shalllwilll/IO-Sudoku.git
cd IO-Sudoku
npm install
Copy-Item .env.example .env
```

Edit `.env` to set `VITE_ALLOWED_EMAIL_DOMAINS` to the email domain(s) permitted by your team. The list is empty by default, which disables sign-in. Never put secrets in `VITE_*` variables; Vite exposes them to the browser.

Start the development server:

```powershell
npm run dev
```

The default API mode is `mock`, which uses built-in sample data and does not require a backend. The current live adapter is not implemented; do not select `VITE_API_MODE=live` expecting authentication or API calls to work. The Vite `/api` proxy points at `http://localhost:8000` by default and can be changed with `VITE_API_PROXY_TARGET` for local development.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` for local sample data; `live` is pending backend/auth contract completion. |
| `VITE_API_BASE_URL` | same origin | API origin for a future live deployment. |
| `VITE_ALLOWED_EMAIL_DOMAINS` | empty | Comma-separated sign-in domain allow-list. |
| `VITE_MAX_UPLOAD_MB` | `25` | Client-side per-file size limit. Backend validation remains required. |
| `VITE_SPONSOR_LOGO` | empty | Optional public sponsor image path or URL. |
| `VITE_API_PROXY_TARGET` | `http://localhost:8000` | Development-only Vite proxy target. |

## Commands

```powershell
npm run dev            # development server
npm run lint           # ESLint
npm run test -- --run  # unit tests
npm run build          # production build
npm run preview        # serve dist locally after building
npm run e2e            # Playwright browser checks
npm run check          # lint, unit tests, and build
npm run check-contrast # contrast check for base chrome colors
npm run verify-output  # validate generated report output
```

Run the offline demo from the built copy with `npm run build` followed by `npm run preview`. The 3D explorer starts with one workbook upload and **Run**. Existing mappings apply automatically, followed by a 6.5-second reveal of actual cabinet assignments between decorative field/control-room diagrams. Two global I/O and TQ filters become available afterward. Camera controls remain manual throughout. Completed mock runs can also be opened explicitly. See [the explorer guide](docs/allocation-explorer.md). Do not commit scene exports or workbook data.

## Branch and data rules

- Frontend work belongs on the `frontend` branch. Do not push this work to `main` or `backend`.
- Do not commit `.env`, credentials, datasets/workbooks, generated `public/scene/` content, or build output.
- User-provided content must render as text. The backend must independently validate every uploaded file.

See [docs/contract-gaps.md](docs/contract-gaps.md), [docs/known-limits.md](docs/known-limits.md), and [docs/demo-script.md](docs/demo-script.md) before a live demo.
