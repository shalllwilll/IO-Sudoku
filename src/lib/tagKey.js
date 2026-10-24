/** Removes all whitespace and hyphens and uppercases, so "320-FT   -20645-A" and "320FT20645A" match. */
export function normaliseTag(tag) {
  return String(tag ?? "")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}
