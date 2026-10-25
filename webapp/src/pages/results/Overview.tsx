import { Check, ChevronDown, CircleAlert, CircleCheck, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useReport } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { IO_BG } from '@/components/charm/kinds'
import { cn } from '@/lib/cn'
import { IO_TYPES } from '@/lib/hierarchy'
import { percent } from '@/lib/results'

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tnum">{value}</div>
      <div className="text-xs text-fg-subtle">{hint}</div>
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export default function Overview() {
  const { pid = '', rid = '' } = useParams()
  const q = useReport(pid, rid)
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <p className="p-8 text-[13px] text-fg-muted">Loading report…</p>
  const { kpi, rules, declaration } = q.data.report
  const failing = rules.filter((r) => !r.passed && r.enforced)
  const maxIo = Math.max(1, ...IO_TYPES.map((t) => (kpi.by_io_type[t]?.field ?? 0) + (kpi.by_io_type[t]?.wired_spare ?? 0)))
  const notes = [
    ['Assumed', declaration.assumed ?? []],
    ['Defaulted', declaration.defaulted ?? []],
    ['Not enforced', declaration.not_enforced ?? []],
  ] as const

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-6">
      <section className={cn('flex flex-wrap items-center gap-4 rounded-xl border p-5', kpi.held_out || failing.length ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10')}>
        {kpi.held_out || failing.length ? <CircleAlert size={22} className="text-warning" /> : <CircleCheck size={22} className="text-success" />}
        <div className="min-w-0 flex-1"><h1 className="text-lg font-semibold tracking-tight">{kpi.held_out ? 'Allocation needs decisions' : 'Allocation is ready'}</h1><p className="mt-1 text-[13px] text-fg-muted text-pretty">{kpi.held_out ? `${kpi.held_out} signals are held out until their assumptions are resolved.` : `All ${kpi.signals_total} signals are placed and the checked rules hold.`}</p></div>
        {kpi.held_out > 0 && <Link to={`/projects/${pid}/runs/${rid}/tqs`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[13px] font-medium text-accent-fg">Resolve decisions</Link>}
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Allocation" value={`${kpi.allocated} / ${kpi.signals_total}`} hint={kpi.held_out ? `${kpi.held_out} held out` : 'every signal placed'} />
        <Stat label="Capacity and spares" value={percent(kpi.utilisation, 1)} hint={`${kpi.occupied} of ${kpi.positions} positions · ${kpi.cabinets} cabinets`} />
        <Stat label="Rule health" value={failing.length === 0 ? 'Passed' : `${failing.length} need review`} hint={`${rules.filter((r) => r.passed).length} of ${rules.length} checks hold`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By IO type" hint="field signals and wired spares">
          <ul className="flex flex-col gap-3">
            {IO_TYPES.map((t) => {
              const f = kpi.by_io_type[t]?.field ?? 0
              const w = kpi.by_io_type[t]?.wired_spare ?? 0
              return (
                <li key={t} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 text-[13px]">
                  <span className="font-mono text-xs">{t}</span>
                  <span className="flex h-3 overflow-hidden rounded-[4px] bg-surface-2" aria-hidden>
                    <span className={cn('block h-full', IO_BG[t])} style={{ width: `${(f / maxIo) * 100}%` }} />
                    <span className={cn('block h-full opacity-45', IO_BG[t])} style={{ width: `${(w / maxIo) * 100}%` }} />
                  </span>
                  <span className="text-xs text-fg-muted tnum">
                    {f} field · {w} spare
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card title="Spares" hint="at least 10% of each IO type per controller">
          <table className="w-full text-left text-[13px]">
            <thead className="text-xs text-fg-subtle">
              <tr>
                <th className="py-1 font-normal">Controller</th>
                <th className="py-1 font-normal">IO</th>
                <th className="py-1 text-right font-normal">Field</th>
                <th className="py-1 text-right font-normal">Wired</th>
                <th className="py-1 text-right font-normal">Needed</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {kpi.spares.by_controller_io.map((r) => {
                const ok = r.wired_spares >= r.required
                return (
                  <tr key={`${r.controller}${r.io_type}`} className="border-t border-border">
                    <td className="py-1.5 font-mono text-xs">{r.controller}</td>
                    <td className="py-1.5 font-mono text-xs">{r.io_type}</td>
                    <td className="py-1.5 text-right tnum">{r.field_signals}</td>
                    <td className="py-1.5 text-right tnum">{r.wired_spares}</td>
                    <td className="py-1.5 text-right tnum">{r.required}</td>
                    <td className="py-1.5 text-right">{ok ? <Check size={14} strokeWidth={2} className="inline text-success" aria-label="Met" /> : <X size={14} strokeWidth={2} className="inline text-danger" aria-label="Short" />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {kpi.spares.cabinets.map((c) => (
            <p key={c.cabinet} className="mt-3 text-xs text-fg-muted tnum">
              <span className="font-mono">{c.cabinet}</span>: {c.empty_baseplates} empty baseplates (needs {c.required_empty_baseplates}), {c.free_slots_on_used_baseplates} free slots on used baseplates
            </p>
          ))}
        </Card>
      </div>

      <details className="group rounded-lg border border-border bg-surface-1 shadow-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-[13px] font-medium">Rule check <span className="text-xs font-normal text-fg-subtle">every rule, checked on the finished layout</span><ChevronDown size={15} className="ml-auto text-fg-muted transition-[rotate] duration-150 group-open:rotate-180" /></summary>
        <div className="border-t border-border px-4 pb-4">
        <ul>
          {rules.map((r) => (
            <li key={r.rule} className="flex items-start gap-3 border-b border-border py-2 last:border-0">
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', r.passed ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger')}>
                {r.passed ? <Check size={12} strokeWidth={2.5} aria-label="Passed" /> : <X size={12} strokeWidth={2.5} aria-label="Failed" />}
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-pretty">
                {r.description}
                <span className="ml-2 font-mono text-[11px] text-fg-subtle">{r.rule}</span>
              </span>
              <span className="text-xs capitalize text-fg-muted">{r.strength}</span>
              {r.violations > 0 && <span className="text-xs text-danger tnum">{r.violations} violations</span>}
            </li>
          ))}
        </ul>
        </div>
      </details>

      <details className="group rounded-lg border border-border bg-surface-1 shadow-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-[13px] font-medium">Assumptions and implementation notes <span className="text-xs font-normal text-fg-subtle">rule set: {declaration.rule_set}</span><ChevronDown size={15} className="ml-auto text-fg-muted transition-[rotate] duration-150 group-open:rotate-180" /></summary>
        <div className="border-t border-border p-4">
        <div className="grid gap-4 md:grid-cols-3">
          {notes.map(([label, items]) => (
            <div key={label}>
              <div className="mb-1 text-xs text-fg-muted">
                {label} <span className="tnum">({items.length})</span>
              </div>
              {items.length === 0 ? <p className="text-xs text-fg-subtle">None</p> : (
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {items.map((i) => (
                    <li key={i} className="text-pretty">{i}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        </div>
      </details>
    </div>
  )
}
