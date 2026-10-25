import { Check, ChevronDown, CircleAlert, Play } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useMapping, useProject, useRefreshAfterRun, useRules, useRuns, useStartRun, useValues, type RunOptions } from '@/api/queries'
import { RunProgress } from '@/components/run/RunProgress'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { currentSelection, missingRequired } from '@/lib/mapping'
import { PRESETS } from '@/lib/presets'
import { useRunStream } from '@/lib/useRunStream'
import { usePending } from '@/state/pending'
import { undecided } from '@/lib/values'
import { useEffect, useRef } from 'react'

type Tri = 'default' | 'on' | 'off'
const tri = (v: Tri): boolean | null => (v === 'default' ? null : v === 'on')

function Check_({ ok, warn, title, detail, to }: { ok: boolean; warn?: boolean; title: string; detail: string; to: string }) {
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-[background-color] duration-150 ease-out hover:bg-surface-2">
        <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', ok ? 'bg-success/20 text-success' : warn ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger')}>
          {ok ? <Check size={12} strokeWidth={2.5} /> : <CircleAlert size={12} strokeWidth={2.5} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">{title}</span>
          <span className="block text-xs text-fg-muted text-pretty">{detail}</span>
        </span>
      </Link>
    </li>
  )
}

function Setup({ pid }: { pid: string }) {
  const nav = useNavigate()
  const project = useProject(pid)
  const hasData = (project.data?.uploads ?? 0) > 0
  const mapping = useMapping(pid, hasData)
  const values = useValues(pid, hasData)
  const rules = useRules(pid)
  const runs = useRuns(pid)
  const start = useStartRun(pid)
  const pending = usePending((s) => s.changed[pid] ?? 0)
  const clearPending = usePending((s) => s.clear)
  const [open, setOpen] = useState(false)
  const [cpsat, setCpsat] = useState<Tri>('default')
  const [qiga, setQiga] = useState<Tri>('default')
  const [seed, setSeed] = useState('')

  const missing = mapping.data ? mapping.data.sheets.flatMap((s) => missingRequired(currentSelection(s, mapping.data!.fields, mapping.data!.confirmed[s.file]), mapping.data!.required)) : []
  const open_ = values.data ? undecided(values.data.unknown, values.data.overrides).length : 0
  const presetLabel = rules.data ? (rules.data.custom ? 'Customised rules' : (PRESETS.find((p) => p.value === rules.data!.preset)?.label ?? rules.data.preset)) : '…'

  const go = () => {
    const body: RunOptions = { cpsat: tri(cpsat), qiga: tri(qiga), seed: seed.trim() === '' ? null : Number(seed) }
    start.mutate(body, {
      onSuccess: (r) => {
        clearPending(pid)
        nav(`?run=${r.id}`, { replace: true })
      },
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Allocate</h1>
        <p className="mt-1 text-[13px] text-fg-muted text-pretty">Start the allocation. Anything unclear becomes a question for you afterwards, never a silent guess.</p>
      </div>
      <ul className="rounded-lg border border-border bg-surface-1 p-1 shadow-card" aria-label="Before you start">
        {!hasData && <Check_ ok={false} title="Import" detail="Upload the signal list first" to={`/projects/${pid}/data`} />}
        {hasData && missing.length > 0 && <Check_ ok={false} warn title="Columns" detail={`Required fields not matched: ${[...new Set(missing)].join(', ')}`} to={`/projects/${pid}/map`} />}
        {hasData && open_ > 0 && <Check_ ok={false} warn title="Values" detail={`${open_} unrecognised ${open_ === 1 ? 'value' : 'values'} will become questions`} to={`/projects/${pid}/values`} />}
        {pending > 0 && <Check_ ok={false} warn title="Answers" detail={`${pending} ${pending === 1 ? 'answer' : 'answers'} given since the last run will apply now`} to={`/projects/${pid}/tqs`} />}
        {hasData && missing.length === 0 && open_ === 0 && pending === 0 && <Check_ ok title="Ready" detail={`${project.data?.uploads} ${project.data?.uploads === 1 ? 'file' : 'files'} imported · ${presetLabel} rules`} to={`/projects/${pid}/rules`} />}
      </ul>

      <div className="rounded-lg border border-border bg-surface-1 shadow-card">
        <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium" onClick={() => setOpen((v) => !v)}>
          Engineering options
          <ChevronDown size={14} strokeWidth={1.75} className={cn('ml-auto text-fg-muted transition-[rotate] duration-150 ease-out', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-3">
            {(
              [
                ['CP-SAT solver', cpsat, setCpsat],
                ['QIGA solver', qiga, setQiga],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">{label}</span>
                <select className={inputClass} value={value} onChange={(e) => set(e.target.value as Tri)}>
                  <option value="default">Server default</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
            ))}
            <Field label="Seed" inputMode="numeric" placeholder="Random" className="font-mono" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^\d]/g, ''))} hint="Same seed, same layout." />
          </div>
        )}
      </div>

      {start.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(start.error)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button variant="primary" icon={<Play size={15} strokeWidth={1.75} />} disabled={!hasData || start.isPending} onClick={go}>
          {start.isPending ? 'Starting…' : 'Start allocation'}
        </Button>
        {(runs.data?.length ?? 0) > 0 && <span className="text-xs text-fg-muted tnum">{runs.data!.length} earlier {runs.data!.length === 1 ? 'run' : 'runs'}</span>}
      </div>

      {(runs.data?.length ?? 0) > 0 && (
        <section aria-label="Earlier runs">
          <h2 className="mb-2 text-[13px] font-medium">Earlier runs</h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-surface-1">
            {runs.data!.map((r) => (
              <li key={r.id} className="border-b border-border last:border-0">
                <Link to={r.status === 'finished' ? `/projects/${pid}/runs/${r.id}` : `?run=${r.id}`} className="flex items-center gap-4 px-4 py-2.5 text-[13px] transition-[background-color] duration-150 ease-out hover:bg-surface-2">
                  <span className="font-mono text-xs text-fg-muted">{r.id.slice(0, 8)}</span>
                  <span className="tnum text-fg-muted">{new Date(r.created_at).toLocaleString()}</span>
                  <span className="ml-auto tnum text-xs text-fg-muted">{r.status === 'finished' && r.summary ? `${String((r.summary as Record<string, unknown>).allocated ?? '–')} placed` : ''}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.status === 'finished' ? 'bg-success/15 text-success' : r.status === 'failed' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning')}>{r.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Follow({ pid, rid, onReplay }: { pid: string; rid: string; onReplay: () => void }) {
  const { view, status } = useRunStream(pid, rid)
  const refresh = useRefreshAfterRun(pid)
  const refreshed = useRef(false)
  const nav = useNavigate()
  const ok = status === 'done' && view.finished !== undefined && view.error === undefined
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => nav(`/projects/${pid}/runs/${rid}`, { replace: true }), 1600)
    return () => clearTimeout(t)
  }, [ok, nav, pid, rid])
  useEffect(() => {
    if (status === 'done' && !refreshed.current) {
      refreshed.current = true
      void refresh()
    }
    if (status !== 'done') refreshed.current = false
  }, [status, refresh])
  return <RunProgress pid={pid} rid={rid} view={view} status={status} onReplay={onReplay} />
}

export default function RunPage() {
  const { pid = '' } = useParams()
  const rid = useSearchParams()[0].get('run')
  const [replay, setReplay] = useState(0)
  return rid ? <Follow key={`${rid}:${replay}`} pid={pid} rid={rid} onReplay={() => setReplay((n) => n + 1)} /> : <Setup pid={pid} />
}
