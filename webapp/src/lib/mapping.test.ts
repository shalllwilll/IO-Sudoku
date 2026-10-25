import { describe, expect, it } from 'vitest'
import type { MappingSheet } from '@/api/queries'
import { currentSelection, duplicateColumns, missingRequired, toConfirmed } from './mapping'
import { choiceFor, undecided, withChoice } from './values'

const sheet = (o: Partial<MappingSheet> = {}): MappingSheet => ({
  file: 'a.xlsx',
  sheet: 'S1',
  columns: ['Tag', 'Cable', 'Pair', 'Type'],
  grouping_mode: 'none',
  issues: [],
  matches: { tag: { field: 'tag', column: 'Tag', confidence: 1, method: 'alias' }, io_type: { field: 'io_type', column: 'Type', confidence: 0.8, method: 'fuzzy' } },
  ...o,
})

describe('mapping selection', () => {
  it('uses detected matches and lets confirmed choices win', () => {
    const sel = currentSelection(sheet(), ['tag', 'cable', 'io_type'], { cable: 'Cable' })
    expect(sel).toEqual({ tag: 'Tag', cable: 'Cable', io_type: 'Type' })
  })
  it('ignores a confirmed column that no longer exists', () => {
    expect(currentSelection(sheet(), ['tag'], { tag: 'Gone' }).tag).toBe('Tag')
  })
  it('builds the PUT body per file without empty fields', () => {
    const s = sheet()
    expect(toConfirmed([s], { [`a.xlsx::S1`]: { tag: 'Tag', cable: '', pair: 'Pair' } })).toEqual({ 'a.xlsx': { tag: 'Tag', pair: 'Pair' } })
  })
  it('finds missing required fields and duplicate columns', () => {
    expect(missingRequired({ tag: 'Tag', cable: '' }, ['tag', 'cable', 'pair'])).toEqual(['cable', 'pair'])
    expect(duplicateColumns({ tag: 'Tag', old_tag: 'Tag', cable: 'Cable' })).toEqual({ Tag: ['tag', 'old_tag'] })
  })
})

describe('value maps', () => {
  const unknown = [
    { field: 'io_type', value: 'Analog In', count: 3 },
    { field: 'segregation', value: 'x', count: 1 },
  ]
  it('records and clears a choice, upper-casing the key', () => {
    let m = withChoice({}, 'io_type', 'Analog In', 'AIR')
    expect(m.io_types).toEqual({ 'ANALOG IN': 'AIR' })
    expect(choiceFor(m, unknown[0])).toBe('AIR')
    m = withChoice(m, 'io_type', 'Analog In', '')
    expect(m.io_types).toEqual({})
  })
  it('lists the values still undecided', () => {
    const m = withChoice({}, 'io_type', 'Analog In', 'AIR')
    expect(undecided(unknown, m).map((u) => u.value)).toEqual(['x'])
  })
})
