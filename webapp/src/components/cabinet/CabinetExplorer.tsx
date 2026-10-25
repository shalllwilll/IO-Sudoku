import { Box, ChevronRight, CircleHelp, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CharmCell } from '@/components/charm/CharmCell'
import { IO_BG, KIND_LABEL } from '@/components/charm/kinds'
import { SlotInspector } from '@/components/results/SlotInspector'
import { cn } from '@/lib/cn'
import { BASEPLATES, CHANNELS, IO_TYPES, type Io } from '@/lib/hierarchy'
import { type Slot } from '@/lib/results'
import type { Allocation, LayoutData } from '@/api/queries'

interface Props {
  pid: string
  layout: LayoutData['layout']
  allocation: Allocation
  slots: Slot[]
  /** `source_file:source_row` keys of signals with an open technical query. */
  tqKeys: Set<string>
}

const used = (s: Slot) => s.kind === 'field' || s.kind === 'wired_spare' || s.kind === 'cabinet_alarm'
const signalKey = (s: Slot) => {
  const sig = s.placement?.signal
  return sig ? `${sig.source_file ?? '?'}:${sig.source_row}` : null
}

function Mini({ cells, filter, tq }: { cells: Slot[]; filter: (s: Slot) => boolean; tq: (s: Slot) => boolean }) {
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${CHANNELS}, 7px)` }} aria-hidden>
      {cells.map((s, i) => (
        <span
          key={i}
          className={cn(
            'size-[7px] rounded-[2px]',
            s.kind === 'field' && s.io ? IO_BG[s.io] : s.kind === 'wired_spare' && s.io ? cn('opacity-40', IO_BG[s.io]) : s.kind === 'cabinet_alarm' ? 'bg-fg-muted' : s.kind === 'spare_slot' ? 'border border-dashed border-fg-subtle' : 'bg-surface-3',
            tq(s) && 'ring-1 ring-danger',
            !filter(s) && 'opacity-15',
          )}
        />
      ))}
    </div>
  )
}

export function CabinetExplorer({ pid, layout, allocation, slots, tqKeys }: Props) {
  const cabinets = layout.cabinets ?? []
  const [cab, setCab] = useState<number | null>(null)
  const [cioc, setCioc] = useState<number | null>(null)
  const [io, setIo] = useState<Io | null>(null)
  const [onlyTq, setOnlyTq] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<Slot | undefined>()
  const [hover, setHover] = useState<Slot | null>(null)

  const active = cab ?? cabinets[0]?.no
  const ciocs = useMemo(() => (layout.ciocs ?? []).filter((c) => c.cabinet === active).sort((a, b) => a.no - b.no), [layout.ciocs, active])
  const hasTq = (s: Slot) => {
    const k = signalKey(s)
    return k !== null && tqKeys.has(k)
  }
  const q = query.trim().toLowerCase()
  const pass = (s: Slot) => {
    if (io && s.io !== io) return false
    if (onlyTq && !hasTq(s)) return false
    if (q && ![s.tag, s.cable, s.group].some((v) => v?.toLowerCase().includes(q))) return false
    return true
  }
  const filtering = io !== null || onlyTq || q !== ''
  const counts = useMemo(() => Object.fromEntries(IO_TYPES.map((t) => [t, slots.filter((s) => s.io === t && s.kind === 'field').length])), [slots])
  const tqCount = useMemo(() => slots.filter(hasTq).length, [slots, tqKeys]) // eslint-disable-line
  const heldOut = allocation.unplaced.length
  const current = cioc !== null ? ciocs.find((c) => c.no === cioc) : undefined
  const cabinet = cabinets.find((c) => c.no === active)

  return (
    <div className="min-h-0 flex-1">
      <div className="min-w-0 overflow-auto p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <nav aria-label="Location" className="flex items-center gap-1 text-[13px]">
            <button type="button" className={cn('rounded px-1.5 py-0.5', current ? 'text-fg-muted hover:bg-surface-2' : 'font-medium')} onClick={() => { setCioc(null); setSel(undefined) }}>
              {cabinet ? `Cabinet ${cabinet.no}` : 'Cabinet'}
            </button>
            {current && (
              <>
                <ChevronRight size={14} className="text-fg-subtle" />
                <span className="px-1.5 font-medium">CIOC {current.no}</span>
              </>
            )}
          </nav>
          {cabinets.length > 1 && (
            <div role="tablist" aria-label="Cabinet" className="flex rounded-lg bg-surface-2 p-1">
              {cabinets.map((c) => (
                <button key={c.no} role="tab" aria-selected={c.no === active} onClick={() => { setCab(c.no); setCioc(null) }} className={cn('rounded-md px-3 py-1 text-[13px] transition-[background-color,color,box-shadow] duration-150 ease-out', c.no === active ? 'bg-surface-1 text-fg shadow-card' : 'text-fg-muted hover:text-fg')}>
                  Cabinet {c.no}
                </button>
              ))}
            </div>
          )}
          <Link to={`/projects/${pid}/runs/${allocation.run_id}/plant`} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-[13px] font-medium text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg"><Box size={15} strokeWidth={1.75} /> Open 3D view</Link>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by IO type">
            {IO_TYPES.map((t) => (
              <button key={t} aria-pressed={io === t} onClick={() => setIo(io === t ? null : t)} className={cn('flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-xs transition-[background-color,border-color] duration-150 ease-out', io === t ? 'border-fg-subtle bg-surface-3' : 'border-border hover:bg-surface-2')}>
                <span className={cn('size-2 rounded-sm', IO_BG[t])} />
                {t}
                <span className="text-fg-subtle tnum">{counts[t]}</span>
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={onlyTq} onClick={() => setOnlyTq(!onlyTq)} className={cn('flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-[background-color,border-color] duration-150 ease-out', onlyTq ? 'border-danger bg-danger/10' : 'border-border hover:bg-surface-2')}>
            <span className="size-2 rounded-full bg-danger" /> Open questions <span className="text-fg-subtle tnum">{tqCount}</span>
          </button>
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs focus-within:border-accent">
            <Search size={13} className="text-fg-subtle" />
            <input aria-label="Search tag or cable" placeholder="Tag or cable" value={query} onChange={(e) => setQuery(e.target.value)} className="w-32 bg-transparent outline-none placeholder:text-fg-subtle" />
          </label>
          {heldOut > 0 && (
            <Link to={`/projects/${pid}/tqs`} className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-warning/15 px-2.5 text-xs text-warning hover:bg-warning/25">
              <CircleHelp size={13} /> {heldOut} held out. Resolve
            </Link>
          )}
        </div>

        {current === undefined ? (
          <section aria-label="Cabinet front" className="mx-auto max-w-4xl">
            <div className="rounded-xl border border-border-strong bg-surface-2 p-4 shadow-card">
              <p className="mb-3 font-mono text-xs text-fg-muted">{cabinet?.name}</p>
              <ul className="flex flex-col gap-3">
                {ciocs.map((c) => {
                  const cells = slots.filter((s) => s.cioc === c.no)
                  const n = cells.filter(used).length
                  const pins = cells.filter(hasTq).length
                  return (
                    <li key={c.no}>
                      <button type="button" aria-label={`Open CIOC ${c.no}`} onClick={() => setCioc(c.no)} className="flex w-full items-center gap-4 rounded-lg border border-border bg-surface-1 p-3 text-left shadow-card transition-[background-color,box-shadow] duration-150 ease-out hover:bg-surface-2">
                        <div className="w-28 shrink-0">
                          <div className="text-[13px] font-medium">CIOC {c.no}</div>
                          <div className="font-mono text-[11px] text-fg-subtle">{c.name}</div>
                          <div className="mt-1 text-xs text-fg-muted tnum">{n} / {BASEPLATES * CHANNELS} used</div>
                          {pins > 0 && <div className="mt-1 flex items-center gap-1 text-xs text-danger"><span className="size-1.5 rounded-full bg-danger" /> {pins} open</div>}
                        </div>
                        <Mini cells={cells} filter={(s) => !filtering || pass(s)} tq={hasTq} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <p className="mt-3 text-center text-xs text-fg-subtle">Schematic view. Each square is one CHARM position. Select a CIOC to open it.</p>
          </section>
        ) : (
          <section aria-label={`CIOC ${current.no}`} className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-2">
              {Array.from({ length: BASEPLATES }, (_, i) => i + 1).map((bp) => {
                const row = slots.filter((s) => s.cioc === current.no && s.bp === bp)
                const reserved = row[0]?.reserved
                return (
                  <div key={bp} className={cn('flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2 shadow-card', reserved === 'spare' && 'pat-reserved')}>
                    <span className="w-12 font-mono text-[11px] text-fg-subtle">{row[0]?.bpName ?? `BP${bp}`}</span>
                    <div className="flex gap-1.5">
                      {row.map((s) => (
                        <CharmCell key={s.ch} slot={s} size={28} selected={sel === s} pin={hasTq(s)} dimmed={filtering && !pass(s)} onSelect={setSel} onHover={setHover} />
                      ))}
                    </div>
                    {reserved && <span className="ml-auto text-[11px] text-fg-subtle">{reserved === 'alarm' ? 'alarms' : 'reserved'}</span>}
                  </div>
                )
              })}
            </div>
            <p aria-live="polite" className="mt-4 h-5 text-center text-xs text-fg-muted">
              {hover ? `${hover.tag ?? KIND_LABEL[hover.kind]}${hover.cable ? ' · cable ' + hover.cable : ''}${hover.io ? ' · ' + hover.io : ''} · BP${hover.bp} ch${hover.ch}` : 'Hover or select a CHARM for details'}
            </p>
          </section>
        )}

        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-muted" aria-label="Legend">
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] bg-io-air" />Field signal</li>
          <li className="flex items-center gap-2"><span className="grid size-3.5 place-items-center rounded-[4px] border-2 border-io-air"><span className="size-1 rounded-full bg-io-air" /></span>Wired spare</li>
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] border border-dashed border-fg-subtle" />Spare slot</li>
          <li className="flex items-center gap-2"><span className="size-3.5 rounded-[4px] bg-fg-muted pat-alarm" />Cabinet alarm</li>
          <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger" />Open question</li>
        </ul>
      </div>
      {sel && <SlotInspector slot={sel} rows={allocation.rows} onClose={() => setSel(undefined)} />}
    </div>
  )
}
