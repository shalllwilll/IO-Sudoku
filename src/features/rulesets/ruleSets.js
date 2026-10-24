// Saved rule sets: validation, import and export. Kept per project in sessionStorage
// (try/catch), never in localStorage. Pure helpers are separate from storage for testing.
import { z } from "zod";

export const SET_VERSION = 1;
export const MAX_IMPORT_BYTES = 1024 * 1024;
const FORBIDDEN = ["__proto__", "constructor", "prototype"];

const RuleShape = z
  .object({
    id: z.string().max(80),
    name: z.string().max(120),
    enabled: z.boolean(),
    primitive: z.string().max(40).nullable().optional(),
    builtin: z.string().max(80).nullable().optional(),
    scope: z.string().max(80),
    strength: z.string().max(40),
    parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    not_enforced_reason: z.string().nullable().optional(),
  })
  .strict();

export const RuleSetFile = z.object({ name: z.string(), version: z.number(), rules: z.array(RuleShape).max(200) }).strict();

export function validateSetName(name, existing = []) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Enter a name.";
  if (trimmed.length > 60) return "Use 60 characters or fewer.";
  if (existing.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return `"${trimmed}" already exists. Try "${trimmed} 2".`;
  return "";
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value && typeof value === "object") {
    return Object.keys(value).some((key) => FORBIDDEN.includes(key) || hasForbiddenKey(value[key]));
  }
  return false;
}

export function exportSet(name, rules) {
  return JSON.stringify({ name, version: SET_VERSION, rules }, null, 2);
}

/** Parses an imported file. Returns { ok: true, set } or { ok: false, error }. */
export function importSet(text) {
  if (typeof text !== "string" || text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: "The file is over the 1 MB limit." };
  }
  let data;
  try {
    // JSON.parse does not pollute prototypes; keys are also checked below.
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (hasForbiddenKey(data)) return { ok: false, error: "The file contains forbidden keys." };
  if (data && typeof data === "object" && data.version !== SET_VERSION) {
    return { ok: false, error: `Unsupported version. Supported: ${SET_VERSION}.` };
  }
  const parsed = RuleSetFile.safeParse(data);
  if (!parsed.success) return { ok: false, error: "The file does not match the rule set format." };
  const nameError = validateSetName(parsed.data.name);
  if (nameError && !/already exists/.test(nameError)) return { ok: false, error: nameError };
  return { ok: true, set: parsed.data };
}

const key = (projectId) => `iosudoku.rulesets.${projectId}`;

export function loadSets(projectId) {
  try {
    const raw = sessionStorage.getItem(key(projectId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function storeSets(projectId, sets) {
  try {
    sessionStorage.setItem(key(projectId), JSON.stringify(sets));
  } catch {
    /* memory only */
  }
}
