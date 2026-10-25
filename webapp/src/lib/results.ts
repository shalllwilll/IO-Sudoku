import type { Allocation, LayoutData, PlacementOut } from '@/api/queries'
import { BASEPLATES, CHANNELS, IO_TYPES, type Io } from './hierarchy'

export type Kind = 'field' | 'wired_spare' | 'spare_slot' | 'cabinet_alarm' | 'empty'

/** One CHARM position of the layout, joined with its placement when there is one. */
export interface Slot {
  cab: number
  cioc: number
  ciocName: string
  bp: number
  bpName: string
  ch: number
  kind: Kind
  reserved?: 'alarm' | 'spare'
  io?: Io
  tag?: string
  cable?: string
  pair?: number
  seg?: string
  group?: string
  placement?: PlacementOut
}

const isIo = (v: unknown): v is Io => typeof v === 'string' && (IO_TYPES as string[]).includes(v)
const KINDS: Kind[] = ['field', 'wired_spare', 'spare_slot', 'cabinet_alarm']
const asKind = (k: string): Kind => ((KINDS as string[]).includes(k) ? (k as Kind) : 'field')

export const slotKey = (cioc: number, bp: number, ch: number) => `${cioc}:${bp}:${ch}`

/** Every position of every CIOC in the layout (empty ones included), in position order. */
export function buildSlots(layout: LayoutData['layout'], placements: PlacementOut[]): Slot[] {
  const byPos = new Map(placements.map((p) => [slotKey(p.cioc_no, p.baseplate, p.channel), p]))
  const out: Slot[] = []
  for (const c of [...(layout.ciocs ?? [])].sort((a, b) => a.no - b.no)) {
    for (const b of [...c.baseplates].sort((x, y) => x.n - y.n)) {
      for (let ch = 1; ch <= CHANNELS; ch++) {
        const p = byPos.get(slotKey(c.no, b.n, ch))
        const sig = p?.signal ?? undefined
        const io = isIo(p?.io_type) ? p.io_type : isIo(sig?.io_type) ? sig.io_type : undefined
        out.push({
          cab: c.cabinet,
          cioc: c.no,
          ciocName: c.name,
          bp: b.n,
          bpName: b.name,
          ch,
          kind: p ? asKind(p.kind) : 'empty',
          reserved: b.reserved === 'alarm' || b.reserved === 'spare' ? b.reserved : undefined,
          io,
          tag: sig?.tag ?? undefined,
          cable: sig?.cable ?? p?.block_id ?? undefined,
          pair: p?.pair ?? sig?.pair ?? undefined,
          seg: sig?.segregation_family ?? undefined,
          group: p?.group ?? undefined,
          placement: p,
        })
      }
    }
  }
  return out
}

export const positionsPerCioc = BASEPLATES * CHANNELS

export interface Filters {
  io: Io | null
  kind: Kind | 'all'
  query: string
}

export const matchesFilters = (s: Slot, f: Filters): boolean => {
  if (s.kind === 'empty') return false
  if (f.io && s.io !== f.io) return false
  if (f.kind !== 'all' && s.kind !== f.kind) return false
  const q = f.query.trim().toLowerCase()
  if (q && ![s.tag, s.cable, s.group].some((v) => v?.toLowerCase().includes(q))) return false
  return true
}

export type SortKey = 'position' | 'tag' | 'cable' | 'io'
const cmpText = (a?: string, b?: string) => (a ?? '￿').localeCompare(b ?? '￿', undefined, { numeric: true })
export function sortSlots(slots: Slot[], key: SortKey): Slot[] {
  if (key === 'position') return slots
  const by = { tag: (s: Slot) => s.tag, cable: (s: Slot) => s.cable, io: (s: Slot) => s.io }[key]
  return [...slots].sort((a, b) => cmpText(by(a), by(b)))
}

/** The hardware row the allocation workbook holds for a position, found by CIOC name, baseplate name and channel. */
export function rowFor(rows: Allocation['rows'], s: Slot): Record<string, unknown> | undefined {
  return rows.find((r) => r.cioccslsname === s.ciocName && r.baseplate === s.bpName && Number(r.channelno) === s.ch)
}

export const percent = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`
