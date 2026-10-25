# Design spec (frozen at design lock)

Anything here changes only by an explicit decision, not by drift while building.

## Principles
- Modern, calm, data-first. Every element answers a user task; nothing decorative or invented.
- Colour carries meaning. Kind and severity are also shown by shape, texture, icon or label.
- Honest: assumptions, AI-off and held-out signals are stated, never hidden.

## Tokens (`src/styles/index.css`, one set, dark default + light)
| Token | Dark | Light |
|---|---|---|
| `--bg` | oklch(.145 .006 250) | oklch(.985 .003 250) |
| `--surface-1/2/3` | .18 / .215 / .26 | 1 / .968 / .93 |
| `--border` | white 7% | black 8% |
| `--fg / muted / subtle` | .96 / .74 / .58 | .20 / .42 / .54 |
| `--accent` | oklch(.80 .125 195) teal | oklch(.55 .11 200) |
| status | success 155, warning 80, danger 25, info 250 | same hues, darker |
IO types (Okabe-Ito derived, colour-blind safe): AIR `#56b4e9`, AOR `#2ec4a0`, DIR `#e69f00`, DOR `#e8743b`, other `#cc79a7` (darker variants in light).

## Slot kinds (never colour alone)
Field = solid IO colour. Wired spare = IO-colour outline + centre dot. Spare slot = dashed neutral outline. Cabinet alarm = neutral fill with diagonal stripes. Reserved baseplate = hatched row. Unused = faint fill.

## Type and spacing
Inter Variable (UI, tabular figures via `.tnum`), JetBrains Mono (tags, cables, pairs, CHARM numbers). Self-hosted via fontsource, no CDN. 4px grid. Radii 6 / 10 / 14, concentric (outer = inner + padding). Elevation by layered shadow, structure by 1px hairline borders.

## Motion (better-ui values)
Press: scale .96, 150ms ease-out, never when disabled. Infrequent entrances: 100ms stagger, 300ms ease-out, 12px rise, 4px blur. Exits: 150ms, -12px. Row hover, tab switch, sort: no animation (opacity/background <=150ms). Icon swap: scale .25 to 1, blur 4 to 0, spring duration .3 bounce 0. Transitions name their properties, never `all`. Theme switch suppresses transitions for one frame. `MotionConfig reducedMotion="user"` plus opacity-only fallback. Hover styles only on hover-capable pointers.

## Layout
Left sidebar 232px (Projects, TQ inbox, Settings, current project). Top bar: breadcrumbs, step rail, AI status, theme, user. Results: tab bar, content, 320px inspector (bottom sheet below 1280px). Desktop-first, tablet-safe; phones get read-only fallback.

## Screens
Login, Projects, project workspace (Data, Map, Values, Rules, Run), Results (Overview, Allocation, Layout, TQs, Downloads), TQ inbox, Revisions, AI assistant panel, 3D placeholder, Settings. Hero screens implemented in this lock: Login, Run, Layout, 3D placeholder (synthetic data in `src/preview`, removed as real screens land).

## Backend facts the UI respects
- Events replay after the pipeline finishes: the Run screen paces them and says so.
- Cosmetic sign-in only; the backend has no authentication.
- Read hierarchy counts from `/layout`; 4 / 8 / 12 are confirmed, CIOCs per controller is not.
