// Where a TQ belongs in the scene.
//
// The playbook's order is tag, then cable and pair, then cable, then none. The backend's real TQ
// points at a signal with `signal_keys` ("<source file>:<source row>") and may name a tag or cable
// in `data`, so the key is tried first and the playbook's order follows it. A tag, pair or key
// match is a single CHARM, so the camera goes to level 6; a cable-only match is spread over a
// cabinet, so it goes to level 3 (docs/scene-data.md records this).
import { normaliseTag } from "../lib/tagKey.js";

export const MAX_MARKERS = 50;

/** Returns { ref, level, how } or null. `how` says which lookup matched, for the "why" in the UI. */
export function locate(scene, tq) {
  for (const key of tq?.signal_keys ?? []) {
    const ref = scene.keyIndex.get(key);
    if (ref) return { ref, level: 6, how: "signal" };
  }

  const tag = tq?.data?.tag ?? tq?.tag ?? null;
  if (tag) {
    const ref = scene.tagIndex.get(normaliseTag(String(tag)));
    if (ref) return { ref, level: 6, how: "tag" };
  }

  const cable = tq?.data?.cable ?? tq?.cable ?? null;
  const pair = tq?.data?.pair ?? tq?.pair ?? null;
  if (cable) {
    const key = normaliseTag(String(cable));
    if (pair !== null && pair !== undefined && pair !== "") {
      const ref = scene.pairIndex.get(`${key}|${pair}`);
      if (ref) return { ref, level: 6, how: "cable and pair" };
    }
    const refs = scene.cableIndex.get(String(cable)) ?? scene.cableIndex.get(key);
    if (refs?.length) return { ref: refs[0], level: 3, how: "cable" };
  }
  return null;
}

/**
 * Markers for the open TQs, newest first, one per TQ id. Beyond MAX_MARKERS the rest are only
 * counted, so a run with hundreds of TQs stays readable and cheap to draw.
 */
export function markersFor(scene, tqs = []) {
  const seen = new Set();
  const markers = [];
  let unplaced = 0;
  for (const tq of tqs) {
    if (!tq?.id || seen.has(tq.id) || tq.status === "answered") continue;
    seen.add(tq.id);
    const hit = locate(scene, tq);
    if (!hit) {
      unplaced += 1;
      continue;
    }
    markers.push({ id: tq.id, code: tq.code, severity: tq.severity, line: tq.message, ...hit });
  }
  return { markers: markers.slice(0, MAX_MARKERS), hidden: Math.max(0, markers.length - MAX_MARKERS), unplaced };
}

/** The ancestors a marker should also dot, so it stays visible when the camera pulls back. */
export const ancestors = ({ cabinet, cioc, baseplate }) => ({ cabinet, cioc, baseplate });
