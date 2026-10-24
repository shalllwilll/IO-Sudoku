# Pipeline

A run executes six stages in order. Each stage hashes its inputs; if a rerun finds the same hash
the stage is reused (`stages_reused` in the run summary), so answering a TQ only redoes what it
touches.

| Stage | Input | Output |
|---|---|---|
| `ingest` | uploaded workbooks | raw signal rows; deleted and out-of-scope rows are counted and set aside |
| `map` | rows + column mapping | canonical fields; unmatched required columns raise `TQ-MAP` |
| `normalise` | canonical rows + value maps | canonical IO type, duty class, segregation family; unknown values raise `TQ-VALUE`, bad data `TQ-DATA` |
| `hardware` | normalised signals | the hardware (CHARM type) each signal needs; no part number raises `TQ-HW` |
| `layout` | signals + capacity pack | cable blocks, groups, cabinet/CIOC/baseplate skeleton, spare and alarm reserve |
| `pack` | blocks + layout + rules | placements by the solver chain, validation, report and workbook |

Notes:

- Multi-file projects are merged after `ingest`; duplicate tag/cable pairs are reported.
- The mapping and value maps are per project and are saved, so a re-upload reuses them.
- A signal that cannot be placed or has unusable data is *held out* and reported as a TQ; the
  run summary's `unaccounted` list must always be empty (every input row is either placed or
  held out with a reason).
- Revision runs are normal runs with `revision: true`: signals are matched to the baseline
  issue, unchanged signals are pinned to their slot, the rest are solved around them, and the
  result carries an impact summary and a diff (also written to the workbook).
