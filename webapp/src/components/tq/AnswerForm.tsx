import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api/errors'
import { useAiStatus, useAnswerTq, useExplainTq, useMapping, useValues, type AnswerResult } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { buildAnswer, effectOf, HW_FIELDS, inputFor, SCOPE_LABEL, scopesFor, valueKind, type Draft, type Scope, type TQ } from '@/lib/tq'
import { usePending } from '@/state/pending'
import { useSession } from '@/state/session'

export function AnswerForm({ pid, tq, onAnswered }: { pid: string; tq: TQ; onAnswered: (r: AnswerResult) => void }) {
  const author = useSession((s) => s.name) ?? 'engineer'
  const mark = usePending((s) => s.mark)
  const answer = useAnswerTq(pid)
  const explain = useExplainTq(pid)
  const ai = useAiStatus()
  // narrowest scope first; a scope the option does not offer falls back to the first one it does
  const [draft, setDraft] = useState<Draft>({ optionIndex: 0, scope: 'row', value: '', fields: {} })
  const [problem, setProblem] = useState<string | null>(null)

  const options = tq.options ?? []
  const effect = effectOf(tq, draft.optionIndex)
  const input = inputFor(effect)
  const scopes = scopesFor(tq, effect)
  const scope: Scope = scopes.includes(draft.scope) ? draft.scope : scopes[0]
  const values = useValues(pid, input === 'value')
  const mapping = useMapping(pid, input === 'column')
  const allowed = values.data?.allowed[valueKind(tq, effect)] ?? []
  const columns = mapping.data?.sheets.find((s) => s.file === tq.source_file)?.columns ?? mapping.data?.sheets[0]?.columns ?? []
  const set = (p: Partial<Draft>) => {
    setProblem(null)
    setDraft((d) => ({ ...d, ...p }))
  }
  const setField = (k: string, v: string) => set({ fields: { ...draft.fields, [k]: v } })

  const submit = () => {
    const built = buildAnswer(tq, { ...draft, scope }, author)
    if ('error' in built) return setProblem(built.error)
    answer.mutate(
      { tid: tq.id, body: built.body },
      {
        onSuccess: (r) => {
          if (r.answer.effect !== 'note') mark(pid) // a note records a decision but changes no run input
          onAnswered(r)
        },
      },
    )
  }

  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium">{tq.status === 'answered' ? 'Change your answer' : 'Your answer'}</legend>
        {options.map((o, i) => (
          <label key={o.label} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3 transition-[border-color,background-color] duration-150 ease-out', draft.optionIndex === i ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}>
            <input type="radio" name="option" className="mt-1 accent-[var(--color-accent)]" checked={draft.optionIndex === i} onChange={() => set({ optionIndex: i, value: '', fields: {} })} />
            <span>
              <span className="block text-[13px] font-medium">{o.label}</span>
              <span className="block text-xs text-fg-muted text-pretty">{o.consequence}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {input === 'value' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Becomes</span>
          <select className={inputClass} value={draft.value} onChange={(e) => set({ value: e.target.value })}>
            <option value="">Choose…</option>
            {allowed.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      {input === 'column' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Source column</span>
          <select className={inputClass} value={draft.value} onChange={(e) => set({ value: e.target.value })}>
            <option value="">Choose…</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      {input === 'limit' && <Field label="New cabinet limit" inputMode="numeric" className="font-mono" value={draft.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d]/g, '') })} hint="The most cabinets a layout may use." />}
      {input === 'hardware' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {HW_FIELDS.map((h) => (
            <Field key={h.key} label={h.label + (h.required ? '' : ' (optional)')} className="font-mono" value={draft.fields[h.key] ?? ''} onChange={(e) => setField(h.key, e.target.value)} />
          ))}
        </div>
      )}
      {input === 'naming' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area" className="font-mono" value={draft.fields.area ?? ''} onChange={(e) => setField('area', e.target.value)} />
          <Field label="Unit" className="font-mono" value={draft.fields.unit ?? ''} onChange={(e) => setField('unit', e.target.value)} />
        </div>
      )}
      {(input === 'rule' || input === 'rule_revise') && (
        <>
          <Field label="Rule id" className="font-mono" placeholder={tq.data?.rules ?? 'PS-CAP-CIOC'} value={draft.fields.rule ?? ''} onChange={(e) => setField('rule', e.target.value)} />
          {input === 'rule_revise' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Parameter changes</span>
              <textarea rows={3} className={cn(inputClass, 'h-auto py-2 font-mono text-[13px]')} placeholder="max = 80" value={draft.fields.changes ?? ''} onChange={(e) => setField('changes', e.target.value)} />
              <span className="text-xs text-fg-subtle">One per line, as name = value.</span>
            </label>
          )}
        </>
      )}

      {scopes.length > 1 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Applies to</span>
          <select className={inputClass} value={scope} onChange={(e) => set({ scope: e.target.value as Scope })}>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}

      {(problem || answer.isError) && (
        <p role="alert" className="text-[13px] text-danger">
          {problem ?? describeError(answer.error)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={answer.isPending}>
          {answer.isPending ? 'Saving…' : 'Save answer'}
        </Button>
        {ai.data?.ai_available && (
          <Button type="button" icon={<Sparkles size={14} strokeWidth={1.75} />} disabled={explain.isPending} onClick={() => explain.mutate(tq.id)}>
            {explain.isPending ? 'Explaining…' : 'Explain in plain words'}
          </Button>
        )}
        <span className="text-xs text-fg-subtle">Recorded as {author}</span>
      </div>
      {explain.data && (
        <p className="rounded-md bg-surface-2 p-3 text-[13px] text-pretty">
          {explain.data.text}
          <span className="mt-1 block text-xs text-fg-subtle">{explain.data.source === 'ai' ? 'AI wording, advisory only' : 'Template wording'}</span>
        </p>
      )}
      {explain.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(explain.error)}
        </p>
      )}
    </form>
  )
}
