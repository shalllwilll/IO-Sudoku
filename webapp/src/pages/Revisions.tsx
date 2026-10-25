import { GitCommitHorizontal, Play, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useChain, useComparison, useCumulative, useRuns, useSetBaseline, useSignalHistory, useStartRevision, type ChainEntry } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'

type Tab = 'chain' | 'compare' | 'cumulative' | 'history'

const norm = (s: string) => s.trim().toLowerCase()
const TONE: Record<string, string> = { added: 'bg-success/15 text-success', deleted: 'bg-danger/15 text-danger', removed: 'bg-danger/15 text-danger', moved: 'bg-warning/15 text-warning', modified: 'bg-accent-soft text-fg' }
const Change = ({ value }: { value: string }) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', TONE[norm(value)] ?? 'bg-surface-3 text-fg-muted')}>{value}</span>

function Baseline({ pid }: { pid: string }) {
  const runs = useRuns(pid)
  const set = useSetBaseline(pid)
  const finished = (runs.data ?? []).filter((r) => r.status === 'finished')
  const [runId, setRunId] = useState('')
  const [label, setLabel] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const chosen = runId || finished[0]?.id || ''
  const err = set.fromRun.error ?? set.fromFile.error
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5 shadow-card">
      <div>
        <h2 className="text-[13px] font-medium">Set the baseline</h2>
        <p className="mt-1 text-xs text-fg-muted text-pretty">The first issue of the chain. Later revisions are compared against it, and signals that did not change keep their slot.</p>
      </div>
      <Field label="Issue label (optional)" placeholder="00" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-40 font-mono" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">From a finished run</span>
          {finished.length === 0 ? (
            <p className="text-xs text-fg-muted">
              No finished run yet. <Link className="text-accent hover:underline" to={`/projects/${pid}/run`}>Start one</Link>.
            </p>
          ) : (
            <>
              <select aria-label="Run" className={inputClass} value={chosen} onChange={(e) => setRunId(e.target.value)}>
                {finished.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id.slice(0, 8)} · {new Date(r.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
              <Button variant="primary" className="self-start" disabled={set.fromRun.isPending} onClick={() => set.fromRun.mutate({ run_id: chosen, ...(label.trim() ? { label: label.trim() } : {}) })}>
                Use this run
              </Button>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">From an issued workbook</span>
          <input ref={file} type="file" accept=".xlsx" aria-label="Issued allocation workbook" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) set.fromFile.mutate({ file: f, label: label.trim() || undefined }); e.target.value = '' }} />
          <Button className="self-start" icon={<Upload size={14} strokeWidth={1.75} />} disabled={set.fromFile.isPending} onClick={() => file.current?.click()}>
            {set.fromFile.isPending ? 'Reading…' : 'Choose .xlsx'}
          </Button>
          <p className="text-xs text-fg-subtle text-pretty">An allocation workbook already issued for this plant.</p>
        </div>
      </div>
      {err != null && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(err)}
        </p>
      )}
    </div>
  )
}

function ImpactLine({ e }: { e: ChainEntry }) {
  const i = e.impact
  if (!i) return <span className="text-xs text-fg-subtle">Baseline issue</span>
  const parts = [`${i.added ?? 0} added`, `${i.deleted ?? 0} deleted`, `${i.modified ?? 0} modified`, `${i.moved ?? 0} moved`]
  return <span className="text-xs text-fg-muted tnum">{parts.join(' · ')}</span>
}

function Chain({ pid, chain }: { pid: string; chain: ChainEntry[] }) {
  const nav = useNavigate()
  const start = useStartRevision(pid)
  const [label, setLabel] = useState('')
  const last = chain[chain.length - 1]
  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col" aria-label="Revision chain">
        {chain.map((e, idx) => (
          <li key={e.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="mt-1 grid size-6 place-items-center rounded-full border border-border-strong bg-surface-1 text-fg-muted"><GitCommitHorizontal size={14} strokeWidth={1.75} /></span>
              {idx < chain.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="mb-4 min-w-0 flex-1 rounded-lg border border-border bg-surface-1 p-4 shadow-card">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] font-medium">Issue {e.label}</span>
                {e.parent_label && <span className="text-xs text-fg-subtle">from {e.parent_label}</span>}
                {e.created_at && <span className="ml-auto text-xs text-fg-muted tnum">{new Date(e.created_at).toLocaleString()}</span>}
              </div>
              <div className="mt-1"><ImpactLine e={e} /></div>
              {e.impact && (
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-fg-muted tnum sm:grid-cols-3">
                  <div><dt className="inline">Cabinets </dt><dd className="inline text-fg">{e.impact.cabinets_used_before} → {e.impact.cabinets_used_after}</dd></div>
                  <div><dt className="inline">CIOCs </dt><dd className="inline text-fg">{e.impact.ciocs_used_before} → {e.impact.ciocs_used_after}</dd></div>
                  <div><dt className="inline">Wired spares </dt><dd className="inline text-fg">{e.impact.wired_spares_before} → {e.impact.wired_spares_after}</dd></div>
                  {Object.entries(e.impact.moves_by_reason ?? {}).map(([k, v]) => (
                    <div key={k}><dt className="inline">Moved: {k.replace(/_/g, ' ')} </dt><dd className="inline text-fg">{String(v)}</dd></div>
                  ))}
                </dl>
              )}
              <Link to={`/projects/${pid}/runs/${e.run_id}`} className="mt-3 inline-block text-xs text-accent hover:underline">Open results</Link>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 shadow-card">
        <div>
          <h2 className="text-[13px] font-medium">Start the next revision</h2>
          <p className="mt-1 text-xs text-fg-muted text-pretty">
            Allocates the files currently on the <Link className="text-accent hover:underline" to={`/projects/${pid}/data`}>Data</Link> step against Issue {last?.label}. Replace the old file with the revised one there first.
          </p>
        </div>
        <Field label="Issue label (optional)" className="max-w-40 font-mono" value={label} onChange={(e) => setLabel(e.target.value)} />
        {start.isError && <p role="alert" className="text-[13px] text-danger">{describeError(start.error)}</p>}
        <Button variant="primary" className="self-start" icon={<Play size={15} strokeWidth={1.75} />} disabled={start.isPending} onClick={() => start.mutate(label.trim() ? { label: label.trim() } : {}, { onSuccess: (r) => nav(`/projects/${pid}/run?run=${String((r as { id?: string }).id ?? '')}`) })}>
          {start.isPending ? 'Starting…' : 'Run revision'}
        </Button>
      </div>
    </div>
  )
}

function Compare({ pid, chain }: { pid: string; chain: ChainEntry[] }) {
  const labels = chain.map((c) => c.label)
  const [from, setFrom] = useState(labels[Math.max(0, labels.length - 2)] ?? '')
  const [to, setTo] = useState(labels[labels.length - 1] ?? '')
  const cmp = useComparison(pid, from, to)
  const [only, setOnly] = useState('all')
  const deltas = (cmp.data?.deltas ?? []).filter((d) => only === 'all' || norm(d.kind) === only)
  const sel = (v: string, set: (s: string) => void, label: string) => (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium">
      {label}
      <select className={cn(inputClass, 'w-32 font-mono')} value={v} onChange={(e) => set(e.target.value)}>
        {labels.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </label>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4">
        {sel(from, setFrom, 'From (older)')}
        {sel(to, setTo, 'To')}
        {from !== to && <Link to={`/projects/${pid}/revisions/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`} className="ml-auto inline-flex h-9 items-center rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium transition-[background-color] duration-150 ease-out hover:bg-surface-3">Open report</Link>}
      </div>
      {from === to ? <p className="text-[13px] text-fg-muted">Pick two different issues to compare.</p> : cmp.isLoading ? <p className="text-[13px] text-fg-muted">Comparing…</p> : cmp.isError ? <p role="alert" className="text-[13px] text-danger">{describeError(cmp.error)}</p> : cmp.data && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([['added', cmp.data.added], ['removed', cmp.data.removed], ['modified', cmp.data.modified], ['moved', cmp.data.moved], ['unchanged', cmp.data.unchanged]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-surface-1 p-3 shadow-card">
                <dt className="text-xs capitalize text-fg-muted">{k}</dt>
                <dd className="text-xl font-semibold tnum">{v}</dd>
              </div>
            ))}
          </dl>
          <Segmented label="Show" value={only} onChange={setOnly} options={['all', 'added', 'removed', 'modified', 'moved'].map((v) => ({ value: v, label: v }))} />
          <DeltaTable rows={deltas.map((d) => ({ key: `${d.tag}-${d.cable}-${d.pair}`, tag: d.tag, cable: d.cable, pair: d.pair, kind: d.kind, from: d.old_slot, to: d.new_slot }))} />
        </>
      )}
    </div>
  )
}

interface Row { key: string; tag: string | null; cable?: string | null; pair?: number | null; kind: string; from: string; to: string }
function DeltaTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-[13px] text-fg-muted">Nothing in this view.</p>
  return (
    <div className="max-h-[480px] overflow-auto overscroll-contain rounded-lg border border-border bg-surface-1">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted"><tr><th className="px-3 py-2 font-medium">Tag</th><th className="px-3 py-2 font-medium">Cable / pair</th><th className="px-3 py-2 font-medium">Change</th><th className="px-3 py-2 font-medium">Was</th><th className="px-3 py-2 font-medium">Now</th></tr></thead>
        <tbody>
          {rows.slice(0, 500).map((r, i) => (
            <tr key={`${r.key}-${i}`} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs">{r.tag ?? '–'}</td>
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.cable ?? '–'}{r.pair != null ? ` / ${r.pair}` : ''}</td>
              <td className="px-3 py-2"><Change value={r.kind} /></td>
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.from}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && <p className="border-t border-border px-3 py-2 text-xs text-fg-muted">Showing the first 500 of {rows.length}.</p>}
    </div>
  )
}

function Cumulative({ pid }: { pid: string }) {
  const q = useCumulative(pid, true)
  const [filter, setFilter] = useState('')
  const rows = (q.data ?? []).filter((r) => !filter || (r.tag ?? '').toLowerCase().includes(filter.toLowerCase()))
  if (q.isLoading) return <p className="text-[13px] text-fg-muted">Loading…</p>
  if (q.isError) return <p role="alert" className="text-[13px] text-danger">{describeError(q.error)}</p>
  return (
    <div className="flex flex-col gap-3">
      <Field label="Filter by tag" className="max-w-64 font-mono" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="max-h-[520px] overflow-auto overscroll-contain rounded-lg border border-border bg-surface-1">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted"><tr><th className="px-3 py-2 font-medium">Tag</th><th className="px-3 py-2 font-medium">Cable / pair</th><th className="px-3 py-2 font-medium">Current slot</th><th className="px-3 py-2 font-medium">Last changed</th><th className="px-3 py-2 text-right font-medium">Changes</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map((r, i) => (
              <tr key={`${r.tag}-${i}`} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{r.tag}</td>
                <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.cable ?? '–'}{r.pair != null ? ` / ${r.pair}` : ''}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.slot}</td>
                <td className="px-3 py-2 font-mono text-xs text-fg-muted">{r.last_changed_label}</td>
                <td className="px-3 py-2 text-right tnum">{r.changes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-3 text-[13px] text-fg-muted">No signals match.</p>}
        {rows.length > 500 && <p className="border-t border-border px-3 py-2 text-xs text-fg-muted">Showing the first 500 of {rows.length}. Filter to narrow.</p>}
      </div>
    </div>
  )
}

function History({ pid }: { pid: string }) {
  const [draft, setDraft] = useState('')
  const [tag, setTag] = useState('')
  const q = useSignalHistory(pid, tag)
  return (
    <div className="flex flex-col gap-3">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setTag(draft.trim()) }}>
        <Field label="Signal tag" className="w-64 font-mono" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. FT-101" />
        <Button type="submit" variant="primary" disabled={!draft.trim()}>Look up</Button>
      </form>
      {q.isError ? <p role="alert" className="text-[13px] text-danger">{describeError(q.error)}</p> : tag && q.data && (q.data.length === 0 ? <p className="text-[13px] text-fg-muted">No history for {tag}.</p> : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface-1">
          {q.data.map((h, i) => (
            <li key={`${h.label}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
              <span className="font-mono text-xs">Issue {h.label}</span>
              <Change value={h.change} />
              <span className="font-mono text-xs text-fg-muted">{h.old_slot} → {h.new_slot}</span>
              {h.reason && <span className="text-xs text-fg-muted text-pretty">{h.reason}</span>}
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

export default function Revisions() {
  const { pid = '' } = useParams()
  const chain = useChain(pid)
  const [tab, setTab] = useState<Tab>('chain')
  const entries = chain.data ?? []
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Revisions</h1>
        <p className="mt-1 text-[13px] text-fg-muted text-pretty">When the signal list changes after an issue, allocate the new list against the issued layout so unchanged signals keep their slot.</p>
      </div>
      {chain.isLoading ? <p className="text-[13px] text-fg-muted">Loading…</p> : chain.isError ? <p role="alert" className="text-[13px] text-danger">{describeError(chain.error)}</p> : entries.length === 0 ? <Baseline pid={pid} /> : (
        <>
          <Segmented<Tab> label="Revision view" value={tab} onChange={setTab} options={[{ value: 'chain', label: 'Chain' }, { value: 'compare', label: 'Compare' }, { value: 'cumulative', label: 'Cumulative' }, { value: 'history', label: 'Signal history' }]} />
          {tab === 'chain' && <Chain pid={pid} chain={entries} />}
          {tab === 'compare' && (entries.length < 2 ? <p className="text-[13px] text-fg-muted">Run a revision to have two issues to compare.</p> : <Compare pid={pid} chain={entries} />)}
          {tab === 'cumulative' && <Cumulative pid={pid} />}
          {tab === 'history' && <History pid={pid} />}
        </>
      )}
    </div>
  )
}
