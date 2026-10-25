import { Box } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorPanel } from '@/components/ErrorView'
import { CharmCell } from '@/components/charm/CharmCell'
import { IO_BG } from '@/components/charm/kinds'
import { SlotInspector } from '@/components/results/SlotInspector'
import { cn } from '@/lib/cn'
import { BASEPLATES, CHANNELS, IO_TYPES, type Io } from '@/lib/hierarchy'
import type { Slot } from '@/lib/results'
import { useSlots } from '@/lib/useSlots'

function CiocCard({ name, no, cells, pick, selected, filter }: { name: string; no: number; cells: Slot[]; pick: (s: Slot) => void; selected?: Slot; filter: Io | null }) {
  const used = cells.filter((s) => s.kind === 'field' || s.kind === 'wired_spare' || s.kind === 'cabinet_alarm').length
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-2 shadow-card" aria-label={`CIOC ${no}`}>
      <header className="flex items-baseline justify-between px-2 py-1.5">
        <h3 className="text-[13px] font-medium">
          CIOC {no} <span className="ml-1 font-mono text-xs font-normal text-fg-subtle">{name}</span>
        </h3>
        <span className="text-xs text-fg-subtle tnum">{used} / {BASEPLATES * CHANNELS} used</span>
      </header>
      <div className="flex flex-col gap-1.5 p-2">
        {Array.from({ length: BASEPLATES }, (_, i) => i + 1).map((bp) => {
          const row = cells.filter((s) => s.bp === bp)
          const reserved = row[0]?.reserved
          return (
            <div key={bp} className={cn('flex items-center gap-2 rounded-md', reserved === 'spare' && 'pat-reserved')}>
              <span className="w-7 font-mono text-[11px] text-fg-subtle">BP{bp}</span>
              <div className="flex gap-1">
                {row.map((s) => (
                  <CharmCell key={s.ch} slot={s} selected={selected === s} dimmed={filter !== null && s.io !== filter} onSelect={pick} />
                ))}
              </div>
              {reserved && <span className="ml-auto pr-1 text-[11px] text-fg-subtle">{reserved === 'alarm' ? 'alarms' : 'reserved'}</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function LayoutTab() {
  const { pid = '', rid = '' } = useParams()
  const { slots, layout, allocation, error, loading, refetch } = useSlots(pid, rid)
  const [cab, setCab] = useState<number | null>(null)
  const [filter, setFilter] = useState<Io | null>(null)
  const [sel, setSel] = useState<Slot | undefined>()

  const cabinets = layout?.cabinets ?? []
  const active = cab ?? cabinets[0]?.no
  const counts = useMemo(() => Object.fromEntries(IO_TYPES.map((t) => [t, slots.filter((s) => s.io === t && s.kind === 'field').length])), [slots])

  if (error) return <ErrorPanel error={error} onRetry={refetch} />
  if (loading || !layout || !allocation) return <p className="p-8 text-[13px] text-fg-muted">Loading layout…</p>

  const cabinet = cabinets.find((c) => c.no === active)
  const ciocs = (layout.ciocs ?? []).filter((c) => c.cabinet === active).sort((a, b) => a.no - b.no)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 overflow-auto p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Cabinet" className="flex rounded-lg bg-surface-2 p-1">
            {cabinets.map((c) => (
              <button key={c.no} role="tab" aria-selected={c.no === active} onClick={() => setCab(c.no)} className={cn('rounded-md px-3 py-1.5 text-[13px] transition-[background-color,color,box-shadow] duration-150 ease-out', c.no === active ? 'bg-surface-1 text-fg shadow-card' : 'text-fg-muted hover:text-fg')}>
                Cabinet {c.no}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by IO type">
            {IO_TYPES.map((t) => (
              <button key={t} aria-pressed={filter === t} onClick={() => setFilter(filter === t ? null : t)} className={cn('flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-xs transition-[background-color,border-color] duration-150 ease-out', filter === t ? 'border-fg-subtle bg-surface-3' : 'border-border hover:bg-surface-2')}>
                <span className={cn('size-2 rounded-sm', IO_BG[t])} />
                {t}
                <span className="text-fg-subtle tnum">{counts[t]}</span>
              </button>
            ))}
          </div>
          <Link to={`/projects/${pid}/plant?run=${rid}`} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium transition-[background-color] duration-150 ease-out hover:bg-surface-3">
            <Box size={15} strokeWidth={1.75} /> View in 3D
          </Link>
        </div>
        {cabinet && <p className="mb-3 font-mono text-xs text-fg-muted">{cabinet.name}</p>}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {ciocs.map((c) => (
            <CiocCard key={c.no} no={c.no} name={c.name} cells={slots.filter((s) => s.cioc === c.no)} pick={setSel} selected={sel} filter={filter} />
          ))}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-muted" aria-label="Legend">
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] bg-io-air" />Field signal</li>
          <li className="flex items-center gap-2"><span className="grid size-3.5 place-items-center rounded-[4px] border-2 border-io-air"><span className="size-1 rounded-full bg-io-air" /></span>Wired spare</li>
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] border border-dashed border-fg-subtle" />Spare slot</li>
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] bg-fg-muted pat-alarm" />Cabinet alarm</li>
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] bg-surface-2" />Unused</li>
        </ul>
      </div>
      <SlotInspector slot={sel} rows={allocation.rows} onClose={() => setSel(undefined)} />
    </div>
  )
}
