import { describe, expect, it } from 'vitest'
import { buildAnswer, effectOf, groupTqs, inputFor, scopesFor, type Draft, type TQ } from './tq'

const tq = (o: Partial<TQ> = {}): TQ =>
  ({
    id: 'TQ-1', code: 'TQ-VALUE', severity: 'assumed', category: 'missing data', subject: 's', message: 'm', default_applied: '', scope: 'signal', status: 'open',
    options: [{ label: 'Map to a known value', consequence: 'c' }, { label: 'Keep the default policy', consequence: 'c' }],
    signal_keys: ['f.xlsx:5'], data: { field: 'io_type', value: 'Analog In', cable: 'C-1' }, ...o,
  }) as TQ
const draft = (o: Partial<Draft> = {}): Draft => ({ optionIndex: 0, scope: 'everywhere', value: '', fields: {}, ...o })

describe('effects and scopes', () => {
  it('knows what each option does', () => {
    expect(effectOf(tq(), 0)).toBe('value')
    expect(effectOf(tq(), 1)).toBe('note')
    expect(effectOf(tq({ code: 'TQ-RULE' }), 1)).toBe('rule_waive')
    expect(inputFor('capacity')).toBe('limit')
  })
  it('offers row, cable and everywhere for a value answer when one value is named', () => {
    expect(scopesFor(tq(), 'value')).toEqual(['row', 'cable', 'everywhere'])
  })
  it('hides everywhere for a value answer when no single value is named', () => {
    expect(scopesFor(tq({ data: { field: 'io_type' } }), 'value')).toEqual(['row'])
  })
  it('only allows everywhere for project-wide effects', () => {
    expect(scopesFor(tq({ code: 'TQ-CAP' }), 'capacity')).toEqual(['everywhere'])
  })
})

describe('buildAnswer', () => {
  it('a note needs nothing and carries scope target', () => {
    const r = buildAnswer(tq(), draft({ optionIndex: 1, scope: 'cable' }), 'Priya')
    expect(r).toEqual({ body: { option: 'Keep the default policy', scope: 'cable', author: 'Priya', target: 'C-1' } })
  })
  it('a value answer requires a value', () => {
    expect(buildAnswer(tq(), draft(), 'a')).toEqual({ error: 'Pick the value this should become.' })
    expect(buildAnswer(tq(), draft({ value: 'AIR' }), 'a')).toMatchObject({ body: { value: 'AIR', option: 'Map to a known value' } })
  })
  it('row scope targets the first signal key', () => {
    expect(buildAnswer(tq(), draft({ scope: 'row', value: 'AIR' }), 'a')).toMatchObject({ body: { target: 'f.xlsx:5' } })
  })
  it('hardware needs both part numbers and drops blanks', () => {
    const t = tq({ code: 'TQ-HW', options: [{ label: 'Supply the part number', consequence: '' }] })
    expect(buildAnswer(t, draft({ fields: { charm: 'X' } }), 'a')).toEqual({ error: 'Terminal block part number is required.' })
    expect(buildAnswer(t, draft({ fields: { charm: ' X ', tb: 'Y', tb_name: '' } }), 'a')).toMatchObject({ body: { fields: { charm: 'X', tb: 'Y' } } })
  })
  it('capacity must be a whole number of at least 1', () => {
    const t = tq({ code: 'TQ-CAP', options: [{ label: 'Allow more cabinets', consequence: '' }] })
    expect(buildAnswer(t, draft({ value: '0' }), 'a')).toEqual({ error: 'Enter a whole number of at least 1.' })
    expect(buildAnswer(t, draft({ value: '4' }), 'a')).toMatchObject({ body: { value: '4' } })
  })
  it('a rule revision parses parameter lines into fields', () => {
    const t = tq({ code: 'TQ-RULE', options: [{ label: 'Revise the rule', consequence: '' }] })
    const r = buildAnswer(t, draft({ fields: { rule: 'PS-CAP-CIOC', changes: 'max = 80\nper=cioc' } }), 'a')
    expect(r).toMatchObject({ body: { fields: { rule: 'PS-CAP-CIOC', max: 80, per: 'cioc' } } })
    expect(buildAnswer(t, draft({ fields: { rule: 'R', changes: '' } }), 'a')).toMatchObject({ error: expect.stringMatching(/parameter change/) })
  })
  it('naming accepts area and/or unit', () => {
    const t = tq({ code: 'TQ-NAME', options: [{ label: 'Supply the value', consequence: '' }] })
    expect(buildAnswer(t, draft({ fields: {} }), 'a')).toEqual({ error: 'Give an area and/or a unit.' })
    expect(buildAnswer(t, draft({ fields: { unit: '100' } }), 'a')).toMatchObject({ body: { fields: { unit: '100' } } })
  })
})

describe('groupTqs', () => {
  it('orders categories as the problem statement does and blocking first', () => {
    const g = groupTqs([tq({ id: 'a', category: 'capacity issues' }), tq({ id: 'b', severity: 'info' }), tq({ id: 'c', severity: 'blocking' }), tq({ id: 'd', category: 'rule conflicts' })])
    expect(g.map((x) => x.category)).toEqual(['missing data', 'rule conflicts', 'capacity issues'])
    expect(g[0].items.map((i) => i.id)).toEqual(['c', 'b'])
  })
})
