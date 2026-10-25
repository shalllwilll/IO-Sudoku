import type { UnknownValue, ValueMaps } from '@/api/queries'

/** The unknown-value `field` names the API reports, mapped to the override group and the `allowed` key. */
export const VALUE_GROUPS = {
  io_type: { group: 'io_types', allowed: 'io_type', label: 'I/O type' },
  duty: { group: 'duty_classes', allowed: 'duty_class', label: 'Duty class' },
  segregation: { group: 'segregation', allowed: 'segregation', label: 'Segregation' },
} as const
export type ValueField = keyof typeof VALUE_GROUPS
export const isValueField = (f: string): f is ValueField => f in VALUE_GROUPS

/** Overrides are keyed by the upper-cased raw value (the backend upper-cases on save). */
export const rawKey = (v: string) => v.trim().toUpperCase()

export function withChoice(maps: ValueMaps, field: ValueField, raw: string, canonical: string): ValueMaps {
  const group = VALUE_GROUPS[field].group
  const next = { ...(maps[group] ?? {}) }
  if (canonical) next[rawKey(raw)] = canonical
  else delete next[rawKey(raw)]
  return { ...maps, [group]: next }
}

export const choiceFor = (maps: ValueMaps, u: Pick<UnknownValue, 'field' | 'value'>): string =>
  isValueField(u.field) ? (maps[VALUE_GROUPS[u.field].group]?.[rawKey(u.value)] ?? '') : ''

/** Unknown values that still have no decision in the draft. */
export const undecided = (unknown: UnknownValue[], maps: ValueMaps) => unknown.filter((u) => isValueField(u.field) && !choiceFor(maps, u))
