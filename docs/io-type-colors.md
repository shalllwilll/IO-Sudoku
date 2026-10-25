# CHARM I/O colors and validation meaning

Slot bodies use the uploaded signal's I/O type. The same definitions drive the legend, hover cards, record list, inspector, fallback table, and signal-path color.

| Code | Full name | Color | Explicit source aliases |
|---|---|---|---|
| AI | Analog Input | `#1976D2` | AI, AIR |
| AO | Analog Output | `#8E24AA` | AO, AOR |
| DI | Digital Input | `#43A047` | DI, DIR |
| DO | Digital Output | `#FB8C00` | DO, DOR |
| Spare / unused | Unused, reserved spare, or wired spare | `#78818D` | Explicit source position/tag kind. |
| Unknown I/O Type | Missing or unsupported type | `#78818D` | No prefix, description, electrical-signal, or CHARM-part-number inference. |

The R-suffixed aliases are existing application values. Original source values remain in cards/details. Conflicting source types use neutral gray and expose every underlying record. The viewer does not choose one arbitrarily.

Slot materials preserve the configured sRGB color. Selection does not whiten the body. TQs use red outlines, other warnings amber, and selection/reveal white. The two global filters combine across all cabinets: matching signals retain full color, nonmatches and associated labels dim but remain visible, and spares remain neutral. Playback initially dims unrevealed occupied positions and restores each actual I/O color in hardware order, without changing records or validation.

## Allocated versus validated

**Allocated** means a source record has a complete mapped hardware address. It does not establish engineering validity. The visible **Validation checks** section reports local checks and findings.

Run locally:

- Workbook/CSV reading and explicit column mapping, or mock-run response normalization.
- Complete hardware references and positive integer channels.
- Duplicate physical assignments and ambiguous duplicate tags.
- Explicit I/O classification, including unknown values and spare kinds.

Not run by this viewer:

- CHARM/electrical compatibility checks.
- Engineering capacity, cable, segregation, and allocation-rule validation.
- An authoritative application/backend engineering validation run.

Current imports have `applicationValidation = not_run`. A source cell saying `validated`, an `ALLOCATED_VALID` scenario, or a `GREEN — Allocated` hint cannot mark an assignment application-validated. Those values remain source reports/hints. Red/amber visualization hints are labelled illustrative source information: they add indicators without recoloring the I/O body or claiming an application engineering verdict.

## Supplied workbook verification

The local fixture is `IO_Signal_Sudoku_Synthetic_3D_Demo_IO_Colored.xlsx` in Downloads. Import prefers `IO Assignment` by recognized data columns instead of reading the first legend sheet as allocation data.

The worksheet has 1,152 position rows: 260 AI (including 83 AIR), 124 AO, 169 DI, 155 DO, and 444 spare/unused rows. Every active row's I/O-cell fill matches its configured color. The workbook is not committed.

Unit coverage compares all 708 active rows against their actual source-cell fills and checks neutral unknown/missing/spare definitions and zero application-validated signals for source-only assertions. Chromium imports this workbook, checks complete hover cards, and checks corresponding pixels in rendered WebGL screenshots for all four types, including a purple AO body under a separate red source-error outline. The four-cabinet CSV test additionally checks real TQs, combined global filtering, and pixel dimming without recoloring.

Set `IO_COLOR_WORKBOOK` to another local fixture path if needed. External workbook tests skip only when the file is absent; synthetic CSV tests still cover unsupported/spare/status behavior.

Implementation: `ioTypes.js` (classification and colors), `IoPresentation.jsx` (cards/badges/checks), `ExplorerScene.jsx` (bodies and instanced indicators), `model.js` (identity/status separation), `allocationPlayback.js` (global filters/reveal), and `workbook.js`/`directWorkbook.js` (automatic data-sheet selection and mapping), all in `src/features/explorer/`.
