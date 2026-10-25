import { AlertCircle, CheckCircle2, CircleHelp, Info, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Schemas } from '@/api/client'
import type { AnswerResult } from '@/api/queries'
import { AnswerForm } from '@/components/tq/AnswerForm'
import { inputClass } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { groupTqs, SEVERITY_ORDER, type TQ } from '@/lib/tq'
import { usePending } from '@/state/pending'

const SEV = {
  blocking: { icon: AlertCircle, cls: 'text-danger', label: 'Blocking' },
  assumed: { icon: CircleHelp, cls: 'text-warning', label: 'Assumed' },
  info: { icon: Info, cls: 'text-fg-muted', label: 'Info' },
} as const

type Status = 'open' | 'answered' | 'all'

function Detail({ pid, tq, history, onAnswered, onClose }: { pid: string; tq?: TQ; history: Schemas['Answer'][]; onAnswered: (r: AnswerResult) => void; onClose: () => void }) {
  return (
    <aside
      aria-label="Question detail"
      className={cn(
        'overflow-auto overscroll-contain border-border bg-surface-1 p-5 xl:static xl:block xl:border-l',
        'max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-40 max-xl:max-h-[80%] max-xl:rounded-t-xl max-xl:border-t max-xl:shadow-float',
        !tq && 'max-xl:hidden',
      )}
    >
      {tq ? (
        <div key={tq.id}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-fg-muted">{tq.code} · {tq.id}</span>
            <button className="rounded px-1.5 text-xs text-fg-muted hover:text-fg xl:hidden" onClick={onClose}>Close</button>
          </div>
          <h2 className="mt-2 text-[14px] font-medium text-pretty">{tq.message}</h2>
          <dl className="mt-3 text-[13px]">
            <div className="flex justify-between gap-4 border-b border-border py-2"><dt className="text-xs text-fg-muted">Source</dt><dd className="min-w-0 break-words text-right font-mono text-xs">{tq.subject}</dd></div>
            <div className="flex justify-between gap-4 border-b border-border py-2"><dt className="text-xs text-fg-muted">Affects</dt><dd className="tnum">{(tq.signal_keys ?? []).length} {(tq.signal_keys ?? []).length === 1 ? 'signal' : 'signals'}</dd></div>
            {tq.default_applied && <div className="flex justify-between gap-4 border-b border-border py-2"><dt className="shrink-0 text-xs text-fg-muted">Until you answer</dt><dd className="text-right text-pretty">{tq.default_applied}</dd></div>}
            {tq.answer && <div className="flex justify-between gap-4 py-2"><dt className="text-xs text-fg-muted">Current answer</dt><dd className="text-right font-medium text-success">{tq.answer}</dd></div>}
          </dl>
          {history.length > 0 && (
            <ul className="mt-2 text-xs text-fg-muted" aria-label="Answer history">
              {history.map((a) => (
                <li key={a.seq} className="py-0.5">
                  {a.author} chose “{a.option}”{a.value ? ` (${a.value})` : ''} · {a.scope}
                </li>
              ))}
            </ul>
          )}
          <AnswerForm pid={pid} tq={tq} onAnswered={onAnswered} />
        </div>
      ) : (
        <div className="grid h-full place-items-center text-center text-[13px] text-fg-subtle text-pretty">Select a question to see what it affects and answer it.</div>
      )}
    </aside>
  )
}

export function TqInbox({ pid, tqs, runLabel }: { pid: string; tqs: TQ[]; runLabel?: string }) {
  const pending = usePending((s) => s.changed[pid] ?? 0)
  const [status, setStatus] = useState<Status>('open')
  const [severity, setSeverity] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [histories, setHistories] = useState<Record<string, Schemas['Answer'][]>>({})

  const codes = useMemo(() => [...new Set(tqs.map((t) => t.code))].sort(), [tqs])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tqs.filter((t) => (status === 'all' || t.status === status) && (!severity || t.severity === severity) && (!code || t.code === code) && (!q || [t.message, t.subject, t.id].some((v) => v.toLowerCase().includes(q))))
  }, [tqs, status, severity, code, query])
  const groups = groupTqs(shown)
  const sel = tqs.find((t) => t.id === selId)
  const open = tqs.filter((t) => t.status === 'open').length

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-4 overflow-auto p-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{runLabel ?? 'Technical queries'}</h1>
          <p className="mt-1 text-[13px] text-fg-muted tnum">{open} open · {tqs.length - open} answered. Answers apply the next time you run.</p>
        </div>
        {pending > 0 && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[13px]">
            <span className="text-pretty">{pending} {pending === 1 ? 'answer changes' : 'answers change'} run inputs since your last run.</span>
            <Link to={`/projects/${pid}/run`} className="ml-auto font-medium text-accent hover:underline">Run again to apply</Link>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Status" className="flex rounded-lg bg-surface-2 p-1">
            {(['open', 'answered', 'all'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={cn('rounded-md px-3 py-1 text-[13px] capitalize transition-[background-color,color,box-shadow] duration-150 ease-out', status === s ? 'bg-surface-1 text-fg shadow-card' : 'text-fg-muted hover:text-fg')}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Severity">
            {SEVERITY_ORDER.map((s) => {
              const S = SEV[s]
              return (
                <button key={s} aria-pressed={severity === s} onClick={() => setSeverity(severity === s ? null : s)} className={cn('flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-[background-color,border-color] duration-150 ease-out', severity === s ? 'border-fg-subtle bg-surface-3' : 'border-border hover:bg-surface-2')}>
                  <S.icon size={13} strokeWidth={1.75} className={S.cls} />
                  {S.label}
                </button>
              )
            })}
          </div>
          <select aria-label="Filter by code" className="h-8 rounded-md border border-border-strong bg-surface-1 px-2 text-[13px]" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">All codes</option>
            {codes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="relative ml-auto">
            <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input aria-label="Search questions" className={cn(inputClass, 'h-8 w-52 pl-8 text-[13px]')} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {tqs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong p-8 text-[13px] text-fg-muted">No questions yet. They appear when a run finds something it should not guess.</p>
        ) : groups.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{status === 'open' && open === 0 ? 'Nothing is waiting on you.' : 'No question matches these filters.'}</p>
        ) : (
          groups.map((g) => (
            <section key={g.category} aria-label={g.category}>
              <h2 className="mb-2 text-[13px] font-medium capitalize">{g.category} <span className="font-normal text-fg-subtle tnum">{g.items.length}</span></h2>
              <ul className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-card">
                {g.items.map((t) => {
                  const S = SEV[t.severity]
                  return (
                    <li key={t.id} className="border-b border-border last:border-0">
                      <button type="button" aria-current={selId === t.id} onClick={() => setSelId(t.id)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-[background-color] duration-150 ease-out hover:bg-surface-2', selId === t.id && 'bg-accent-soft')}>
                        <S.icon size={15} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', S.cls)} aria-label={S.label} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-pretty">{t.message}</span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-fg-subtle">{t.code} · {t.subject}</span>
                        </span>
                        {t.status === 'answered' && <span className="flex shrink-0 items-center gap-1 text-xs text-success"><CheckCircle2 size={13} strokeWidth={1.75} />Answered</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
      <Detail
        pid={pid}
        tq={sel}
        history={sel ? (histories[sel.id] ?? []) : []}
        onClose={() => setSelId(null)}
        onAnswered={(r) => setHistories((h) => ({ ...h, [r.tq.id]: r.history }))}
      />
    </div>
  )
}
