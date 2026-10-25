import { AlertTriangle, Check, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useMapping, usePutMapping, type MappingSheet } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { currentSelection, duplicateColumns, missingRequired, sheetKey, toConfirmed, type Selection } from '@/lib/mapping'

const GROUPING: Record<string, string> = {
  two_column: 'Segregation read from two columns (class and family)',
  combined: 'Segregation read from one combined column',
  none: 'No segregation column found',
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <span className="flex items-center gap-2" title={`${pct}% confidence`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className={cn('block h-full rounded-full', value >= 0.9 ? 'bg-success' : value >= 0.7 ? 'bg-warning' : 'bg-danger')} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-fg-muted tnum">{pct}%</span>
    </span>
  )
}

function SheetCard({ sheet, fields, required, selection, onChange }: { sheet: MappingSheet; fields: string[]; required: string[]; selection: Selection; onChange: (f: string, col: string) => void }) {
  const [showAll, setShowAll] = useState(false)
  const dupes = duplicateColumns(selection)
  const ordered = [...fields].sort((a, b) => Number(required.includes(b)) - Number(required.includes(a)) || a.localeCompare(b))
  const shown = ordered.filter((f) => showAll || required.includes(f) || selection[f])
  const hidden = ordered.length - shown.length
  const issues = sheet.issues

  return (
    <section className="rounded-lg border border-border bg-surface-1 shadow-card" aria-label={`${sheet.file} ${sheet.sheet ?? ''}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-3">
        <h2 className="text-[14px] font-medium">{sheet.file}</h2>
        <span className="font-mono text-xs text-fg-muted">{sheet.sheet}</span>
        <span className="ml-auto text-xs text-fg-muted">{GROUPING[sheet.grouping_mode] ?? sheet.grouping_mode}</span>
      </header>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 border-b border-border bg-warning/10 px-4 py-2.5 text-[13px]">
          {issues.map((i, k) => (
            <li key={k} className="flex gap-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
              <span className="text-pretty">{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      <table className="w-full text-left text-[13px]">
        <thead className="text-xs text-fg-subtle">
          <tr>
            <th className="px-4 py-2 font-normal">Field</th>
            <th className="py-2 font-normal">Source column</th>
            <th className="py-2 font-normal">Confidence</th>
            <th className="px-4 py-2 font-normal">How found</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((f) => {
            const m = sheet.matches[f]
            const hint = sheet.ai_hints?.[f]
            const isReq = required.includes(f)
            const missing = isReq && !selection[f]
            const changed = m ? selection[f] !== m.column : !!selection[f]
            return (
              <tr key={f} className="border-t border-border align-top">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs">{f}</span>
                  {isReq && <span className="ml-2 rounded bg-surface-3 px-1.5 text-[11px] text-fg-muted">required</span>}
                </td>
                <td className="py-1.5 pr-3">
                  <select
                    aria-label={`Column for ${f}`}
                    value={selection[f] ?? ''}
                    onChange={(e) => onChange(f, e.target.value)}
                    className={cn('h-8 w-full max-w-72 rounded-md border bg-surface-1 px-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft', missing ? 'border-danger' : 'border-border-strong')}
                  >
                    <option value="">Not mapped</option>
                    {sheet.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {missing && <p className="mt-1 text-xs text-danger">Required. Choose a column.</p>}
                  {selection[f] && dupes[selection[f]] && <p className="mt-1 text-xs text-warning">Also used for {dupes[selection[f]].filter((x) => x !== f).join(', ')}.</p>}
                  {hint && hint.value !== selection[f] && (
                    <button type="button" onClick={() => onChange(f, hint.value)} className="mt-1 flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-0.5 text-xs hover:bg-surface-3">
                      <Sparkles size={12} strokeWidth={1.75} /> AI suggests “{hint.value}” · use
                    </button>
                  )}
                </td>
                <td className="py-2">{m && !changed ? <Confidence value={m.confidence} /> : <span className="text-xs text-fg-subtle">–</span>}</td>
                <td className="px-4 py-2 text-xs text-fg-muted">{changed ? 'Your choice' : (m?.method ?? '–')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {(hidden > 0 || showAll) && (
        <button type="button" className="w-full border-t border-border px-4 py-2 text-left text-xs text-fg-muted hover:bg-surface-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide unmapped optional fields' : `Show ${hidden} unmapped optional fields`}
        </button>
      )}
    </section>
  )
}

export default function Map() {
  const { pid = '' } = useParams()
  const mapping = useMapping(pid)
  const save = usePutMapping(pid)
  const [edit, setEdit] = useState<Record<string, Selection> | null>(null)
  const [saved, setSaved] = useState(false)
  const data = mapping.data

  const baseline = useMemo(() => {
    const out: Record<string, Selection> = {}
    if (data) for (const s of data.sheets) out[sheetKey(s)] = currentSelection(s, data.fields, data.confirmed[s.file])
    return out
  }, [data])
  const draft = edit ?? baseline

  if (mapping.isError) return <ErrorPanel error={mapping.error} onRetry={() => void mapping.refetch()} />
  if (!data) return <p className="p-8 text-[13px] text-fg-muted">Loading mapping…</p>
  if (data.sheets.length === 0)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-lg font-semibold tracking-tight">Map</h1>
        <p className="mt-2 text-[13px] text-fg-muted">
          There is nothing to map yet. <Link to={`/projects/${pid}/data`} className="text-accent underline-offset-2 hover:underline">Upload a workbook</Link> first.
        </p>
      </div>
    )

  const dirty = edit !== null && JSON.stringify(edit) !== JSON.stringify(baseline)
  const blocked = data.sheets.some((s) => missingRequired(draft[sheetKey(s)] ?? {}, data.required).length > 0)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-8">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Map</h1>
          <p className="mt-1 text-[13px] text-fg-muted text-pretty">Check which source column feeds each field. Confident matches are already filled in; confirm to lock your choices in.</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {saved && !dirty && (
            <span className="flex items-center gap-1.5 text-[13px] text-success">
              <Check size={14} strokeWidth={2} /> Saved
            </span>
          )}
          <Button
            variant="primary"
            disabled={blocked || save.isPending || !dirty}
            onClick={() => save.mutate(toConfirmed(data.sheets, draft), { onSuccess: () => {
                setSaved(true)
                setEdit(null)
              },
            })}
          >
            {save.isPending ? 'Saving…' : 'Confirm mapping'}
          </Button>
        </div>
      </div>
      {blocked && <p className="text-[13px] text-danger">Map every required field to continue.</p>}
      {save.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(save.error)}
        </p>
      )}
      {data.sheets.map((s) => (
        <SheetCard
          key={sheetKey(s)}
          sheet={s}
          fields={data.fields}
          required={data.required}
          selection={draft[sheetKey(s)] ?? baseline[sheetKey(s)] ?? {}}
          onChange={(f, col) => {
            setSaved(false)
            setEdit({ ...draft, [sheetKey(s)]: { ...draft[sheetKey(s)], [f]: col } })
          }}
        />
      ))}
    </div>
  )
}
