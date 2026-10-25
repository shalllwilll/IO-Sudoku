export const PRIMITIVES = ['co_locate', 'separate', 'capacity', 'reserve', 'quota', 'order', 'assign', 'pin', 'limit_span'] as const
export type Primitive = (typeof PRIMITIVES)[number]
export type Strength = 'hard' | 'soft' | 'advisory'

export interface Rule {
  id: string
  name: string
  primitive: Primitive | null
  scope: string
  parameters: Record<string, unknown>
  enabled: boolean
  strength: Strength
  not_enforced_reason: string | null
  builtin: string | null
}

export const LEVELS = ['baseplate', 'cioc', 'cabinet'] as const

interface Param {
  key: string
  label: string
  kind: 'text' | 'number' | 'level'
  placeholder?: string
}

/** What each primitive asks for. Mirrors the backend's required parameters; the first alternative is offered for `assign`. */
export const PRIMITIVE_INFO: Record<Primitive, { label: string; blurb: string; params: Param[] }> = {
  co_locate: { label: 'Keep together', blurb: 'Signals sharing a field value stay in the same place.', params: [{ key: 'by', label: 'Group by field', kind: 'text', placeholder: 'loop_name' }, { key: 'level', label: 'Level', kind: 'level' }] },
  separate: { label: 'Keep apart', blurb: 'Two sets of signals never share a place.', params: [{ key: 'a', label: 'Set A', kind: 'text', placeholder: 'io_type = AIR' }, { key: 'b', label: 'Set B', kind: 'text', placeholder: 'io_type = DOR' }, { key: 'level', label: 'Level', kind: 'level' }] },
  capacity: { label: 'Capacity ceiling', blurb: 'At most N signals per place.', params: [{ key: 'per', label: 'Per', kind: 'level' }, { key: 'max', label: 'Maximum', kind: 'number' }] },
  reserve: { label: 'Reserve baseplate', blurb: 'Keep a baseplate free of the scoped signals.', params: [{ key: 'baseplate', label: 'Baseplate', kind: 'number' }] },
  quota: { label: 'Share limit', blurb: 'The scoped signals take at most a percentage of each place.', params: [{ key: 'per', label: 'Per', kind: 'level' }, { key: 'max_percent', label: 'Maximum %', kind: 'number' }] },
  order: { label: 'Order', blurb: 'Place signals in order of a field.', params: [{ key: 'by', label: 'Order by field', kind: 'text', placeholder: 'tag' }] },
  assign: { label: 'Assign to cabinet', blurb: 'Send the scoped signals to a cabinet.', params: [{ key: 'cabinet', label: 'Cabinet', kind: 'number' }] },
  pin: { label: 'Pin to slot', blurb: 'Fix a signal at an exact CIOC, baseplate and channel.', params: [{ key: 'cioc', label: 'CIOC', kind: 'number' }, { key: 'baseplate', label: 'Baseplate', kind: 'number' }, { key: 'channel', label: 'Channel', kind: 'number' }] },
  limit_span: { label: 'Limit span', blurb: 'A group spreads over at most N places.', params: [{ key: 'unit', label: 'Unit', kind: 'level' }, { key: 'max', label: 'Maximum', kind: 'number' }] },
}

export const STRENGTHS: { value: Strength; label: string; blurb: string }[] = [
  { value: 'hard', label: 'Hard', blurb: 'Never broken. A layout that breaks one is rejected.' },
  { value: 'soft', label: 'Soft', blurb: 'Followed where possible; a break is reported.' },
  { value: 'advisory', label: 'Advisory', blurb: 'Recorded and checked, never changes the layout.' },
]

export const asRules = (raw: Record<string, unknown>[]): Rule[] => raw as unknown as Rule[]

export function byStrength(rules: Rule[]): Record<Strength, Rule[]> {
  const out: Record<Strength, Rule[]> = { hard: [], soft: [], advisory: [] }
  for (const r of rules) out[r.strength].push(r)
  return out
}

/** One-line plain-language reading of a rule. */
export function describeRule(r: Rule): string {
  const p = r.parameters
  const where = r.scope ? ` for ${r.scope}` : ''
  if (r.builtin) return 'Always enforced by the validator.'
  if (!r.primitive) return r.not_enforced_reason ?? 'Recorded, not enforced.'
  switch (r.primitive) {
    case 'separate':
      return `${String(p.a)} and ${String(p.b)} never share a ${String(p.level ?? 'CIOC')}${where}`
    case 'capacity':
      return `At most ${String(p.max)} per ${String(p.per)}${where}`
    case 'co_locate':
      return `Same ${String(p.by)} stays together${p.level ? ` on a ${String(p.level)}` : ''}${where}`
    case 'quota':
      return `At most ${String(p.max_percent)}% per ${String(p.per)}${where}`
    case 'reserve':
      return `Baseplate ${String(p.baseplate)} kept free${where}`
    case 'pin':
      return `Fixed at CIOC ${String(p.cioc)}, baseplate ${String(p.baseplate)}, channel ${String(p.channel)}${where}`
    case 'assign':
      return `Assigned to ${Object.entries(p).map(([k, v]) => `${k} ${String(v)}`).join(', ')}${where}`
    case 'limit_span':
      return `Spans at most ${String(p.max)} per ${String(p.unit)}${where}`
    case 'order':
      return `Ordered by ${String(p.by)}${where}`
  }
}

/** A readable id that does not collide with an existing one. */
export function nextRuleId(rules: Pick<Rule, 'id'>[], primitive: Primitive): string {
  const prefix = `USR-${primitive.toUpperCase().replace(/_/g, '-')}`
  const used = new Set(rules.map((r) => r.id))
  for (let n = 1; ; n++) if (!used.has(`${prefix}-${n}`)) return `${prefix}-${n}`
}

/** Build a rule from editor input; blank parameters are dropped and numbers parsed. Returns an error text when incomplete. */
export function buildRule(
  input: { primitive: Primitive; name: string; scope: string; strength: Strength; values: Record<string, string> },
  existing: Pick<Rule, 'id'>[],
): { rule: Rule } | { error: string } {
  const info = PRIMITIVE_INFO[input.primitive]
  const parameters: Record<string, unknown> = {}
  for (const param of info.params) {
    const raw = (input.values[param.key] ?? '').trim()
    if (!raw) {
      if (param.key === 'level') continue
      return { error: `${param.label} is required.` }
    }
    if (param.kind === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) return { error: `${param.label} must be a number.` }
      parameters[param.key] = n
    } else parameters[param.key] = raw
  }
  if (!input.name.trim()) return { error: 'Give the rule a name.' }
  return {
    rule: {
      id: nextRuleId(existing, input.primitive),
      name: input.name.trim(),
      primitive: input.primitive,
      scope: input.scope.trim(),
      parameters,
      enabled: true,
      strength: input.strength,
      not_enforced_reason: null,
      builtin: null,
    },
  }
}
