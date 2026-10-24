// Hand-written revision chain for the mock, in the backend's shapes (ChainEntry, Comparison,
// ImpactOut — backend/docs/openapi.json). `naive_moved` on an impact is a mock-only convenience
// field: the real Impact model has no naive-reallocation figure, recorded in docs/contract-gaps.md.
// Slot strings use "cabinet/cioc/baseplate/channel", read by src/lib/moved.js.

const at = (offsetMinutes) => new Date(Date.now() - offsetMinutes * 60000).toISOString();

const tag = (n) => `MOCK-SIG-${String(n).padStart(4, "0")}`;

// Three deltas: one signal added, one removed, one moved — plus one that only gained a CHARM part
// (same slot both sides, so it is not a move; it still shows in "modified").
const DELTAS_00_TO_B = [
  { kind: "Added", tag: tag(190), cable: "CBL-99", pair: 1, old_slot: null, new_slot: "1/2/3/4", fields: [] },
  { kind: "Removed", tag: tag(55), cable: "CBL-10", pair: 2, old_slot: "2/7/1/9", new_slot: null, fields: [] },
  { kind: "Moved", tag: tag(12), cable: "CBL-3", pair: 1, old_slot: "1/1/1/6", new_slot: "1/3/2/1", fields: ["cioc", "baseplate", "channel"] },
  { kind: "Moved", tag: tag(44), cable: "CBL-8", pair: 3, old_slot: "2/5/4/2", new_slot: "2/6/4/2", fields: ["cioc"] },
  { kind: "Modified", tag: tag(88), cable: "CBL-15", pair: 1, old_slot: "3/9/1/3", new_slot: "3/9/1/3", fields: ["charm_part"] },
];

const DELTAS_B_TO_C = [
  { kind: "Added", tag: tag(191), cable: "CBL-100", pair: 1, old_slot: null, new_slot: "3/11/5/8", fields: [] },
  { kind: "Moved", tag: tag(12), cable: "CBL-3", pair: 1, old_slot: "1/3/2/1", new_slot: "1/3/2/5", fields: ["channel"] },
  { kind: "Moved", tag: tag(70), cable: "CBL-20", pair: 2, old_slot: "2/8/6/10", new_slot: "3/10/2/1", fields: ["cabinet", "cioc", "baseplate", "channel"] },
  { kind: "Modified", tag: tag(30), cable: "CBL-6", pair: 1, old_slot: "1/4/3/7", new_slot: "1/4/3/7", fields: ["terminal_block_part"] },
];

function comparisonOf(fromLabel, toLabel, deltas) {
  const counts = { added: 0, removed: 0, moved: 0, modified: 0, unchanged: 189 };
  for (const d of deltas) {
    if (d.kind === "Added") counts.added += 1;
    else if (d.kind === "Removed") counts.removed += 1;
    else if (d.kind === "Moved") counts.moved += 1;
    else if (d.kind === "Modified") counts.modified += 1;
  }
  counts.unchanged = Math.max(0, 189 - counts.added - counts.removed - counts.moved - counts.modified);
  // Mock-only: see the file header. Naive (re-allocating from scratch, ignoring the baseline) is
  // never lower than the stable count — that is the whole point of a revision-aware solver.
  const naiveMoved = counts.moved + counts.added + 7;
  return { from_label: fromLabel, to_label: toLabel, ...counts, naive_moved: naiveMoved, deltas };
}

function impactOf(label, baselineLabel, comparison) {
  return {
    label,
    baseline_label: baselineLabel,
    added: comparison.added,
    removed: comparison.removed,
    modified: comparison.modified,
    moved: comparison.moved,
    unchanged: comparison.unchanged,
    naive_moved: comparison.naive_moved,
    total_baseline: 189,
    total_revised: 189 + comparison.added - comparison.removed,
    solver: "greedy",
    moves_by_reason: { segregation: Math.ceil(comparison.moved / 2), capacity: Math.floor(comparison.moved / 2) },
  };
}

const COMPARISONS = {
  "00:B": comparisonOf("00", "B", DELTAS_00_TO_B),
  "B:C": comparisonOf("B", "C", DELTAS_B_TO_C),
};
COMPARISONS["00:C"] = comparisonOf("00", "C", [...DELTAS_00_TO_B, ...DELTAS_B_TO_C]);

/** A fresh, deterministic chain: just the baseline. Call `addRevision` to extend it. */
export function baselineChain(runId) {
  return [{ seq: 1, label: "00", parent_label: null, run_id: runId, created_at: at(120), impact: null }];
}

/** Appends the next hand-written revision step. Only "B" then "C" are defined; anything further repeats "C"'s shape under a new label. */
export function addRevision(chain, runId, label) {
  const parent = chain[chain.length - 1];
  const key = `${parent.label}:${label}`;
  const comparison = COMPARISONS[key] ?? COMPARISONS["B:C"];
  const entry = {
    seq: chain.length + 1,
    label,
    parent_label: parent.label,
    run_id: runId,
    created_at: at(120 - chain.length * 20),
    impact: impactOf(label, parent.label, comparison),
  };
  return [...chain, entry];
}

export function comparisonBetween(chain, fromLabel, toLabel) {
  const key = `${fromLabel}:${toLabel}`;
  if (COMPARISONS[key]) return COMPARISONS[key];
  // Any other pair in this short demo chain: concatenate the known steps between them.
  const labels = chain.map((c) => c.label);
  const i = labels.indexOf(fromLabel);
  const j = labels.indexOf(toLabel);
  if (i < 0 || j < 0 || i >= j) return null;
  const deltas = [];
  for (let k = i; k < j; k++) {
    const step = COMPARISONS[`${labels[k]}:${labels[k + 1]}`];
    if (step) deltas.push(...step.deltas);
  }
  return comparisonOf(fromLabel, toLabel, deltas);
}
