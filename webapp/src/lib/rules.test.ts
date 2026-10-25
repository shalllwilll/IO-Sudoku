import { describe, expect, it } from 'vitest'
import { buildRule, byStrength, describeRule, nextRuleId, type Rule } from './rules'

const rule = (o: Partial<Rule> = {}): Rule => ({ id: 'R1', name: 'n', primitive: 'capacity', scope: '', parameters: { per: 'cioc', max: 96 }, enabled: true, strength: 'hard', not_enforced_reason: null, builtin: null, ...o })

describe('rules helpers', () => {
  it('groups by strength', () => {
    const g = byStrength([rule(), rule({ id: 'R2', strength: 'soft' })])
    expect([g.hard.length, g.soft.length, g.advisory.length]).toEqual([1, 1, 0])
  })
  it('describes rules in plain language', () => {
    expect(describeRule(rule())).toBe('At most 96 per cioc')
    expect(describeRule(rule({ primitive: null, builtin: 'R-BLOCK' }))).toMatch(/Always enforced/)
    expect(describeRule(rule({ primitive: 'separate', scope: 'io_type = AIR', parameters: { a: 'x', b: 'y', level: 'cioc' } }))).toBe('x and y never share a cioc for io_type = AIR')
  })
  it('generates unused ids', () => {
    expect(nextRuleId([{ id: 'USR-CAPACITY-1' }], 'capacity')).toBe('USR-CAPACITY-2')
  })
  it('builds a rule, parsing numbers and dropping blank optional parameters', () => {
    const r = buildRule({ primitive: 'capacity', name: ' Cap ', scope: '', strength: 'soft', values: { per: 'cioc', max: '80' } }, [])
    expect(r).toMatchObject({ rule: { id: 'USR-CAPACITY-1', name: 'Cap', strength: 'soft', parameters: { per: 'cioc', max: 80 } } })
  })
  it('reports what is missing', () => {
    expect(buildRule({ primitive: 'capacity', name: 'x', scope: '', strength: 'hard', values: { per: 'cioc' } }, [])).toEqual({ error: 'Maximum is required.' })
    expect(buildRule({ primitive: 'capacity', name: 'x', scope: '', strength: 'hard', values: { per: 'cioc', max: 'abc' } }, [])).toEqual({ error: 'Maximum must be a number.' })
    expect(buildRule({ primitive: 'order', name: '', scope: '', strength: 'hard', values: { by: 'tag' } }, [])).toEqual({ error: 'Give the rule a name.' })
  })
})
