# Where the 3D scene gets its data

## The one deliberate deviation from the playbook

Milestone 6.1 asks for `scripts/build-scene.mjs`: a build-time script that reads the sample
allocation workbook with `exceljs` and writes `public/scene/scene.json`.

**That script was not written. The scene is built in the browser from the run's own API data**
(`src/scene/sceneModel.js`, from `GET /runs/{id}/layout`, `/allocation` and `/tqs`), because:

- The dataset workbooks must never be committed (MI-14), and neither may anything derived from
  them. A generator nobody can run without the workbook would be dead code in this repository.
- The same rule means `public/scene/scene.json` is git-ignored, so every machine would have to
  regenerate it from a file it does not have.
- Building from the API means the 3D view shows **the run the user just made**, not a fixture of a
  different allocation. The 2D grid and the 3D view read the same run, so they can never disagree.
- It removes a build step and a dev dependency (`exceljs`) from the demonstration path.

What is kept from 6.1: the counts and the classification. `buildScene` groups positions by cabinet,
CIOC, baseplate and channel, classifies each from the placement kind and IO type, marks a baseplate
as a cabinet spare when nothing is placed on it and as reserved when the layout says so, and builds
the tag, cable and cable-with-pair indexes the TQ lookup needs. The invariants below are asserted
in `src/scene/scene.test.js`, as 6.1 asked.

| Item | Value |
|---|---|
| Marshalling cabinets | 3 |
| CIOCs | 12 (4 per cabinet) |
| Baseplates | 96 (8 per CIOC) |
| Positions | 1,152 (12 per baseplate) |
| Field signals | 177 |
| Cabinet alarms | 12 (one per CIOC, on its reserved BP-8) |
| Wired spares | 22 |
| Spare positions | 941 |
| Signals | 189 (177 field plus 12 cabinet alarm) |

### The 189 against 190 reconciliation

The sample carries 190 signal rows and places 189. The remaining row is held out and appears in the
TQ list (`TQ-VALUE`, "IO type could not be read"), which is what the backend does with a row it
cannot classify: every signal is either placed or in the TQ list, and the Result page states both
numbers. The 3D view shows the 189 placed ones; the held-out row has no position, so its TQ is
counted in the stage's "no position in this scene" line rather than given a marker.

### Where the sample itself comes from

`src/api/mock/resultFixture.js` is hand-written to the split above. No value in it comes from the
dataset: tags read `MOCK-AIR-0001`, descriptions read `Sample signal 7`. Against a real backend the
same code draws the real run.

## Baseplate names repeat

`BP-1` exists in every CIOC, and the same cabinet baseplate names repeat across cabinets. Every
lookup therefore keys a baseplate by cabinet, CIOC **and** baseplate together
(`scene.cioc.get(no).baseplates`), never by name. A test asserts that the 96 keys are unique while
the names are not.

## TQ lookup order

The playbook's order is tag, then cable and pair, then cable, then none. The backend's TQ does not
carry an instrument block; it points at its signals with `signal_keys` (`"<source file>:<source
row>"`) and may name a tag or cable in `data`. The lookup therefore tries the signal key first and
then follows the playbook's order (`src/scene/lookup.js`):

1. `signal_keys` → that CHARM, camera to level 6.
2. `data.tag`, normalised (whitespace and hyphens removed, uppercased) → that CHARM, level 6.
3. `data.cable` with `data.pair` → that CHARM, level 6.
4. `data.cable` alone → the cabinet, level 3.
5. Nothing → no marker; the stage says how many TQs have no position.

A TQ raised live during a run arrives through the run store. Those events carry only
`{id, code, severity, category, message, signals}`, so they usually cannot be placed. That is a
contract gap, recorded in `docs/contract-gaps.md`, not a fault in the lookup.

## Other deviations worth knowing

- **No instancing.** 6.4 asks for instanced baseplates (96 of them). Only the CIOC in focus builds
  its 8 baseplates, and only the baseplate in focus builds its 12 positions, so the scene draws a
  few dozen objects rather than 96 instances plus 1,152 positions. Fewer draw calls than instancing
  would have cost, and it keeps per-position click and hover handlers simple.
- **Files consolidated.** `Breadcrumb.jsx`, `LadderDiagram.jsx` and `Legend3D.jsx` are one
  `Overlay.jsx`; `CharmRow.jsx` and `ChannelDetail.jsx` live in `Baseplate.jsx`; `MarshallingZone`
  is `SceneRoot` plus `Cabinet`; `normaliseTag.js` re-uses the existing `src/lib/tagKey.js`.
- **Level 7 is seen from the side.** Its subject (CHARM, terminal block, field wiring) runs back in
  depth, so a head-on camera would hide all of it behind the module facing the viewer.
- **Other cabinets are hidden from level 5 in.** Once the camera is inside one cabinet, the rest
  are clutter behind it.
- **CHARM and terminal-block part numbers read "unknown".** The backend resolves them in its
  hardware stage but does not put them on the allocation response; the tooltip reads them from
  `signal.extras` if they are ever added there.
- **No `--cabinets 4` flag** (MI-9). The cabinet count comes from the run's layout, so a four-cabinet
  run already draws four cabinets with no code or flag change.
