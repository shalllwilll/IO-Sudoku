import { AlertTriangle, Check, CircleHelp, LoaderCircle, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PlacementGrid } from '@/components/run/PlacementGrid'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { STAGE_INFO, STAGE_ORDER, type RunView } from '@/lib/runStream'
import type { StreamStatus } from '@/lib/useRunStream'

const SOLVER_LABEL: Record<string, string> = { cpsat: 'CP-SAT', greedy: 'Greedy', qiga: 'QIGA', tq: 'Questions', rules: 'Rules', cache: 'Cache' }

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tnum">{value}</div>
      <div className="text-xs text-fg-subtle">{hint}</div>
    </div>
  )
}

export function RunProgress({ pid, rid, view, status, onReplay }: { pid: string; rid: string; view: RunView; status: StreamStatus; onReplay: () => void }) {
  const done = view.finished !== undefined
  const failed = view.error !== undefined
  const placed = view.counts.field + view.counts.cabinet_alarm
  const heldOut = view.rejections.reduce((n, r) => n + r.signals, 0)
  const lastSolver = view.solver.at(-1)
  const fell = view.fallbacks.length > 0
  const blocking = view.tqs.filter((t) => t.severity === 'blocking').length

  if (done) {
    const needsDecision = heldOut > 0 || blocking > 0
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-6">
        <section className={cn('flex flex-wrap items-center gap-4 rounded-xl border p-6', needsDecision ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10')}>
          {needsDecision ? <CircleHelp size={24} className="text-warning" /> : <ShieldCheck size={24} className="text-success" />}
          <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold tracking-tight">{needsDecision ? 'Allocation needs a decision' : 'Allocation completed successfully'}</h1><p className="mt-1 text-[13px] text-fg-muted text-pretty">{needsDecision ? `${placed} signals placed; ${heldOut} are waiting for a safe decision.` : `${placed} signals placed and every hard rule was validated.`}</p></div>
          <Link to={`/projects/${pid}/runs/${rid}${needsDecision ? '/tqs' : '/layout'}`} className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-[13px] font-medium text-accent-fg shadow-card">{needsDecision ? 'Resolve decisions' : 'Inspect allocation'}</Link>
        </section>
        <div className="grid gap-3 sm:grid-cols-3"><Stat label="Placed" value={String(placed)} hint={view.counts.wired_spare ? `plus ${view.counts.wired_spare} wired spares` : 'field signals and alarms'} /><Stat label="Held out" value={String(heldOut)} hint={heldOut ? 'need a decision' : 'nothing held back'} /><Stat label="Rule validation" value={view.validation?.ok ? 'Passed' : 'Review'} hint={view.validation?.ok ? 'every hard rule holds' : `${view.validation?.violations ?? 0} issue(s) found`} /></div>
        <details className="group rounded-lg border border-border bg-surface-1 shadow-card"><summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-[13px] font-medium">Run details <span className="text-xs font-normal text-fg-subtle">stages, solver and event log</span></summary><div className="border-t border-border p-4"><ol className="grid gap-2 sm:grid-cols-2">{STAGE_ORDER.map((id) => <li key={id} className="flex items-center gap-2 text-[13px]"><Check size={14} className="text-success" />{STAGE_INFO[id].label}<span className="ml-auto font-mono text-xs text-fg-subtle">{view.stages[id]?.reused ? 'reused' : `${(view.stages[id]?.seconds ?? 0).toFixed(2)}s`}</span></li>)}</ol></div></details>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Run</h1>
          <p className="text-fg-muted">
            {failed ? 'The run stopped with an error.' : done ? 'Finished. The validator has checked the result against the hard rules.' : status === 'polling' ? 'Live updates are unavailable; waiting for the run to finish.' : 'Six stages, then a validator checks the result against the hard rules.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onReplay}>Replay</Button>
          <Link to={`/projects/${pid}/run`} className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium transition-[background-color] duration-150 ease-out hover:bg-surface-3">
            New run
          </Link>
          <Link
            to={`/projects/${pid}/runs/${rid}`}
            aria-disabled={!done}
            tabIndex={done ? 0 : -1}
            className={cn('inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[13px] font-medium text-accent-fg shadow-card transition-[background-color,opacity] duration-150 ease-out hover:bg-accent-strong', !done && 'pointer-events-none opacity-50')}
          >
            Open results
          </Link>
        </div>
      </div>

      {failed && (
        <div role="alert" className="flex gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-[13px]">
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <div className="font-medium">{view.error!.code}</div>
            <div className="text-fg-muted text-pretty">{view.error!.message}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Placed" value={String(placed)} hint={view.counts.wired_spare ? `plus ${view.counts.wired_spare} wired spares` : 'field signals and alarms'} />
        <Stat label="Held out" value={done ? String(heldOut) : view.rejections.length ? String(heldOut) : '–'} hint="need an answer before placing" />
        <Stat label="TQs raised" value={String(view.tqs.length)} hint={blocking ? `${blocking} blocking` : 'assumptions to confirm'} />
        <Stat label="Solver" value={lastSolver ? (SOLVER_LABEL[lastSolver.solver] ?? lastSolver.solver) : '–'} hint={fell ? 'fell back' : (lastSolver?.status ?? 'working')} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <ol className="flex h-fit flex-col gap-1 rounded-lg border border-border bg-surface-1 p-2 shadow-card" aria-label="Pipeline stages">
          {STAGE_ORDER.map((id) => {
            const st = (view.stages[id]?.state ?? 'todo') as 'todo' | 'active' | 'done'
            const secs = view.stages[id]?.seconds
            return (
              <li key={id} className={cn('flex gap-3 rounded-md p-2.5', st === 'active' && 'bg-surface-2')}>
                <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', st === 'done' && 'bg-success/20 text-success', st === 'active' && 'text-accent', st === 'todo' && 'border border-border-strong')}>
                  {st === 'done' && <Check size={12} strokeWidth={2.5} />}
                  {st === 'active' && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />}
                </span>
                <div className="min-w-0">
                  <div className={cn('text-[13px] font-medium', st === 'todo' && 'text-fg-subtle')}>{STAGE_INFO[id].label}</div>
                  <div className="text-xs text-fg-subtle">{STAGE_INFO[id].detail}</div>
                </div>
                {st === 'done' && <span className="ml-auto font-mono text-xs text-fg-subtle tnum">{view.stages[id].reused ? 'reused' : `${(secs ?? 0).toFixed(2)}s`}</span>}
              </li>
            )
          })}
        </ol>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between text-xs text-fg-muted">
              <span>Placement</span>
              <span className="tnum">{view.cells.size} positions</span>
            </div>
            <PlacementGrid cells={view.cells} />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted" aria-label="Legend">
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-accent" />Field</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] border border-accent" />Wired spare</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] border border-dashed border-fg-subtle" />Spare slot</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-[2px] bg-fg-muted pat-alarm" />Cabinet alarm</li>
            </ul>
          </div>

          {view.fallbacks.map((f, i) => (
            <p key={i} className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
              <span className="text-pretty">{SOLVER_LABEL[f.solver] ?? f.solver} fell back: {f.reason}</span>
            </p>
          ))}

          {view.validation && (
            <div className={cn('flex gap-3 rounded-lg border p-3 text-[13px]', view.validation.ok ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10')}>
              {view.validation.ok ? <ShieldCheck size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" /> : <ShieldAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />}
              <div className="min-w-0">
                <div className="font-medium">{view.validation.ok ? 'Validator: every hard rule holds' : `Validator: ${view.validation.violations} violations`}</div>
                {view.validation.items.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-fg-muted">
                    {view.validation.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {view.rejections.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-1 p-3 shadow-card">
              <div className="mb-1.5 text-xs text-fg-muted">Held out</div>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {view.rejections.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-fg-subtle">{r.code}</span>
                    <span className="text-pretty">{r.message}</span>
                    <span className="ml-auto text-xs text-fg-muted tnum">{r.signals}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.tqs.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-1 p-3 shadow-card">
              <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
                <span>Questions raised</span>
                {done && (
                  <Link to={`/projects/${pid}/tqs`} className="text-accent hover:underline">
                    Resolve these
                  </Link>
                )}
              </div>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {view.tqs.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <CircleHelp size={14} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', t.severity === 'blocking' ? 'text-danger' : t.severity === 'assumed' ? 'text-warning' : 'text-fg-muted')} />
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-fg-subtle">{t.code}</span>
                    <span className="text-pretty">{t.message}</span>
                    <span className="ml-auto shrink-0 text-xs text-fg-muted tnum">{t.signals}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
              <span>Run events</span>
              <span>shown at reading pace</span>
            </div>
            <ul className="flex min-h-[132px] flex-col gap-1 font-mono text-xs" aria-live="polite">
              {view.log.slice(-6).map((e) => (
                <li key={e.seq} className="flex gap-3">
                  <span className="w-36 shrink-0 text-fg-subtle">{e.type}</span>
                  <span className={cn('truncate', e.type === 'tq.raised' ? 'text-warning' : 'text-fg-muted')}>{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
