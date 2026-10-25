import { describe, expect, it } from 'vitest'
import { buildPlantModel, slotHasTq } from './plant'
import type { LayoutData } from '@/api/queries'
import type { Slot } from './results'

const layout: LayoutData['layout'] = {
  cabinets: [{ no: 1, name: 'CAB-1', ciocs: [1] }],
  ciocs: [{ no: 1, name: 'CIOC-1', cabinet: 1, seq_in_cabinet: 1, controller: 1, baseplates: [{ name: 'BP-1', cioc_no: 1, n: 1, reserved: null }] }],
  spare_baseplates_per_cabinet: 0,
}
const slot = (channel: number): Slot => ({ cab: 1, cioc: 1, ciocName: 'CIOC-1', bp: 1, bpName: 'BP-1', ch: channel, kind: 'field', io: 'AIR', placement: { cioc_no: 1, baseplate: 1, channel, kind: 'field', pair: channel, signal: { source_file: 'input.xlsx', source_row: channel, tag: `FT-${channel}` } } as Slot['placement'] })

describe('plant model', () => {
  it('derives cabinet, hardware and CHARM positions from the actual run layout', () => {
    const model = buildPlantModel(layout, [slot(1), slot(2)])
    expect(model.cabinets).toHaveLength(1)
    expect(model.ciocs).toHaveLength(1)
    expect(model.baseplates).toHaveLength(1)
    expect(model.slots.map((value) => value.id)).toEqual(['1:1:1', '1:1:2'])
  })

  it('only marks slots whose source signal belongs to an open TQ', () => {
    expect(slotHasTq(slot(1), new Set(['input.xlsx:1']))).toBe(true)
    expect(slotHasTq(slot(2), new Set(['input.xlsx:1']))).toBe(false)
  })
})
