import { AlertCircle, ArrowRight, Check, ChevronDown, CircleHelp, Info, Play } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useAnswerTq, useBulkAnswer, useRules, useRuns, useStartRun, useTqGroups, useTqPlacements, type GroupOption, type TqGroup } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { usePending } from '@/state/pending'
import { useSession } from '@/state/session'

const PRIORITY = {
  P1: { icon: AlertCircle, cls: 'text-danger', chip: 'bg-danger/15 text-danger', label: 'Blocks placement' },
  P2: { icon: CircleHelp, cls: 'text-warning', chip: 'bg-warning/15 text-warning', label: 'Assumed' },
  P3: { icon: Info, cls: 'text-fg-muted', chip: 'bg-surface-3 text-fg-muted', label: 'For information' },
} as const

/** Options that only need a single picked value can be answered right here; the rest go to the detailed view. */
const needs = (o: GroupOption) => o.needs ?? []
const choices = (o: GroupOption) => o.choices ?? []
const simple = (o: GroupOption) => needs(o).length === 0 || (needs(o).length === 1 && needs(o)[0] === 'value' && choices(o).length > 0)

const effectText = (o: GroupOption) => (o.changes_allocation ? 'Changes the allocation on the next run' : 'Records your decision; the layout stays as it is')

/** Lets the operator move one held-out cable into a legal slot, or shows exactly which rule blocks every slot. */
function PlaceFix({ pid, g }: { pid: string; g: TqGroup }) {
  const author = useSession((s) => s.name) || 'engineer'
  const mark = usePending((s) => s.mark)
  const runs = useRuns(pid)
  const rules = useRules(pid)
  const answer = useAnswerTq(pid)
  const bulk = useBulkAnswer(pid)
  const rid = [...(runs.data ?? [])].reverse().find((r) => r.status === 'finished')?.id
  const cables = (g.cables ?? []).filter((c) => c.open)
  const [sel, setSel] = useState<string | null>(cables[0]?.tq_id ?? null)
  const [pick, setPick] = useState(0)
  const p = useTqPlacements(pid, rid, sel)
  const cable = cables.find((c) => c.tq_id === sel)
  const name = (id: string): string => String(rules.data?.rules.find((r) => r.id === id)?.name ?? id)
  const blockers = Object.entries(p.data?.blockers ?? {}).sort((a, b) => b[1] - a[1])
  const cands = p.data?.candidates ?? []
  const place = () => {
    const c = cands[pick]
    if (!c || !cable) return
    answer.mutate(
      { tid: cable.tq_id, body: { option: 'Place it in a chosen slot', scope: 'cable', target: cable.cable, author, fields: { cioc: c.cioc_no, cells: c.cells } } },
      { onSuccess: () => mark(pid) },
    )
  }
  if (cables.length === 0) return null
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3" aria-label="Place a cable">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">Move a cable into a free slot</span>
        <select aria-label="Cable" className={cn(inputClass, 'ml-auto h-8 w-52 font-mono text-xs')} value={sel ?? ''} onChange={(e) => { setSel(e.target.value); setPick(0) }}>
          {cables.map((c) => <option key={c.tq_id} value={c.tq_id}>{c.cable} · {c.signals} signals</option>)}
        </select>
      </div>
      {p.isLoading && <p className="mt-2 text-xs text-fg-muted">Checking every free position against your rules…</p>}
      {p.isError && <p role="alert" className="mt-2 text-xs text-danger">{describeError(p.error)}</p>}
      {p.data && cands.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-fg-muted">{cands.length} legal {cands.length === 1 ? 'slot' : 'slots'} found. Each keeps every hard rule.</p>
          <ul role="radiogroup" aria-label="Legal slots" className="flex flex-col gap-1">
            {cands.map((c, i) => (
              <li key={c.summary}>
                <label className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px]', pick === i ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-3')}>
                  <input type="radio" name="slot" checked={pick === i} onChange={() => setPick(i)} className="accent-[var(--color-accent)]" />
                  <span className="font-mono text-xs">{c.summary}</span>
                  {c.same_group && <span className="ml-auto rounded bg-success/15 px-1.5 text-[11px] text-success">Next to its group</span>}
                </label>
              </li>
            ))}
          </ul>
          {answer.isSuccess && answer.variables?.tid === sel ? (
            <p className="flex items-center gap-1.5 text-[13px] text-success"><Check size={14} strokeWidth={2} /> Saved. Re-run to place it there.</p>
          ) : (
            <Button variant="primary" className="self-start" disabled={answer.isPending} onClick={place}>{answer.isPending ? 'Saving…' : 'Verify and place here'}</Button>
          )}
          {answer.isError && <p role="alert" className="text-xs text-danger">{describeError(answer.error)}</p>}
        </div>
      )}
      {p.data && cands.length === 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[13px] text-pretty">No free position is legal for this cable.{blockers.length > 0 ? ' Every position is rejected by:' : ` ${p.data.reason ?? ''}`}</p>
          {blockers.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {blockers.map(([id, n]) => (
                <li key={id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-mono text-xs">{id}</span>
                  <span className="min-w-0 flex-1 text-xs text-fg-muted text-pretty">{name(id)} · rejected {n} {n === 1 ? 'position' : 'positions'}</span>
                  <Button disabled={bulk.isPending || bulk.isSuccess} onClick={() => bulk.mutate({ tq_ids: g.open_ids, option: 'Waive the rule', fields: { rule: id }, scope: 'everywhere', author }, { onSuccess: (r) => { for (let i = 0; i < r.answered.length; i++) mark(pid) } })}>
                    {bulk.isSuccess ? 'Waived' : `Waive ${id}`}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-fg-subtle text-pretty">Waiving a rule stops enforcing it everywhere in this project on the next run, and is recorded in the report.</p>
          {bulk.isError && <p role="alert" className="text-xs text-danger">{describeError(bulk.error)}</p>}
        </div>
      )}
    </div>
  )
}

function Group({ pid, g }: { pid: string; g: TqGroup }) {
  const P = PRIORITY[g.priority]
  const author = useSession((s) => s.name) || 'engineer'
  const mark = usePending((s) => s.mark)
  const answer = useBulkAnswer(pid)
  const [more, setMore] = useState(false)
  const [details, setDetails] = useState(false)
  const [picked, setPicked] = useState<string>('')
  const [value, setValue] = useState('')
  const done = g.status === 'answered'

  const apply = (option: GroupOption, v?: string) =>
    answer.mutate(
      { tq_ids: g.open_ids, option: option.label, scope: 'everywhere', author, ...(v ? { value: v } : {}) },
      { onSuccess: (r) => { if (option.changes_allocation) for (let i = 0; i < r.answered.length; i++) mark(pid) } },
    )
  const rec = g.recommended ? g.options.find((o) => o.label === g.recommended!.option) : undefined
  const chosen = g.options.find((o) => o.label === picked)
  const failed = answer.data?.failed ?? []
  const samples = g.samples ?? []

  return (
    <li className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <P.icon size={16} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', P.cls)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-[14px] font-medium text-pretty">{g.title}</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', P.chip)}>{P.label}</span>
            <span className="font-mono text-[11px] text-fg-subtle">{g.code}</span>
          </div>
          <p className="mt-1 text-[13px] text-fg-muted text-pretty">{g.why}</p>
          <p className="mt-1 text-xs text-fg-muted tnum">
            {g.signals} {g.signals === 1 ? 'signal' : 'signals'} · {g.tq_ids.length} {g.tq_ids.length === 1 ? 'question' : 'questions'}
          </p>
        </div>
      </div>

      {done ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-success"><Check size={14} strokeWidth={2} /> Answered</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {rec && g.recommended && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={answer.isPending} onClick={() => apply(rec)}>
                {answer.isPending ? 'Applying…' : rec.label}
              </Button>
              <span className="min-w-0 flex-1 text-xs text-fg-muted text-pretty">
                {g.recommended.reason} {effectText(rec)}.
              </span>
            </div>
          )}
          {!rec && <p className="text-xs text-fg-muted text-pretty">No safe automatic answer. Choose how to resolve it.</p>}
          {g.can_place && <PlaceFix pid={pid} g={g} />}
          <div>
            <button type="button" aria-expanded={more} className="flex items-center gap-1 text-[13px] text-accent hover:underline" onClick={() => setMore((v) => !v)}>
              {rec ? 'Choose another answer' : 'Choose an answer'}
              <ChevronDown size={13} strokeWidth={1.75} className={cn('transition-[rotate] duration-150 ease-out', more && 'rotate-180')} />
            </button>
            {more && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {g.options.filter((o) => o.label !== rec?.label && o.effect !== 'place').map((o) => (
                  <li key={o.label} className="rounded-md border border-border p-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[13px] font-medium">{o.label}</span>
                      <span className="min-w-0 flex-1 text-xs text-fg-muted text-pretty">{o.consequence}. {effectText(o)}.</span>
                      {simple(o) && needs(o).length === 0 && <Button disabled={answer.isPending} onClick={() => apply(o)}>Apply</Button>}
                      {simple(o) && needs(o).length > 0 && <Button onClick={() => { setPicked(o.label); setValue('') }}>Pick value</Button>}
                      {!simple(o) && <Link to={`/projects/${pid}/tqs?all=1`} className="text-xs text-accent hover:underline">Needs details</Link>}
                    </div>
                    {chosen?.label === o.label && (
                      <div className="mt-2 flex items-center gap-2">
                        <select aria-label={`Value for ${o.label}`} className={cn(inputClass, 'h-9 w-48')} value={value} onChange={(e) => setValue(e.target.value)}>
                          <option value="">Choose…</option>
                          {choices(o).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <Button variant="primary" disabled={!value || answer.isPending} onClick={() => apply(o, value)}>Apply to all {g.signals}</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {answer.isError && <p role="alert" className="mt-2 text-xs text-danger">{describeError(answer.error)}</p>}
      {failed.length > 0 && <p role="alert" className="mt-2 text-xs text-danger">{failed.length} could not be answered: {failed[0].error}</p>}

      <button type="button" aria-expanded={details} className="mt-3 text-xs text-fg-muted hover:text-fg" onClick={() => setDetails((v) => !v)}>
        {details ? 'Hide' : 'Show'} what was found
      </button>
      {details && (
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-fg-muted">
          {samples.map((s) => <li key={s} className="break-words text-pretty">{s}</li>)}
          {g.tq_ids.length > samples.length && <li>and {g.tq_ids.length - samples.length} more like these</li>}
        </ul>
      )}
    </li>
  )
}

export function ResolutionCenter({ pid }: { pid: string }) {
  const nav = useNavigate()
  const q = useTqGroups(pid)
  const pending = usePending((s) => s.changed[pid] ?? 0)
  const clear = usePending((s) => s.clear)
  const start = useStartRun(pid)
  const groups = q.data ?? []
  const open = groups.filter((g) => g.status !== 'answered')
  const rerun = () =>
    start.mutate({}, { onSuccess: (r) => { clear(pid); nav(`/projects/${pid}/run?run=${r.id}`) } })

  if (q.isPending) return <p className="p-8 text-[13px] text-fg-muted">Loading…</p>
  if (q.isError) return <p role="alert" className="p-8 text-[13px] text-danger">{describeError(q.error)}</p>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Resolve</h1>
        <p className="mt-1 text-[13px] text-fg-muted text-pretty tnum">
          {open.length === 0 ? 'Nothing is waiting on you.' : `${open.length} ${open.length === 1 ? 'issue needs' : 'issues need'} a decision, most urgent first.`}
        </p>
      </div>
      {pending > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-[13px]">
          <span className="text-pretty">{pending} {pending === 1 ? 'answer changes' : 'answers change'} the allocation. Re-run to see the effect.</span>
          <Button variant="primary" className="ml-auto" icon={<Play size={14} strokeWidth={1.75} />} disabled={start.isPending} onClick={rerun}>
            {start.isPending ? 'Starting…' : 'Re-run now'}
          </Button>
        </div>
      )}
      {start.isError && <p role="alert" className="text-[13px] text-danger">{describeError(start.error)}</p>}
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-8 text-[13px] text-fg-muted">No questions. They appear when a run finds something it should not guess.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => <Group key={g.key} pid={pid} g={g} />)}
        </ul>
      )}
      <Link to={`/projects/${pid}/tqs?all=1`} className="inline-flex items-center gap-1 self-start text-[13px] text-accent hover:underline">
        See every question <ArrowRight size={13} strokeWidth={1.75} />
      </Link>
    </div>
  )
}
