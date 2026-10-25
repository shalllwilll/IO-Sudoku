// Synthetic data for the design preview only. Invented tags and cables, never real workbook rows.
export type Kind = 'field' | 'wired_spare' | 'spare_slot' | 'cabinet_alarm' | 'empty'
import { BASEPLATES, CHANNELS, charmNo, IO_TYPES, type Io } from '@/lib/hierarchy'
export { BASEPLATES, CHANNELS, charmNo, IO_TYPES }
export type { Io }

export interface Slot {
  cab: number
  cioc: number
  bp: number
  ch: number
  kind: Kind
  reserved?: 'alarm' | 'spare'
  io?: Io
  tag?: string
  cable?: string
  pair?: number
  seg?: 'A' | 'B'
}

export const CABINETS = 3
export const CIOCS_PER_CABINET = 4

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PREFIX: Record<Io, string[]> = {
  AIR: ['PT', 'FT', 'LT', 'TT'],
  AOR: ['FV', 'PV'],
  DIR: ['ZSH', 'HS'],
  DOR: ['XV', 'HN'],
}

function build(): Slot[] {
  const rand = rng(7)
  const out: Slot[] = []
  const total = CABINETS * CIOCS_PER_CABINET
  for (let cioc = 1; cioc <= total; cioc++) {
    const cab = Math.ceil(cioc / CIOCS_PER_CABINET)
    const first = (cioc - 1) % CIOCS_PER_CABINET === 0
    for (let bp = 1; bp <= BASEPLATES; bp++) {
      const reserved = first && bp === 1 ? 'alarm' : cioc === total && bp > BASEPLATES - 3 ? 'spare' : undefined
      for (let ch = 1; ch <= CHANNELS; ch++) {
        out.push({ cab, cioc, bp, ch, kind: reserved === 'alarm' ? 'cabinet_alarm' : 'empty', reserved })
      }
    }
  }
  const free = out.filter((s) => !s.reserved)
  let i = 0
  let n = 0
  let cable = 0
  let fields = 0
  while (i < free.length && fields < 177) {
    const size = [12, 12, 24, 8, 16, 12][Math.floor(rand() * 6)]
    const start = free[i]
    const fitsRow = size <= CHANNELS && start.ch + size - 1 <= CHANNELS
    if ((size <= CHANNELS && !fitsRow) || (size > CHANNELS && start.ch !== 1)) {
      const bp = start.bp
      while (i < free.length && free[i].bp === bp && free[i].cioc === start.cioc) i++
      continue
    }
    const r = rand()
    const io: Io = r < 0.4 ? 'AIR' : r < 0.62 ? 'DIR' : r < 0.84 ? 'DOR' : 'AOR'
    const spares = Math.floor(size * 0.15)
    const used = size - spares
    cable++
    const name = `CBL-${100 + cable}`
    const block = free.slice(i, i + size)
    const contiguous =
      block.length === size &&
      block.every((s, k) => k === 0 || (s.cioc === block[0].cioc && s.bp - block[k - 1].bp <= 1))
    if (!contiguous) {
      // The block would cross a CIOC edge or a reserved baseplate: continue from the next CIOC.
      const cioc = start.cioc
      while (i < free.length && free[i].cioc === cioc) i++
      continue
    }
    block.forEach((s, k) => {
      s.cable = name
      s.pair = k + 1
      s.seg = s.cioc % 2 === 0 ? 'A' : 'B'
      s.io = io
      if (k < used) {
        n++
        fields++
        s.kind = 'field'
        s.tag = `${PREFIX[io][n % PREFIX[io].length]}-${4000 + n}${io === 'AIR' ? '-A' : ''}`
      } else {
        s.kind = k % 2 === 0 ? 'wired_spare' : 'spare_slot'
        if (s.kind === 'spare_slot') s.io = undefined
      }
    })
    i += size
  }
  out.filter((s) => s.kind === 'cabinet_alarm').forEach((s, k) => {
    s.tag = `ALM-${900 + k}`
  })
  return out
}

export const slots = build()
export const inCabinet = (cab: number) => slots.filter((s) => s.cab === cab)
export const count = (pred: (s: Slot) => boolean) => slots.filter(pred).length

export const STAGES = [
  { id: 'ingest', label: 'Ingest', detail: 'Read workbook, detect header, merge files', seconds: 0.31 },
  { id: 'map', label: 'Map', detail: 'Match source columns to canonical fields', seconds: 0.12 },
  { id: 'normalise', label: 'Normalise', detail: 'Resolve IO types, duty classes, segregation', seconds: 0.44 },
  { id: 'hardware', label: 'Hardware', detail: 'Select CHARM and terminal block per signal', seconds: 0.2 },
  { id: 'layout', label: 'Layout', detail: 'Derive cabinets, CIOCs and baseplates', seconds: 0.08 },
  { id: 'pack', label: 'Pack', detail: 'Place cable blocks, validate against hard rules', seconds: 2.1 },
] as const
