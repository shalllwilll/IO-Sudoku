// Rule parameter schema (MI-18 default: the primitives from the build plan).
// One file, so the confirmed backend specification replaces it without touching the cards.
export const SEPARATION_LEVELS = ["baseplate", "CIOC", "cabinet", "controller"];

export const PRIMITIVES = {
  co_locate: { label: "Keep together", params: { level: { type: "enum", options: SEPARATION_LEVELS, default: "CIOC" } } },
  separate: { label: "Keep apart", params: { level: { type: "enum", options: SEPARATION_LEVELS, default: "CIOC" } } },
  capacity: { label: "Capacity limit", params: { max: { type: "number", min: 0, max: 1000, default: 12 } } },
  reserve: { label: "Reserve spare", params: { percent: { type: "number", min: 0, max: 100, default: 10 } } },
  quota: { label: "Quota", params: { max: { type: "number", min: 0, max: 1000, default: 8 } } },
  order: { label: "Order", params: { by: { type: "text", default: "tag", maxLength: 40 } } },
  assign: { label: "Assign", params: { target: { type: "text", default: "", maxLength: 60 } } },
  pin: { label: "Pin", params: { slot: { type: "text", default: "", maxLength: 60 } } },
  limit_span: { label: "Limit span", params: { max: { type: "number", min: 1, max: 100, default: 2 } } },
};

export const isKnownPrimitive = (rule) => Boolean(rule?.primitive && PRIMITIVES[rule.primitive]);

/** Validates one parameter value. Returns an error message or "". */
export function validateParam(spec, value) {
  if (spec.type === "number") {
    const text = String(value ?? "").trim();
    const number = Number(text);
    if (text === "" || !Number.isFinite(number)) return "Enter a number.";
    if (number < spec.min || number > spec.max) return `Enter a number from ${spec.min} to ${spec.max}.`;
    return "";
  }
  if (spec.type === "enum") return spec.options.includes(value) ? "" : `Choose one of: ${spec.options.join(", ")}.`;
  if (spec.type === "text") return String(value ?? "").length <= (spec.maxLength ?? 100) ? "" : "Too long.";
  return "";
}

export function validateRule(rule) {
  const errors = {};
  if (!isKnownPrimitive(rule)) return { primitive: "Unknown rule type." };
  for (const [key, spec] of Object.entries(PRIMITIVES[rule.primitive].params)) {
    const message = validateParam(spec, rule.parameters?.[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

export function newRule(primitive) {
  const spec = PRIMITIVES[primitive];
  const parameters = Object.fromEntries(Object.entries(spec.params).map(([key, p]) => [key, p.default]));
  return {
    id: `custom-${primitive}-${Date.now().toString(36)}`,
    name: spec.label,
    enabled: true,
    primitive,
    builtin: null,
    scope: "everywhere",
    strength: "hard",
    parameters,
    not_enforced_reason: null,
  };
}

/** One-line description shown on the card. */
export function summarise(rule) {
  if (!isKnownPrimitive(rule)) return "Unknown rule type";
  const parts = Object.entries(rule.parameters ?? {}).map(([k, v]) => `${k}: ${v}`);
  return `${PRIMITIVES[rule.primitive].label}${parts.length ? ` (${parts.join(", ")})` : ""} · ${rule.scope}`;
}
