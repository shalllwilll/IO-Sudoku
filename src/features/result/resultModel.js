// Indexes layout, allocation and TQs once so the grid can look positions up in O(1).
// Names (cabinet, CIOC, baseplate) always come from the data, never built in the UI.
// A TQ has no position of its own: its signal_keys ("file:row") are matched to the source file and
// row of the placed signals.
import { ioTypeOf, PLACEMENT_KIND, signalKey } from "../../api/live/wire.js";

export const CHANNELS = 12;
export const posKey = (cioc, bp, ch) => `${cioc}:${bp}:${ch}`;

export function buildModel(layoutOut, allocation, tqs = []) {
  const layout = layoutOut.layout;
  const placements = [...allocation.placements].sort(
    (a, b) => a.cioc_no - b.cioc_no || a.baseplate - b.baseplate || a.channel - b.channel,
  );
  const order = new Map(placements.map((p, i) => [posKey(p.cioc_no, p.baseplate, p.channel), i]));
  const byPosition = new Map(placements.map((p) => [posKey(p.cioc_no, p.baseplate, p.channel), p]));
  const usedBaseplates = new Set(placements.map((p) => `${p.cioc_no}:${p.baseplate}`));
  const cioc = new Map(layout.ciocs.map((c) => [c.no, c]));

  const byKey = new Map();
  for (const p of placements) if (p.signal) byKey.set(signalKey(p.signal.source_file, p.signal.source_row), p);
  const openTqKeys = new Set();
  for (const tq of tqs) {
    if (tq.status === "answered") continue;
    for (const key of tq.signal_keys ?? []) openTqKeys.add(key);
  }

  const perCabinet = layout.cabinets.map((cab) => {
    const own = placements.filter((p) => cab.ciocs.includes(p.cioc_no));
    const positions = cab.ciocs.reduce((n, no) => n + (cioc.get(no)?.baseplates.length ?? 0) * CHANNELS, 0);
    return { ...cab, occupied: own.length, positions, fillPct: positions ? Math.round((own.length / positions) * 100) : 0 };
  });

  return { layout, placements, order, byPosition, usedBaseplates, cioc, byKey, openTqKeys, perCabinet, signalCount: placements.filter((p) => p.kind !== PLACEMENT_KIND.wiredSpare).length };
}

/** Finds the placement for a TQ via its signal keys. Returns the first match or null. */
export function locateTq(model, tq) {
  for (const key of tq.signal_keys ?? []) {
    const hit = model.byKey.get(key);
    if (hit) return hit;
  }
  return null;
}

export const cabinetOf = (model, ciocNo) => model.cioc.get(ciocNo)?.cabinet ?? null;

const isTq = (model, p) => Boolean(p.signal) && model.openTqKeys.has(signalKey(p.signal.source_file, p.signal.source_row));

/** Counts for a group of positions. Filters: ciocs (list of numbers), baseplate (number, optional). */
export function aggregate(model, { ciocs, baseplate = null }) {
  const own = model.placements.filter((p) => ciocs.includes(p.cioc_no) && (baseplate === null || p.baseplate === baseplate));
  const usedBp = [...model.usedBaseplates].filter((k) => {
    const [c, b] = k.split(":").map(Number);
    return ciocs.includes(c) && (baseplate === null || b === baseplate);
  }).length;
  const signals = own.filter((p) => p.kind !== PLACEMENT_KIND.wiredSpare);
  const wired = own.length - signals.length;
  return {
    signals: signals.length,
    inputs: signals.filter((p) => /^(AI|DI)/.test(String(ioTypeOf(p) ?? "").toUpperCase())).length,
    outputs: signals.filter((p) => /^(AO|DO)/.test(String(ioTypeOf(p) ?? "").toUpperCase())).length,
    spares: wired + usedBp * CHANNELS - own.length,
    tqs: own.filter((p) => isTq(model, p)).length,
  };
}

export { isTq };
