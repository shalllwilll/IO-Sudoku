// Which grid positions a set of tags lands on, for the "Show on grid" link from a compare row.
import { normaliseTag } from "../../lib/tagKey.js";

/** `model` is resultModel.js's buildModel() output; `tags` a list of signal tags. */
export function highlightKeysFor(model, tags) {
  const wanted = new Set(tags.filter(Boolean).map((t) => normaliseTag(t)));
  const keys = new Set();
  if (wanted.size === 0) return keys;
  for (const p of model.placements) {
    if (p.signal?.tag && wanted.has(normaliseTag(p.signal.tag))) keys.add(`${p.cioc_no}:${p.baseplate}:${p.channel}`);
  }
  return keys;
}
