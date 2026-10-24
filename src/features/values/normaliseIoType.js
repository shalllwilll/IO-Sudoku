// IO type normalisation from the build plan: AI->AIR, AO->AOR, DI->DIR, DO->DOR.
// A composite such as DO-SOV splits into base type DOR and duty SOV.
const BASE = { AI: "AIR", AIR: "AIR", AO: "AOR", AOR: "AOR", DI: "DIR", DIR: "DIR", DO: "DOR", DOR: "DOR" };

export const BASE_TYPES = ["AIR", "AOR", "DIR", "DOR"];

/** Returns { base, duty } or { base: null, duty: null } when the value is unknown. */
export function normaliseIoType(raw) {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value || value.length > 32) return { base: null, duty: null };
  const [head, ...rest] = value.split("-");
  const base = BASE[head];
  if (!base) return { base: null, duty: null };
  return { base, duty: rest.length ? rest.join("-") : null };
}

/** AI and DI are inputs; AO and DO are outputs. A duty qualifier does not change direction. */
export function directionOf(base) {
  if (base === "AIR" || base === "DIR") return "input";
  if (base === "AOR" || base === "DOR") return "output";
  return null;
}
