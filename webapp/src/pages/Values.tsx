import { Check, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { usePutValues, useValues, type ValueMaps } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { Button } from '@/components/ui/Button'
import { choiceFor, isValueField, undecided, VALUE_GROUPS, withChoice, type ValueField } from '@/lib/values'

export default function Values() {
  const { pid = '' } = useParams()
  const values = useValues(pid)
  const save = usePutValues(pid)
  const [edit, setEdit] = useState<ValueMaps | null>(null)
  const [saved, setSaved] = useState(false)
  const data = values.data

  if (values.isError) return <ErrorPanel error={values.error} onRetry={() => void values.refetch()} />
  if (!data) return <p className="p-8 text-[13px] text-fg-muted">Loading values…</p>

  const draft: ValueMaps = edit ?? data.overrides
  const unknown = data.unknown.filter((u) => isValueField(u.field))
  const other = data.unknown.filter((u) => !isValueField(u.field))
  const dirty = edit !== null && JSON.stringify(edit) !== JSON.stringify(data.overrides)
  const remaining = undecided(data.unknown, draft).length
  const decided = Object.entries(VALUE_GROUPS).flatMap(([field, g]) =>
    Object.entries(draft[g.group] ?? {}).map(([raw, canon]) => ({ field: field as ValueField, raw, canon })),
  )

  const set = (field: ValueField, raw: string, canon: string) => {
    setSaved(false)
    setEdit(withChoice(draft, field, raw, canon))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-8">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Values</h1>
          <p className="mt-1 text-[13px] text-fg-muted text-pretty">Values the engine does not recognise. Decide what each one means; nothing is guessed silently, and AI suggestions are never applied for you.</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {saved && !dirty && (
            <span className="flex items-center gap-1.5 text-[13px] text-success">
              <Check size={14} strokeWidth={2} /> Saved
            </span>
          )}
          <Button
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(draft, { onSuccess: () => {
                setSaved(true)
                setEdit(null)
              } })}
          >
            {save.isPending ? 'Saving…' : 'Save decisions'}
          </Button>
        </div>
      </div>
      {save.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(save.error)}
        </p>
      )}

      {unknown.length === 0 && other.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-1 p-6 text-[13px] text-fg-muted">
          Every value in the data is recognised. Next, <Link to={`/projects/${pid}/rules`} className="text-accent hover:underline">review the rules</Link>.
        </div>
      ) : (
        <>
          {remaining > 0 && <p className="text-[13px] text-fg-muted tnum">{remaining} of {unknown.length} still undecided. Undecided values are raised as questions (TQs) when you run.</p>}
          <ul className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-card">
            {unknown.map((u) => {
              const field = u.field as ValueField
              const allowed = data.allowed[VALUE_GROUPS[field].allowed] ?? []
              const choice = choiceFor(draft, u)
              return (
                <li key={`${u.field}:${u.value}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[13px]">{u.value || '(blank)'}</span>
                      <span className="rounded bg-surface-3 px-1.5 text-[11px] text-fg-muted">{VALUE_GROUPS[field].label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-fg-muted tnum">
                      {u.count} {u.count === 1 ? 'row' : 'rows'}
                      {u.suggestion && !choice && (
                        <>
                          {' · '}
                          <button type="button" className="underline-offset-2 hover:underline" onClick={() => set(field, u.value, u.suggestion!)}>
                            suggested {u.suggestion}, use
                          </button>
                        </>
                      )}
                    </div>
                    {u.ai && !choice && (
                      <button type="button" onClick={() => set(field, u.value, u.ai!.value)} className="mt-1 flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-0.5 text-xs hover:bg-surface-3">
                        <Sparkles size={12} strokeWidth={1.75} /> AI suggests {u.ai.value} ({Math.round(u.ai.confidence * 100)}%) · use
                      </button>
                    )}
                  </div>
                  <select
                    aria-label={`Meaning of ${u.value}`}
                    value={choice}
                    onChange={(e) => set(field, u.value, e.target.value)}
                    className="h-8 w-40 rounded-md border border-border-strong bg-surface-1 px-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  >
                    <option value="">Undecided</option>
                    {allowed.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
          {other.length > 0 && (
            <p className="text-xs text-fg-subtle">{other.length} other unrecognised values have no editor here and will appear as TQs.</p>
          )}
        </>
      )}

      {decided.length > 0 && (
        <section aria-label="Saved decisions">
          <h2 className="mb-2 text-[13px] font-medium">Decisions</h2>
          <ul className="rounded-lg border border-border bg-surface-1">
            {decided.map((d) => (
              <li key={`${d.field}:${d.raw}`} className="flex items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-0">
                <span className="font-mono text-xs">{d.raw}</span>
                <span className="text-fg-subtle">→</span>
                <span className="font-mono text-xs">{d.canon}</span>
                <span className="text-xs text-fg-subtle">{VALUE_GROUPS[d.field].label}</span>
                <button type="button" aria-label={`Remove decision for ${d.raw}`} className="ml-auto grid size-6 place-items-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg" onClick={() => set(d.field, d.raw, '')}>
                  <X size={13} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
