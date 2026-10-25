import { useVirtualizer } from '@tanstack/react-virtual'
import { Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorPanel } from '@/components/ErrorView'
import { IO_BG, KIND_LABEL } from '@/components/charm/kinds'
import { SlotInspector } from '@/components/results/SlotInspector'
import { inputClass } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { charmNo, IO_TYPES, type Io } from '@/lib/hierarchy'
import { matchesFilters, sortSlots, type Filters, type Kind, type Slot, type SortKey } from '@/lib/results'
import { useSlots } from '@/lib/useSlots'

const COLS = 'grid-cols-[minmax(160px,1.6fr)_56px_120px_minmax(130px,1.2fr)_48px_48px_44px_44px_72px]'
const ROW = 36
const KIND_OPTIONS: (Kind | 'all')[] = ['all', 'field', 'wired_spare', 'spare_slot', 'cabinet_alarm']

export default function Allocation() {
  const { pid = '', rid = '' } = useParams()
  const { slots, allocation, error, loading, refetch } = useSlots(pid, rid)
  const [filters, setFilters] = useState<Filters>({ io: null, kind: 'all', query: '' })
  const [sort, setSort] = useState<SortKey>('position')
  const [sel, setSel] = useState<Slot | undefined>()
  const scroller = useRef<HTMLDivElement>(null)

  const used = useMemo(() => slots.filter((s) => s.kind !== 'empty'), [slots])
  const rows = useMemo(() => sortSlots(used.filter((s) => matchesFilters(s, filters)), sort), [used, filters, sort])
  // oxlint-disable-next-line react/incompatible-library -- the virtualizer's functions are only used in this component
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 12, initialRect: { width: 1000, height: 600 } })

  if (error) return <ErrorPanel error={error} onRetry={refetch} />
  if (loading || !allocation) return <p className="p-8 text-[13px] text-fg-muted">Loading allocation…</p>

  const head = (key: SortKey | null, label: string, right?: boolean) => (
    <button type="button" disabled={!key} onClick={() => key && setSort(key)} className={cn('px-2 py-2 text-left text-xs font-normal', right && 'text-right', key && 'hover:text-fg', sort === key ? 'text-fg' : 'text-fg-subtle')} aria-sort={sort === key ? 'ascending' : undefined}>
      {label}
    </button>
  )

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_320px]">
      <div className="flex min-h-0 min-w-0 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input aria-label="Search tag, cable or group" className={cn(inputClass, 'h-9 w-64 pl-8 text-[13px]')} placeholder="Tag, cable or group" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
          </label>
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by IO type">
            {IO_TYPES.map((t: Io) => (
              <button key={t} aria-pressed={filters.io === t} onClick={() => setFilters({ ...filters, io: filters.io === t ? null : t })} className={cn('flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-xs transition-[background-color,border-color] duration-150 ease-out', filters.io === t ? 'border-fg-subtle bg-surface-3' : 'border-border hover:bg-surface-2')}>
                <span className={cn('size-2 rounded-sm', IO_BG[t])} />
                {t}
              </button>
            ))}
          </div>
          <select aria-label="Filter by kind" className="h-8 rounded-md border border-border-strong bg-surface-1 px-2 text-[13px]" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as Kind | 'all' })}>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k === 'all' ? 'All kinds' : KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-fg-muted tnum">
            {rows.length} of {used.length} positions
          </span>
        </div>

        {allocation.unplaced.length > 0 && (
          <details className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
            <summary className="cursor-pointer font-medium">{allocation.unplaced.length} signals held out</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {allocation.unplaced.slice(0, 50).map((u, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-xs">{u.signal.tag}</span>
                  <span className="text-fg-muted text-pretty">{u.issues.map((x) => x.message).join('; ')}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-card">
          <div ref={scroller} className="h-full overflow-auto overscroll-contain" role="table" aria-label="Allocation" aria-rowcount={rows.length}>
            <div role="row" className={cn('sticky top-0 z-10 grid border-b border-border bg-surface-2', COLS)}>
              {head('tag', 'Tag')}
              {head('io', 'IO')}
              {head(null, 'Kind')}
              {head('cable', 'Cable · pair')}
              {head(null, 'Cab', true)}
              {head('position', 'CIOC', true)}
              {head(null, 'BP', true)}
              {head(null, 'CH', true)}
              {head(null, 'CHARM', true)}
            </div>
            {rows.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-fg-muted">No position matches these filters.</p>
            ) : (
              <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
                {virt.getVirtualItems().map((v) => {
                  const s = rows[v.index]
                  return (
                    <div
                      key={`${s.cioc}:${s.bp}:${s.ch}`}
                      role="row"
                      aria-rowindex={v.index + 2}
                      tabIndex={0}
                      onClick={() => setSel(s)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(s))}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW, transform: `translateY(${v.start}px)` }}
                      className={cn('grid cursor-pointer items-center border-b border-border text-[13px] transition-[background-color] duration-150 ease-out hover:bg-surface-2', COLS, sel === s && 'bg-accent-soft')}
                    >
                      <span role="cell" className="truncate px-2 font-mono text-xs">{s.tag ?? <span className="text-fg-subtle">–</span>}</span>
                      <span role="cell" className="px-2 font-mono text-xs">{s.io ?? '–'}</span>
                      <span role="cell" className="truncate px-2 text-xs text-fg-muted">{KIND_LABEL[s.kind]}</span>
                      <span role="cell" className="truncate px-2 font-mono text-xs">{s.cable ?? '–'}{s.pair != null ? ` · ${s.pair}` : ''}</span>
                      <span role="cell" className="px-2 text-right tnum">{s.cab}</span>
                      <span role="cell" className="px-2 text-right tnum">{s.cioc}</span>
                      <span role="cell" className="px-2 text-right tnum">{s.bp}</span>
                      <span role="cell" className="px-2 text-right tnum">{s.ch}</span>
                      <span role="cell" className="px-2 text-right tnum text-fg-muted">{charmNo(s.bp, s.ch)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <SlotInspector slot={sel} rows={allocation.rows} onClose={() => setSel(undefined)} />
    </div>
  )
}
