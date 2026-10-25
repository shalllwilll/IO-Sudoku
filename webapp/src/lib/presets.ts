/** Rule presets the backend accepts. The API has no preset listing outside a project, so they are named here. */
export const PRESETS = [
  { value: 'plant-default', label: 'Plant default', hint: 'Balanced: hard safety rules, soft grouping preferences.' },
  { value: 'strict', label: 'Strict', hint: 'Promotes grouping preferences to hard rules. Fewer options, more questions.' },
] as const
export const DEFAULT_PRESET = PRESETS[0].value
