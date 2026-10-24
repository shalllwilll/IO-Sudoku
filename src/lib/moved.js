// Whether a signal's position changed between two allocations. A position is identified by
// cabinet, CIOC, baseplate and channel — a field-only change (a CHARM part, a description, a
// status) is not a move. Pure, so it is used by the mock, the compare view and a unit test alike.
//
// The backend's SignalDelta/DiffRow carry `old_slot`/`new_slot` strings whose exact format is not
// in the OpenAPI contract (recorded in docs/contract-gaps.md); this assumes the mock's own
// "cabinet/cioc/baseplate/channel" format and degrades to "unknown" rather than guessing wrong.

/** Parses a "cabinet/cioc/baseplate/channel" slot string into its parts, or null if it doesn't. */
export function parseSlot(slot) {
  if (typeof slot !== "string") return null;
  const parts = slot.split("/").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [cabinet, cioc, baseplate, channel] = parts;
  return { cabinet, cioc, baseplate, channel };
}

export const slotOf = ({ cabinet, cioc, baseplate, channel }) => `${cabinet}/${cioc}/${baseplate}/${channel}`;

const samePosition = (a, b) => a.cabinet === b.cabinet && a.cioc === b.cioc && a.baseplate === b.baseplate && a.channel === b.channel;

/** True when the position changed. One side missing (added or removed) counts as moved too. */
export function moved(before, after) {
  if (!before || !after) return Boolean(before) !== Boolean(after);
  return !samePosition(before, after);
}

/**
 * Classifies one delta row by its slot change alone: "added", "removed", "moved" or "stationary"
 * (present on both sides, same position — a CHARM-type or description change lands here, not
 * "moved"). `null` when neither slot parses.
 */
export function classify(delta) {
  const before = parseSlot(delta?.old_slot);
  const after = parseSlot(delta?.new_slot);
  if (!before && !after) return null;
  if (!before) return "added";
  if (!after) return "removed";
  return moved(before, after) ? "moved" : "stationary";
}

/** Counts added/removed/moved/stationary across a list of deltas. */
export function tally(deltas = []) {
  const counts = { added: 0, removed: 0, moved: 0, stationary: 0 };
  for (const d of deltas) {
    const kind = classify(d);
    if (kind) counts[kind] += 1;
  }
  return counts;
}
