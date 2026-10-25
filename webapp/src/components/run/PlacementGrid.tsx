import { memo, useMemo } from 'react'
import { cn } from '@/lib/cn'
import { BASEPLATES, CHANNELS, CIOCS_PER_CABINET } from '@/lib/hierarchy'
import type { CellKind } from '@/lib/runStream'

const dot: Record<CellKind, string> = {
  field: 'bg-accent',
  wired_spare: 'border border-accent bg-transparent',
  spare_slot: 'border border-dashed border-fg-subtle bg-transparent',
  cabinet_alarm: 'bg-fg-muted pat-alarm',
  empty: 'bg-surface-3',
}

const Cioc = memo(function Cioc({ cioc, cells }: { cioc: number; cells: Map<string, CellKind> }) {
  const items = []
  for (let bp = 1; bp <= BASEPLATES; bp++)
    for (let ch = 1; ch <= CHANNELS; ch++) {
      const kind = cells.get(`${cioc}:${bp}:${ch}`)
      items.push(<span key={`${bp}:${ch}`} className={cn('size-[7px] rounded-[2px] transition-[opacity,background-color] duration-150 ease-out', kind ? dot[kind] : 'bg-surface-3 opacity-40')} />)
    }
  return <div className="grid grid-cols-12 gap-[3px]">{items}</div>
})

/** Cabinets of CIOCs, filling as placement events arrive. Colour is by slot kind; IO type is not in the stream. */
export function PlacementGrid({ cells }: { cells: Map<string, CellKind> }) {
  const cabinets = useMemo(() => {
    let maxCioc = 0
    for (const key of cells.keys()) maxCioc = Math.max(maxCioc, Number(key.split(':')[0]))
    const count = Math.max(1, Math.ceil(maxCioc / CIOCS_PER_CABINET))
    return Array.from({ length: count }, (_, c) => Array.from({ length: CIOCS_PER_CABINET }, (_, k) => c * CIOCS_PER_CABINET + k + 1))
  }, [cells])
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {cabinets.map((ciocs, c) => (
        <div key={c} className="flex items-start gap-3">
          <span className="w-14 pt-0.5 font-mono text-[11px] text-fg-subtle">CAB {c + 1}</span>
          <div className="flex flex-wrap gap-3">
            {ciocs.map((n) => (
              <Cioc key={n} cioc={n} cells={cells} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
