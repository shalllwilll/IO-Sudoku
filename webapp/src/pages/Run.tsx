import { animate } from 'motion/react'
import { Check, LoaderCircle, RotateCcw } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IO_BG } from '@/components/charm/kinds'
import { Shell } from '@/components/Shell'
import { StepRail, type Step } from '@/components/StepRail'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { count, slots, STAGES, type Slot } from '@/preview/mock'

const RUN_SECONDS = 5
const total = STAGES.reduce((a, s) => a + s.seconds, 0)
const bounds = STAGES.reduce<{ start: number; end: number }[]>((acc, s) => {
  const start = acc.length ? acc[acc.length - 1].end : 0
  return [...acc, { start, end: start + s.seconds / total }]
}, [])
const PACK_START = bounds[5].start
const FIELDS = count((s) => s.kind === 'field')
// cabinet -> CIOC -> positions, keeping each position's global index for the reveal order
const GRID = [1, 2, 3].map((cab) =>
  [1, 2, 3, 4].map((k) => {
    const cioc = (cab - 1) * 4 + k
    return slots.flatMap((s, i) => (s.cioc === cioc ? [{ s, i }] : []))
  }),
)

const steps: Step[] = [
  { id: 'data', label: 'Data', state: 'done' },
  { id: 'map', label: 'Map', state: 'done' },
  { id: 'values', label: 'Values', state: 'done' },
  { id: 'rules', label: 'Rules', state: 'done' },
  { id: 'run', label: 'Run', state: 'current' },
]

const dotClass = (s: Slot) =>
  s.kind === 'field' && s.io ? IO_BG[s.io] : s.kind === 'cabinet_alarm' ? 'bg-fg-muted' : s.kind === 'empty' ? 'bg-surface-3' : 'bg-fg-subtle'

const Dot = memo(function Dot({ slot, on }: { slot: Slot; on: boolean }) {
  return (
    <span
      className={cn(
        'size-[7px] rounded-[2px] transition-[opacity,background-color] duration-150 ease-out',
        on ? dotClass(slot) : 'bg-surface-3',
        on ? 'opacity-100' : 'opacity-40',
      )}
    />
  )
})

const EVENTS: { at: number; type: string; text: string }[] = [
  { at: 0, type: 'run.started', text: '1 upload' },
  ...STAGES.flatMap((s, i) => [
    { at: bounds[i].start, type: 'stage.started', text: s.id },
    { at: bounds[i].end, type: 'stage.finished', text: `${s.id} · ${s.seconds.toFixed(2)} s` },
  ]),
  { at: PACK_START + 0.04, type: 'group.formed', text: '21 affinity groups' },
  { at: 0.93, type: 'solver.status', text: 'cpsat · optimal' },
  { at: 0.95, type: 'spare.assigned', text: '17 wired · 64 protected' },
  { at: 0.96, type: 'tq.raised', text: 'TQ-SPARE · AIR spares assumed' },
  { at: 0.97, type: 'tq.raised', text: 'TQ-SPARE · DIR spares assumed' },
  { at: 0.98, type: 'validation.result', text: 'ok · 0 violations' },
  { at: 1, type: 'run.finished', text: `${FIELDS} placed · 0 held out` },
]

export default function Run() {
  const nav = useNavigate()
  const [p, setP] = useState(0)
  const [run, setRun] = useState(0)
  const done = p >= 1

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const c = animate(0, 1, { duration: reduce ? 0 : RUN_SECONDS, ease: 'linear', onUpdate: setP })
    return () => c.stop()
  }, [run])

  const placed = Math.floor(FIELDS * Math.min(1, Math.max(0, (p - PACK_START) / (1 - PACK_START))))
  const revealed = useMemo(() => Math.floor(slots.length * Math.min(1, Math.max(0, (p - PACK_START) / (1 - PACK_START)))), [p])
  const seen = EVENTS.filter((e) => e.at <= p)
  const tqs = seen.filter((e) => e.type === 'tq.raised').length

  return (
    <Shell crumbs={['Projects', 'Unit 100 allocation', 'Run']} rail={<StepRail steps={steps} />}>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Run</h1>
            <p className="text-fg-muted">Six stages, then a validator checks the result against the hard rules.</p>
          </div>
          <div className="flex gap-2">
            <Button icon={<RotateCcw size={15} strokeWidth={1.75} />} onClick={() => setRun((r) => r + 1)}>
              Replay
            </Button>
            <Button variant="primary" disabled={!done} onClick={() => nav('/layout')}>
              Open results
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            ['Placed', `${placed}`, `of ${FIELDS} field signals`],
            ['Held out', done ? '0' : '–', 'need an answer before placing'],
            ['TQs raised', `${tqs}`, 'assumptions for you to confirm'],
            ['Solver', p > 0.93 ? 'CP-SAT' : '–', p > 0.93 ? 'optimal' : 'working'],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
              <div className="text-xs text-fg-muted">{label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight tnum">{value}</div>
              <div className="text-xs text-fg-subtle">{hint}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[300px_1fr] gap-6">
          <ol className="flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-2 shadow-card" aria-label="Pipeline stages">
            {STAGES.map((s, i) => {
              const state = p >= bounds[i].end ? 'done' : p >= bounds[i].start ? 'active' : 'todo'
              return (
                <li key={s.id} className={cn('flex gap-3 rounded-md p-2.5', state === 'active' && 'bg-surface-2')}>
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                      state === 'done' && 'bg-success/20 text-success',
                      state === 'active' && 'text-accent',
                      state === 'todo' && 'border border-border-strong',
                    )}
                  >
                    {state === 'done' && <Check size={12} strokeWidth={2.5} />}
                    {state === 'active' && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />}
                  </span>
                  <div className="min-w-0">
                    <div className={cn('text-[13px] font-medium', state === 'todo' && 'text-fg-subtle')}>{s.label}</div>
                    <div className="text-xs text-fg-subtle">{s.detail}</div>
                  </div>
                  {state === 'done' && <span className="ml-auto font-mono text-xs text-fg-subtle tnum">{s.seconds.toFixed(2)}s</span>}
                </li>
              )
            })}
          </ol>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between text-xs text-fg-muted">
                <span>Placement</span>
                <span className="tnum">{revealed} / {slots.length} positions</span>
              </div>
              <div className="flex flex-col gap-3" aria-hidden>
                {GRID.map((cab, c) => (
                  <div key={c} className="flex items-start gap-3">
                    <span className="w-14 pt-0.5 font-mono text-[11px] text-fg-subtle">CAB {c + 1}</span>
                    <div className="flex gap-3">
                      {cab.map((cioc, k) => (
                        <div key={k} className="grid grid-cols-12 gap-[3px]">
                          {cioc.map(({ s, i }) => (
                            <Dot key={i} slot={s} on={i < revealed} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
                <span>Run events</span>
                <span>replayed at reading speed</span>
              </div>
              <ul className="flex min-h-[132px] flex-col gap-1 font-mono text-xs" aria-live="polite">
                {seen.slice(-6).map((e, i) => (
                  <li key={`${e.type}${e.text}${i}`} className="flex gap-3">
                    <span className="w-36 shrink-0 text-fg-subtle">{e.type}</span>
                    <span className={cn(e.type === 'tq.raised' ? 'text-warning' : 'text-fg-muted')}>{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
