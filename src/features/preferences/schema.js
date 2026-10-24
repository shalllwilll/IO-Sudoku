// Optional engineer preferences (MI-11 default list). Change only this file and the panel if the list changes.
export const PREFERENCE_FIELDS = {
  namingPreset: { label: "Naming preset", options: ["sample", "AR1"] },
  segregationLevel: { label: "Segregation level", options: ["baseplate", "CIOC", "cabinet", "controller"] },
  noGroupPolicy: { label: "No-group policy", options: ["pool", "fill", "TQ"] },
  spareRounding: { label: "Spare rounding", options: ["floor", "ceil"] },
  ciocLabelStyle: { label: "CIOC label style", options: ["group-seg", "plain"] },
};

export const DEFAULT_PREFERENCES = {
  namingPreset: "sample",
  segregationLevel: "CIOC",
  noGroupPolicy: "pool",
  sparePercent: "10",
  spareRounding: "ceil",
  ciocLabelStyle: "group-seg",
};

/** Returns { field: message } for invalid values. Empty object means valid. */
export function validatePreferences(values) {
  const errors = {};
  for (const [key, spec] of Object.entries(PREFERENCE_FIELDS)) {
    if (!spec.options.includes(values[key])) errors[key] = `Choose one of: ${spec.options.join(", ")}.`;
  }
  const raw = String(values.sparePercent ?? "").trim();
  const number = Number(raw);
  if (raw === "" || !Number.isFinite(number) || number < 0 || number > 50) {
    errors.sparePercent = "Enter a number from 0 to 50.";
  } else if (!/^\d+(\.\d)?$/.test(raw)) {
    errors.sparePercent = "Use at most one decimal place.";
  }
  return errors;
}

/** Only the values that differ from the defaults. Empty when nothing changed. */
export function changedPreferences(values, defaults = DEFAULT_PREFERENCES) {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => String(value) !== String(defaults[key])));
}
