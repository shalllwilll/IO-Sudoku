# Interactive 3D Allocation Explorer

The `/plant` route now opens an engineer-controlled explorer. It replaces the timed presentation tour. Camera moves happen only after an explicit selection, fit, or parent-navigation action; orbit/pan input interrupts an in-progress focus transition. Signal animations never control the camera.

## Local workbook workflow

1. Open **3D plant view** from Projects, or **3D Allocation Explorer** from a result.
2. Choose **Upload Excel workbook** and select one `.xlsx`, `.xlsm`, or supported `.csv` file. The initial screen contains only the title, upload control, selected filename, and **Run**.
3. Choose **Run**. The existing parser selects the data sheet by recognized hardware columns and applies documented header aliases automatically. A previous exact-header mapping is reused when available. Missing required columns produce a single correction message; no mapping wizard or sample substitution is shown.
4. Watch a 6.5-second presentation: field arrival (0.6 seconds), actual occupied slots by cabinet/CIOC/baseplate/channel (5.2 seconds), then control-room arrival (0.7 seconds). Decorative SVG sides are non-interactive and do not represent individual workbook records. No assignments change.
5. Use the two global filters, **I/O Type** and **TQ Status**, after playback. Matching slots retain full I/O color; nonmatches and their labels dim but remain visible. Spares stay neutral. Filters combine across all cabinets regardless of selection. TQs retain a separate red outline. Details, Equipment, Issues, and Records open the existing inspector.
6. Use breadcrumbs or **Parent** to navigate outward; use **Fit scene / reset** to frame the overall layout.

No workbook is uploaded. ExcelJS runs in a local worker and is loaded only after import begins. Formulas are not executed or recalculated: cached formula results are used when present, otherwise the value is unavailable. Files are limited to 25 MB, worksheets to 100,000 rows and 500 columns. Legacy `.xls` and encrypted files require conversion to `.xlsx`. Very large compressed workbooks may still exhaust browser memory before the row limit can be evaluated.

CSV files must use UTF-8 encoding; invalid byte sequences produce an error instead of silently corrupting identifiers.

Local data is kept in memory for navigation within the tab. Refreshing or signing out discards it. Selecting another file cancels outstanding parsing and playback; **Run** replaces the dataset only on successful parsing. Failed imports leave the active dataset intact. A successful new import clears stale selection and frames the new dataset once. Duplicate concurrent Runs are prevented. Playback completion and filter changes never move the camera. Reduced-motion and no-WebGL modes skip playback and immediately enable inspection.

## Data and status rules

- Hardware identity is scoped by cabinet, CIOC, baseplate, and channel. Repeated baseplate names or display tags are not unique keys.
- Each source record retains filename, worksheet, row number, and original column values.
- Conflicting assignments retain every source record and mark the shared position as an import conflict. Nothing is reassigned.
- Missing hardware or a nonpositive/noninteger channel produces an unplaced record. The viewer does not invent hardware assignments or infer plant capacity from absent rows.
- Explicit spare-slot and wired-spare rows remain spares, even though they have no active field signal.
- A tag does not imply successful validation. Imported validation values remain source assertions; only passed application engineering checks could mark a record application-validated. This viewer does not perform that engineering validation run.
- Unknown validation values remain unverified and produce an informational import diagnostic.
- TQs retain their supplied severity/status. Blocking TQs indicate unresolved information; they do not automatically become confirmed engineering failures. Answered/resolved TQs remain inspectable without changing a position's current status.
- Diagnostics for duplicate locations, ambiguous tags, or missing references are labelled **Import diagnostic**. They do not independently recreate the allocation engine's engineering rules.

The sample allocation worksheet has no authoritative validation-status column. Its records are allocated where hardware is assigned, with application engineering validation not run. Raw MDB input with no hardware assignments stays unplaced. Synthetic visualization hints are never application validation.

The compact summary reports source records, positions and spares; the data bar reports matching active signals and cabinets. Full record, issue and validation details remain in the inspector. Active signals include field signals and cabinet alarms; wired/reserved spares and unused slots are excluded. A conflict can affect multiple source records but occupies one unique hardware position. Multiple messages never increase the active-signal count. TQ Raised means an associated source TQ exists, including answered history; source status remains visible separately. Generic source-error hints are not fabricated TQs.

## Rendering and interaction

- Geometry is a schematic display configuration defined in `geometry.js`, not a surveyed plant model. Cabinet counts, hierarchy, labels, and occupancy come from the dataset. Numeric slot ordering is for inspection and does not certify dimensions or hardware compatibility.
- Cabinets have solid back/side frames and open fronts. Hardware and channel bodies use instanced meshes and shared geometry/materials.
- Up to 4,096 positions are visible throughout the overview and presentation. Above that, detailed positions use existing hardware LOD, retaining the active presentation cabinet and selected records. Source records remain available in the table.
- Slot colors/type names use `IO_TYPES` in `ioTypes.js`: AI blue, AO purple, DI green, DO orange, neutral spare/unknown. Allocation and validation messages are separate. Error/warning/TQ outlines never replace I/O colors. See [io-type-colors.md](io-type-colors.md) for mappings and checks.
- Left drag orbits, right drag pans, and the wheel zooms. `F` fits the selection, `Home` frames the scene, and `Escape` selects the parent when focus is outside form controls.
- Labels fade with distance while the selected object's label, outline, breadcrumbs, and details remain available.
- The sequential reveal uses a separate cancellable animation timeline, batched instanced color updates, and temporary white outlines. React receives progress snapshots at most every 100 milliseconds plus stage transitions. The camera is independent and remains manually controllable during playback.
- Left field and right controller diagrams explain the flow schematically. Their cable-pair labels are illustrative, not new allocation records. Both have pointer events disabled and no camera controls.
- Unplaced/global issues are listed without navigating to unrelated equipment. Issues affecting multiple positions fit all resolved locations and expose each related source record.
- The paginated record table, equipment tree, and details remain usable without WebGL. Rendering errors are isolated from the rest of the application. Only the two global filter dropdowns are exposed, including in the issue inspector.

## Existing allocation runs

Completed mock runs can still be opened explicitly through a result link. The initial screen has no dataset/run selector. Result links use the existing adapter's layout, allocation, report, and TQ functions. TQs are joined by source file/row identity. Global report violations without per-record references stay unlocated. The existing run layout uses the application's explicit 12-channel preset to represent empty positions.

Live backend integration remains disabled for this feature as requested. No endpoint, backend branch, allocation algorithm, or source workbook was changed. The separate 2D result, reporting, revision, and download workflows remain available.

## Checks

Use `npm run check` and `npm run e2e -- --workers=1`. Optional tests load the supplied allocation workbook from `../dataset` when present; no workbooks, real tags, or generated scene exports are included in Git.

Tests cover automatic import, a separate four-cabinet fixture, sequential slot playback, cancellation, global combined filters, manual camera controls, exact rendered I/O colors, error navigation, accessibility and fallback. The supplied local workbooks contain three cabinet identifiers: these are preserved exactly, rather than inventing a fourth. Live backend integration remains excluded.

Verification for the simplified workflow: lint passes, all 192 unit tests pass, production build succeeds, and all 19 Chromium end-to-end tests pass. The build retains the documented 3D/parser chunk-size warning. No changes were committed or pushed.

For a local normalization/geometry/filter/memory profile:

```powershell
node --expose-gc scripts/profile-explorer.mjs "../dataset/Sample_IO_Allocation_VIT_v2 1.xlsx"
```

The benchmark prints counts/timings only. It does not establish browser GPU memory behavior or certify a hardware-independent frame rate. See `performance.md` for measured results and limits.

## Implementation map

| Files | Responsibility |
|---|---|
| `src/pages/PlantStage.jsx`, `features/explorer/AllocationExplorer.jsx` | Route replacement, dataset lifecycle, selection, camera actions, and workflow controls. |
| `features/explorer/workbook.js`, `workbook.worker.js`, `directWorkbook.js` | Existing local workbook/CSV parsing and automatic mapping with concise errors. |
| `features/explorer/allocationPlayback.js`, `useAllocationPlayback.js`, `FlowDiagram.jsx` | Cancellable reveal timeline, global filter rules and decorative signal flow. |
| `features/explorer/model.js`, `store.js` | Normalized hardware/records/issues, conflicts, statuses, filters, optional mock runs, and memory-only retention. |
| `features/explorer/ExplorerScene.jsx`, `geometry.js`, `EquipmentContext.jsx` | Instanced scene, schematic layout, contextual equipment, interruptible camera focus, and optional signal paths. |
| `features/explorer/Panels.jsx`, `explorer.css` | Hardware browser, record/issue lists, source details, status cues, and responsive layout. |
| `src/pages/Projects.jsx`, `Result.jsx`, `src/auth/session.js` | Entry links and clearing local workbook data on sign-out. |
| `vite.config.js`, `package.json`, lockfile | ES worker output and the existing ExcelJS dependency used by the importer. |
| `features/explorer/explorer.test.js`, `e2e/explorer.spec.js`, existing route tests, `scripts/profile-explorer.mjs` | Data integrity, actual workbook coverage, interactive/browser checks, and local profiling. |

## Readable names and TQ guidance

Labels are presentation metadata, built from each loaded dataset by `displayNames.js` and `tqGuidance.js`. Source identifiers are never replaced: the tag, cabinet, controller, CIOC, baseplate and CHARM values stay in the data model, the inspector, the hover card and exports, and a label is rebuilt on every import, so nothing carries over from a previous workbook.

- **Cabinets:** an identifier shaped like `P30-DCM-32001-04` is shown as `Unit 320 — Cabinet 04`, with the exact identifier beneath it. Any other shape keeps its own text. The cabinet count comes from the loaded rows.
- **Operating areas:** `OA-11` is shown as `Process Area 11`, with the code kept beside it. No industry is inferred.
- **Signals:** the display name comes from the row's own service description, with a function phrase added only when the description names the instrument (for example a pressure transmitter). It is not added otherwise. Spare, reserved and unused positions show their status, not a name.
- **Hover card:** display name, tag, I/O type, equipment, service, area and unit, cabinet to CHARM location, cable and pair, allocation status and any TQ.
- **TQs:** each card shows the supplied ID, message and status, the affected signal and position, why that kind of issue matters, the check needed, and a proposed resolution labelled as a proposal. A status comes from the data: a `TQ Status` column, or a TQ register sheet matched by TQ ID and tag. Otherwise it reads "Status not supplied". Nothing is shown as resolved without a resolved status. Rows from a synthetic workbook are marked as demonstration cases.
- **Side structures:** the field-side and control-room drawings either side of the cabinets are decorative. They take no pointer input and stand for no workbook record.
