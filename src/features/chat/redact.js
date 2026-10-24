// Allow-list redaction. Only named summary fields pass: counts and column names / codes.
// Cell values, tags, free text and file contents never leave the browser.
const NUMERIC = ["files", "rows", "columns", "mapped", "rules", "rulesEnabled", "cabinets", "ciocs", "signalsTotal", "allocated", "tqCount", "unplaced"];
const LISTS = ["columnNames", "tqCodes", "tqCategories", "ruleNames"];

export const ALLOWED_FIELDS = [...NUMERIC, ...LISTS];

export function redact(context = {}) {
  const out = {};
  for (const key of NUMERIC) {
    if (Number.isFinite(context[key])) out[key] = context[key];
  }
  for (const key of LISTS) {
    if (Array.isArray(context[key])) {
      out[key] = context[key]
        .filter((item) => typeof item === "string" && item.length <= 60)
        .slice(0, 200);
    }
  }
  return out;
}

/** The "Answered from" line: which summary fields the model was given. */
export function sourceLine(redacted) {
  const keys = Object.keys(redacted);
  return keys.length ? `Answered from: ${keys.join(", ")}` : "Answered from: general product help";
}
