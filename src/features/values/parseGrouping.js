// Structured grouping rule: no user-typed regular expressions, so no invalid patterns or ReDoS.
export const DEFAULT_GROUPING_RULE = { prefixes: ["A", "B"], separator: "-", bareLettersAreGroups: true };

const MAX_LENGTH = 64;

/**
 * Parses one raw grouping value deterministically.
 * Returns { group, segregation, status } where status is "none", "parsed" or "unparsed".
 */
export function parseGrouping(raw, rule = DEFAULT_GROUPING_RULE) {
  const value = String(raw ?? "").trim().toUpperCase();
  const none = { group: null, segregation: null, status: "none" };
  if (value === "" || value === rule.separator) return none;
  if (value.length > MAX_LENGTH) return { group: null, segregation: null, status: "unparsed" };

  const prefixes = rule.prefixes.map((p) => p.toUpperCase());
  const sep = rule.separator;
  const at = sep ? value.indexOf(sep) : -1;

  if (at > 0) {
    const head = value.slice(0, at);
    const tail = value.slice(at + sep.length);
    if (prefixes.includes(head)) {
      return { group: tail || null, segregation: head, status: "parsed" };
    }
    return { group: value, segregation: null, status: "parsed" };
  }
  if (prefixes.includes(value)) return { group: null, segregation: value, status: "parsed" };
  if (rule.bareLettersAreGroups) return { group: value, segregation: null, status: "parsed" };
  return { group: null, segregation: null, status: "unparsed" };
}
