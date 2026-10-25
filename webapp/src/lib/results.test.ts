import { describe, expect, it } from 'vitest'
import type { LayoutData, PlacementOut } from '@/api/queries'
import { buildSlots, matchesFilters, rowFor, sortSlots } from './results'

const layout = {
  cabinets: [{ no: 1, name: 'CAB-1', ciocs: [1] }],
  ciocs: [{ no: 1, name: 'CIOC1', cabinet: 1, seq_in_cabinet: 1, controller: 1, baseplates: [{ name: 'BP-1', cioc_no: 1, n: 1, reserved: 'alarm' }, { name: 'BP-2', cioc_no: 1, n: 2, reserved: null }] }],
} as unknown as LayoutData['layout']

const place = (bp: number, ch: number, kind: string, o: object = {}): PlacementOut => ({ cioc_no: 1, baseplate: bp, channel: ch, kind, ...o }) as PlacementOut

describe('buildSlots', () => {
  const slots = buildSlots(layout, [
    place(1, 1, 'cabinet_alarm', { signal: { tag: 'ALM', io_type: 'DIR' } }),
    place(2, 3, 'wired_spare', { io_type: 'AIR', block_id: 'C-1', pair: 4 }),
    place(2, 1, 'field', { signal: { tag: 'T-1', io_type: 'DOR', cable: 'C-2', segregation_family: 'A' }, pair: 2 }),
  ])

  it('creates a slot for every position, empty ones included, in position order', () => {
    expect(slots).toHaveLength(2 * 12)
    expect(slots.filter((s) => s.kind === 'empty')).toHaveLength(21)
    expect(slots[0]).toMatchObject({ bp: 1, ch: 1, kind: 'cabinet_alarm', reserved: 'alarm', io: 'DIR' })
  })
  it('takes IO type from the placement (wired spares) or the signal, and cable from block id when no signal', () => {
    expect(slots.find((s) => s.bp === 2 && s.ch === 3)).toMatchObject({ kind: 'wired_spare', io: 'AIR', cable: 'C-1', pair: 4 })
    expect(slots.find((s) => s.bp === 2 && s.ch === 1)).toMatchObject({ io: 'DOR', cable: 'C-2', seg: 'A' })
  })
  it('ignores IO types outside the four known ones', () => {
    const s = buildSlots(layout, [place(2, 1, 'field', { signal: { tag: 'X', io_type: 'WEIRD' } })])
    expect(s.find((x) => x.tag === 'X')?.io).toBeUndefined()
  })

  it('filters by io, kind and text and never lists empty positions', () => {
    const f = { io: null, kind: 'all', query: '' } as const
    expect(slots.filter((s) => matchesFilters(s, f))).toHaveLength(3)
    expect(slots.filter((s) => matchesFilters(s, { ...f, io: 'AIR' }))).toHaveLength(1)
    expect(slots.filter((s) => matchesFilters(s, { ...f, kind: 'field' }))).toHaveLength(1)
    expect(slots.filter((s) => matchesFilters(s, { ...f, query: 't-1' }))).toHaveLength(1)
  })
  it('sorts by tag with missing values last', () => {
    const used = slots.filter((s) => s.kind !== 'empty')
    expect(sortSlots(used, 'tag').map((s) => s.tag)).toEqual(['ALM', 'T-1', undefined])
    expect(sortSlots(used, 'position')).toBe(used)
  })
  it('finds the hardware row by CIOC name, baseplate name and channel', () => {
    const rows = [{ cioccslsname: 'CIOC1', baseplate: 'BP-2', channelno: 1, charmtype: 'X' }]
    expect(rowFor(rows, slots.find((s) => s.bp === 2 && s.ch === 1)!)?.charmtype).toBe('X')
    expect(rowFor(rows, slots[0])).toBeUndefined()
  })
})
