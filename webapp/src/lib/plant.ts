import type { LayoutData } from '@/api/queries'
import { slotKey, type Slot } from './results'

export interface SceneShape {
  id: string
  position: [number, number, number]
  size: [number, number, number]
}

export interface PlantModel {
  cabinets: SceneShape[]
  ciocs: SceneShape[]
  baseplates: SceneShape[]
  slots: Array<SceneShape & { slot: Slot }>
  bounds: SceneShape
}

const cabinetId = (cabinet: number) => `cabinet:${cabinet}`
const ciocId = (cioc: number) => `cioc:${cioc}`
const baseplateId = (cioc: number, bp: number) => `baseplate:${cioc}:${bp}`

/**
 * A presentation-only plant geometry, derived from the actual returned hierarchy.
 * Its dimensions are deliberately schematic: this is not a surveyed cabinet drawing.
 */
export function buildPlantModel(layout: LayoutData['layout'], slots: Slot[]): PlantModel {
  const cabinets: SceneShape[] = []
  const ciocs: SceneShape[] = []
  const baseplates: SceneShape[] = []
  const sceneSlots: PlantModel['slots'] = []
  const byCioc = new Map((layout.ciocs ?? []).map((cioc) => [cioc.no, cioc]))
  const slotsByCioc = new Map<number, Slot[]>()
  for (const slot of slots) slotsByCioc.set(slot.cioc, [...(slotsByCioc.get(slot.cioc) ?? []), slot])

  let cursor = 0
  let maxHeight = 4
  for (const cabinet of [...(layout.cabinets ?? [])].sort((a, b) => a.no - b.no)) {
    const ciocNos = [...cabinet.ciocs].sort((a, b) => a - b)
    const ciocData = ciocNos.map((n) => byCioc.get(n)).filter((v): v is NonNullable<typeof v> => !!v)
    const plateCount = Math.max(1, ...ciocData.map((cioc) => cioc.baseplates.length))
    const width = Math.max(4.2, ciocData.length * 3.2 + 0.9)
    const height = Math.max(3.4, plateCount * 0.84 + 1.6)
    const centreX = cursor + width / 2
    maxHeight = Math.max(maxHeight, height)
    cabinets.push({ id: cabinetId(cabinet.no), position: [centreX, height / 2, 0], size: [width, height, 1.7] })

    ciocData.forEach((cioc, ciocIndex) => {
      const x = centreX - width / 2 + 1.95 + ciocIndex * 3.2
      ciocs.push({ id: ciocId(cioc.no), position: [x, height / 2, 0], size: [2.92, height - 0.5, 1.08] })
      const ciocSlots = slotsByCioc.get(cioc.no) ?? []
      for (const plate of [...cioc.baseplates].sort((a, b) => a.n - b.n)) {
        const y = height - 1 - (plate.n - 1) * 0.84
        const plateSlots = ciocSlots.filter((slot) => slot.bp === plate.n).sort((a, b) => a.ch - b.ch)
        baseplates.push({ id: baseplateId(cioc.no, plate.n), position: [x, y, 0.62], size: [2.72, 0.54, 0.32] })
        const columns = Math.max(1, plateSlots.length)
        const pitch = 2.5 / columns
        plateSlots.forEach((slot, index) => {
          sceneSlots.push({
            id: slotKey(slot.cioc, slot.bp, slot.ch),
            slot,
            position: [x + (index - (columns - 1) / 2) * pitch, y, 0.93],
            size: [Math.min(0.24, pitch * 0.76), 0.28, 0.2],
          })
        })
      }
    })
    cursor += width + 2.25
  }

  const span = Math.max(8, cursor ? cursor - 2.25 : 8)
  const offset = span / 2
  for (const shape of [...cabinets, ...ciocs, ...baseplates, ...sceneSlots]) shape.position[0] -= offset
  return {
    cabinets,
    ciocs,
    baseplates,
    slots: sceneSlots,
    bounds: { id: 'overview', position: [0, maxHeight / 2, 0], size: [span + 8, maxHeight + 1, 8] },
  }
}

export function signalKey(slot: Slot): string | undefined {
  const signal = slot.placement?.signal
  return signal ? `${signal.source_file ?? '?'}:${signal.source_row}` : undefined
}

export function slotHasTq(slot: Slot, tqKeys: Set<string>): boolean {
  const key = signalKey(slot)
  return key !== undefined && tqKeys.has(key)
}
