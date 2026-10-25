# Five-minute demo script

Pre-flight (one minute before): backend running with `backend/.env` present (AI badge reads "AI ready"), web app open, then run

```bash
backend/.venv/bin/python backend/scripts/demo_smoke.py
```

It must end with `DEMO READY`. Allocation of the sample takes a few seconds; everything else is instant.

| Time | Screen | Say and do | If it goes wrong |
| --- | --- | --- | --- |
| 0:00 | Login, Projects | Enter a name. "One click to a working plant": press **Load sample plant**. | The project already exists: open it. |
| 0:30 | Import | 189 signals imported, columns and values recognised. Nothing to fix. | Open the import check only if asked. |
| 1:00 | Rules | Type **Keep AIR and DOR on separate CIOCs**, press Check rule. Show the checked preview (signals touched, locked or not). Press **Add to rules** only if wanted. "This works without AI; anything unusual goes to Gemini." Then switch the preset to **Strict**: "Stricter plant rules, so some cables will not fit." | AI off: templates still work. Skip the add, the preview is the point. |
| 1:45 | Allocate | **Start allocation**. The page opens the results when it finishes. | Failed run: Run page shows the error code; re-run. |
| 2:15 | Resolve (default tab) | Verdict line: "152 of 189 signals placed. 37 held out." Resolve groups the questions by cause, most urgent first. Open the P1 group: no rule-compliant slot. | Everything placed: skip to Cabinets. |
| 2:45 | Resolve, P1 card | Pick the cable, show **Move a cable into a free slot**. Where candidates exist, verify one; where none exist the screen names the blocking rule (STRICT-LOGIC) and offers **Waive**. Then answer the P3 groups with their recommended action. "Each option says whether it changes the allocation or only records a decision." | No candidate and no waive wanted: use "Revise the rule" wording and move on. |
| 3:30 | Re-run, Cabinets | **Re-run now**, results reopen. Click a cabinet tray, then a CIOC, then a CHARM: tag, cable, CHARM type, terminal block. Red dots are open questions. Toggle "Open questions". | Cabinet view is a schematic; say so. |
| 4:15 | Reports | **Allocation report**, then **TQ report**: print preview, "Download .xlsx". | Print dialog blocked: use the xlsx. |
| 4:40 | Change impact | Describe it: replace the signal list, see "n% stayed in place" and the revision report. Only if a revision chain exists. | No chain: describe, do not click. |
| 5:00 | Close | Allocation, triage and resolution, reports. | |

## Facts to have ready

- Sample plant, default rules: all 189 placed, two low-priority groups (area numbers, spares).
- Sample plant, Strict preset: 152 placed, 37 held out, one P1 group.
- AI never places a signal. It only drafts rule previews and wording; a person confirms.
- Reports: `Allocation report` and `TQ report` on Results, `Open report` on Change impact.

## Known limits (say them first if asked)

- The cabinet view is schematic, not true geometry; the teammate's 3D model plugs in through `webapp/docs/plant-contract.md`.
- Relay terminal block part and CIOCs per controller are not confirmed against Emerson.
- Moving a cable applies on the next run; it is checked against every hard rule when the run executes.
