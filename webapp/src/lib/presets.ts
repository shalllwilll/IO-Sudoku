/** Rule presets the backend accepts. The API has no preset listing outside a project, so they are named here. */
export const PRESETS = [
  { value: 'plant-default', label: 'Standard', hint: 'Safety rules are always kept. Grouping preferences are followed where possible.' },
  { value: 'strict', label: 'Strict', hint: 'Grouping preferences become firm rules. Fewer options, more questions for you.' },
] as const
export const DEFAULT_PRESET = PRESETS[0].value
