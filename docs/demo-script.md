# IO Signal Sudoku demo script

This is the offline, mock-mode rehearsal. Use a clean browser session and a local `.env` with `VITE_API_MODE=mock` plus an allowed demo email domain. No backend or dataset workbook is needed; the app's mock adapter supplies sample data.

| Time | Action | What to show |
|---|---|---|
| 0:00–0:30 | Open the landing page and sign in with a mock-accepted address. | Centered login form and cursor-responsive background. |
| 0:30–1:15 | On Projects, choose a sample workbook/CSV and review Preferences. | Upload checks, file chips, and settings. |
| 1:15–2:15 | Create/open the project, correct a column mapping, and confirm values. | Confidence, mapping validation, and IO type assignment. |
| 2:15–3:00 | Review rules and save a revision. | Rule controls, validation feedback, and revision history. |
| 3:00–4:00 | Start a mock run and follow progress to the result. | Stage progress, placements, TQs, and result tabs. |
| 4:00–5:00 | Open the 2D cabinet result, then the 3D plant tour. | State legend, cabinet details, tour Skip/Replay, and camera ladder. |
| 5:00–5:30 | Return to History and use the available report/download actions. | Run history, revisions, and exported report. |

Before presenting, run `npm run build`, then `npm run preview`, and walk the script twice from the built copy. The real backend flow is not rehearsable until the auth mechanism, final API contract, CORS origin, and live service are supplied.
