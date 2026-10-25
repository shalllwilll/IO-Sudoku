import { Box } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CharmCell } from '@/components/charm/CharmCell'
import { IO_BG, KIND_LABEL } from '@/components/charm/kinds'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { BASEPLATES, CABINETS, CIOCS_PER_CABINET, CHANNELS, charmNo, count, inCabinet, IO_TYPES, type Io, type Slot } from '@/preview/mock'

const TABS = ['Overview', 'Allocation', 'Layout', 'TQs', 'Downloads']

const EXPLAIN: Record<Slot['kind'], string> = {
  field: 'A field signal placed by the solver and checked by the validator.',
  wired_spare: 'CHARM and terminal block installed. Taken from a declared unused pair to meet the 10% spare rule; confirm it is wired (TQ-SPARE).',
  spare_slot: 'Declared cable pair, protected so nothing else takes it. No CHARM installed.',
  cabinet_alarm: 'Cabinet alarm, on the reserved first baseplate of the cabinet.',
  empty: 'Unused position.',
}

function Field({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className={cn('text-[13px]', mono && 'font-mono tnum')}>{value ?? '–'}</dd>
    </div>
  )
}

function CiocCard({ cioc, cells, pick, selected, filter }: { cioc: number; cells: Slot[]; pick: (s: Slot) => void; selected?: Slot; filter: Io | null }) {
  const used = cells.filter((s) => s.kind === 'field' || s.kind === 'wired_spare').length
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-2 shadow-card" aria-label={`CIOC ${cioc}`}>
      <header className="flex items-baseline justify-between px-2 py-1.5">
        <h3 className="text-[13px] font-medium">CIOC {cioc}</h3>
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
                  <CharmCell
                    key={s.ch}
                    slot={s}
                    selected={selected === s}
                    dimmed={filter !== null && s.io !== filter}
                    onSelect={pick}
                  />
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

export default function Layout() {
  const nav = useNavigate()
  const [cab, setCab] = useState(1)
  const [filter, setFilter] = useState<Io | null>(null)
  const [sel, setSel] = useState<Slot | undefined>()
  const cells = useMemo(() => inCabinet(cab), [cab])
  const ciocs = Array.from({ length: CIOCS_PER_CABINET }, (_, i) => (cab - 1) * CIOCS_PER_CABINET + i + 1)

  return (
    <Shell crumbs={['Projects', 'Unit 100 allocation', 'Results']}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-border px-6">
          {TABS.map((t) => (
            <span
              key={t}
              aria-current={t === 'Layout' ? 'page' : undefined}
              className={cn(
                'relative flex h-11 items-center px-3 text-[13px]',
                t === 'Layout' ? 'text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-fg-muted',
              )}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_320px]">
          <div className="min-w-0 overflow-auto p-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div role="tablist" aria-label="Cabinet" className="flex rounded-lg bg-surface-2 p-1">
                {Array.from({ length: CABINETS }, (_, i) => i + 1).map((c) => (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={c === cab}
                    onClick={() => setCab(c)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-[13px] transition-[background-color,color,box-shadow] duration-150 ease-out',
                      c === cab ? 'bg-surface-1 text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    Cabinet {c}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5" role="group" aria-label="Filter by IO type">
                {IO_TYPES.map((t) => (
                  <button
                    key={t}
                    aria-pressed={filter === t}
                    onClick={() => setFilter(filter === t ? null : t)}
                    className={cn(
                      'flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-xs transition-[background-color,border-color] duration-150 ease-out',
                      filter === t ? 'border-fg-subtle bg-surface-3' : 'border-border hover:bg-surface-2',
                    )}
                  >
                    <span className={cn('size-2 rounded-sm', IO_BG[t])} />
                    {t}
                    <span className="text-fg-subtle tnum">{count((s) => s.io === t && s.kind === 'field')}</span>
                  </button>
                ))}
              </div>
              <Button className="ml-auto" icon={<Box size={15} strokeWidth={1.75} />} onClick={() => nav('/preview/plant')}>
                View in 3D
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {ciocs.map((c) => (
                <CiocCard key={c} cioc={c} cells={cells.filter((s) => s.cioc === c)} pick={setSel} selected={sel} filter={filter} />
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
          <aside
            aria-label="Slot inspector"
            className={cn(
              'overflow-auto border-border bg-surface-1 p-5 overscroll-contain xl:static xl:block xl:border-l',
              // Below xl the inspector is a bottom sheet that only exists while a slot is selected.
              'max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-40 max-xl:max-h-[55%] max-xl:rounded-t-xl max-xl:border-t max-xl:shadow-float',
              !sel && 'max-xl:hidden',
            )}
          >
            {sel ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-fg-muted">Slot</span>
                  <button className="rounded px-1.5 text-xs text-fg-muted hover:text-fg xl:hidden" onClick={() => setSel(undefined)}>
                    Close
                  </button>
                </div>
                <h2 className="font-mono text-[15px] font-medium tnum">CIOC {sel.cioc} · BP {sel.bp} · CH {sel.ch}</h2>
                <p className="mt-3 rounded-md bg-surface-2 p-3 text-xs text-fg-muted text-pretty">
                  <span className="mb-1 block text-[13px] font-medium text-fg">{KIND_LABEL[sel.kind]}</span>
                  {EXPLAIN[sel.kind]}
                </p>
                <dl className="mt-4">
                  <Field label="Tag" value={sel.tag} mono />
                  <Field label="IO type" value={sel.io} mono />
                  <Field label="Cable" value={sel.cable} mono />
                  <Field label="Pair" value={sel.pair} mono />
                  <Field label="Segregation" value={sel.seg} />
                  <Field label="CHARM_No" value={charmNo(sel.bp, sel.ch)} mono />
                  <Field label="Cabinet" value={sel.cab} mono />
                </dl>
              </>
            ) : (
              <div className="grid h-full place-items-center text-center text-[13px] text-fg-subtle text-pretty">
                Select a slot to see its signal, cable pair and why it is there.
              </div>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  )
}
