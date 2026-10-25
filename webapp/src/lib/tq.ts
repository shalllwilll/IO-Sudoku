import type { Schemas } from '@/api/client'

export type TQ = Schemas['TQ']
export type Scope = 'row' | 'cable' | 'everywhere'
export type Effect = 'note' | 'map_confirm' | 'map_pick' | 'value' | 'segregation' | 'hardware' | 'capacity' | 'naming' | 'rule_revise' | 'rule_waive' | 'revision'

/**
 * What each option of each TQ code does, in the order the backend offers them (backend/app/core/tq/answers.py EFFECT).
 * The UI uses it to ask only for the inputs that option needs; the backend still validates every answer.
 */
const EFFECT: Record<string, Effect[]> = {
  'TQ-DATA': ['note', 'note'],
  'TQ-MAP': ['map_confirm', 'map_pick'],
  'TQ-VALUE': ['value', 'note'],
  'TQ-HW': ['hardware', 'note'],
  'TQ-CAP': ['capacity', 'note'],
  'TQ-SEG': ['segregation', 'note'],
  'TQ-SPARE': ['note', 'note'],
  'TQ-ALM': ['capacity', 'note'],
  'TQ-RULE': ['rule_revise', 'rule_waive'],
  'TQ-NAME': ['naming', 'note'],
  'TQ-REV': ['revision', 'revision'],
}

/** Answers of these kinds change a project-wide input, so they only make sense everywhere. */
const PROJECT_WIDE: Effect[] = ['map_confirm', 'map_pick', 'capacity', 'naming', 'rule_revise', 'rule_waive']

export const effectOf = (tq: TQ, optionIndex: number): Effect => EFFECT[tq.code]?.[optionIndex] ?? 'note'

export const CATEGORY_ORDER = ['missing data', 'rule conflicts', 'capacity issues']
export const SEVERITY_ORDER = ['blocking', 'assumed', 'info'] as const

export const SCOPE_LABEL: Record<Scope, string> = {
  row: 'This row only',
  cable: 'Every signal on this cable',
  everywhere: 'Everywhere (all matching signals)',
}

/** Scopes a given option can be answered at. */
export function scopesFor(tq: TQ, effect: Effect): Scope[] {
  if (PROJECT_WIDE.includes(effect)) return ['everywhere']
  const out: Scope[] = []
  if ((tq.signal_keys ?? []).length > 0) out.push('row')
  if (tq.data?.cable) out.push('cable')
  // a value answer needs one named value to apply everywhere
  const valued = effect === 'value' || effect === 'segregation'
  if (!valued || tq.data?.value) out.push('everywhere')
  return out.length ? out : ['everywhere']
}

/** Which input the option asks for. */
export type Input = 'none' | 'value' | 'column' | 'hardware' | 'limit' | 'naming' | 'rule' | 'rule_revise'
export const inputFor = (effect: Effect): Input =>
  ({ note: 'none', revision: 'none', map_confirm: 'none', map_pick: 'column', value: 'value', segregation: 'value', hardware: 'hardware', capacity: 'limit', naming: 'naming', rule_waive: 'rule', rule_revise: 'rule_revise' } as const)[effect]

/** Which allowed-values list a value/segregation answer picks from. */
export const valueKind = (tq: TQ, effect: Effect): 'io_type' | 'duty_class' | 'segregation' => {
  if (effect === 'segregation') return 'segregation'
  const f = tq.data?.field
  return f === 'duty' || f === 'duty_class' ? 'duty_class' : f === 'segregation' ? 'segregation' : 'io_type'
}

export const HW_FIELDS = [
  { key: 'charm', label: 'CHARM part number', required: true },
  { key: 'tb', label: 'Terminal block part number', required: true },
  { key: 'charm_name', label: 'CHARM name', required: false },
  { key: 'tb_name', label: 'Terminal block name', required: false },
  { key: 'tb_terminals', label: 'Terminals', required: false },
  { key: 'loop_typical', label: 'Loop typical', required: false },
] as const

export interface Draft {
  optionIndex: number
  scope: Scope
  value: string
  fields: Record<string, string>
}

/** Turn the form state into the API body, or say what is missing. */
export function buildAnswer(tq: TQ, d: Draft, author: string): { body: Schemas['AnswerIn'] } | { error: string } {
  const option = tq.options?.[d.optionIndex]
  if (!option) return { error: 'Choose an option.' }
  const effect = effectOf(tq, d.optionIndex)
  const input = inputFor(effect)
  const body: Schemas['AnswerIn'] = { option: option.label, scope: d.scope, author }
  if (d.scope === 'cable' && tq.data?.cable) body.target = tq.data.cable
  if (d.scope === 'row' && tq.signal_keys?.[0]) body.target = tq.signal_keys[0]

  const clean = (rec: Record<string, string>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''))
  switch (input) {
    case 'value':
      if (!d.value) return { error: 'Pick the value this should become.' }
      body.value = d.value
      break
    case 'column':
      if (!d.value) return { error: 'Pick the source column.' }
      body.value = d.value
      break
    case 'limit': {
      const n = Number(d.value)
      if (!Number.isInteger(n) || n < 1) return { error: 'Enter a whole number of at least 1.' }
      body.value = String(n)
      break
    }
    case 'hardware': {
      const f = clean(d.fields)
      for (const h of HW_FIELDS) if (h.required && !f[h.key]) return { error: `${h.label} is required.` }
      body.fields = f
      break
    }
    case 'naming': {
      const f = clean(d.fields)
      if (!f.area && !f.unit) return { error: 'Give an area and/or a unit.' }
      body.fields = { ...(f.area ? { area: f.area } : {}), ...(f.unit ? { unit: f.unit } : {}) }
      break
    }
    case 'rule': {
      const rule = (d.fields.rule ?? '').trim()
      if (!rule) return { error: 'Name the rule.' }
      body.fields = { rule }
      break
    }
    case 'rule_revise': {
      const rule = (d.fields.rule ?? '').trim()
      if (!rule) return { error: 'Name the rule.' }
      const changes: Record<string, unknown> = {}
      for (const line of (d.fields.changes ?? '').split('\n')) {
        const [k, ...rest] = line.split('=')
        const v = rest.join('=').trim()
        if (!k.trim() || !v) continue
        changes[k.trim()] = Number.isFinite(Number(v)) && v !== '' ? Number(v) : v
      }
      if (Object.keys(changes).length === 0) return { error: 'Give at least one parameter change, like max = 80.' }
      body.fields = { rule, ...changes }
      break
    }
  }
  return { body }
}

/** Group TQs by category in the PS order, each group sorted blocking first. */
export function groupTqs(tqs: TQ[]): { category: string; items: TQ[] }[] {
  const rank = (s: string) => SEVERITY_ORDER.indexOf(s as (typeof SEVERITY_ORDER)[number])
  const cats = [...new Set(tqs.map((t) => t.category))].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return cats.map((category) => ({
    category,
    items: tqs.filter((t) => t.category === category).sort((a, b) => rank(a.severity) - rank(b.severity) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id)),
  }))
}
