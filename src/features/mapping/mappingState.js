// Pure helpers for the column mapping screen. The canonical field list lives here only,
// so the engine's schema can replace it without touching the table.
export const IGNORE = "";
export const REQUIRED_FIELDS = ["tag", "io_type", "cable", "pair"];

export const FIELD_LABELS = {
  tag: "Tag",
  io_type: "IO type",
  cable: "Cable",
  pair: "Pair",
  area: "Area",
  service: "Service",
  group: "Group",
  segregation: "Segregation",
  grouping: "Grouping (combined)",
  description: "Description",
  signal_type: "Signal type",
};

/** Scores may arrive as 0..1 or 0..100. Returns 0..100. */
export function percent(confidence) {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(confidence <= 1 ? confidence * 100 : confidence);
}

export function confidenceLevel(confidence) {
  const value = percent(confidence);
  if (value >= 90) return "High";
  if (value >= 75) return "Medium";
  return "Low";
}

export function columnLabel(name, index) {
  return name && String(name).trim() ? String(name) : `(blank column ${index + 1})`;
}

/**
 * Builds { column: field|"" } for one sheet. Saved choices win over automatic matches.
 * `saved` is the project's confirmed map for this file.
 */
export function initialAssignments(sheet, saved = {}) {
  const out = {};
  sheet.columns.forEach((column, index) => {
    const key = String(index);
    if (Object.prototype.hasOwnProperty.call(saved, key)) out[key] = saved[key] ?? IGNORE;
    else out[key] = sheet.matches?.[column]?.field ?? IGNORE;
  });
  return out;
}

/** Counts how many columns use each field. */
export function fieldUsage(assignments) {
  const usage = {};
  for (const field of Object.values(assignments)) {
    if (field) usage[field] = (usage[field] || 0) + 1;
  }
  return usage;
}

/** Returns { missing: [fields], duplicates: [fields] }. Valid when both are empty. */
export function validateAssignments(assignments, required = REQUIRED_FIELDS) {
  const usage = fieldUsage(assignments);
  return {
    missing: required.filter((field) => !usage[field]),
    duplicates: Object.keys(usage).filter((field) => usage[field] > 1),
  };
}

export const isValid = (result) => result.missing.length === 0 && result.duplicates.length === 0;
