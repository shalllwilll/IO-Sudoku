import { Sparkles } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '@/api/errors'
import { useConfirmRule, useIntent } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { IntentCard, type Exchange } from '@/components/assistant/IntentCard'

const EXAMPLES = ['Keep AIR and DOR on separate CIOCs', 'Keep each cable on one CIOC', 'No more than 80 signals per CIOC', 'Keep baseplate 8 empty']

/** The plain-English way in: type a rule, see a checked preview, add it. Nothing is applied before Add. */
export function DescribeRule({ pid, aiOn, disabled }: { pid: string; aiOn: boolean; disabled?: string }) {
  const intent = useIntent(pid)
  const confirm = useConfirmRule(pid)
  const [text, setText] = useState('')
  const [ex, setEx] = useState<Exchange | null>(null)
  const counter = useRef(0)

  const ask = (request: string) => {
    const q = request.trim()
    if (q.length < 3) return
    const id = ++counter.current
    setEx({ id, request: q })
    intent.mutate(q, {
      onSuccess: (result) => counter.current === id && setEx({ id, request: q, result }),
      onError: (error) => counter.current === id && setEx({ id, request: q, error }),
    })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(text)
  }
  const ruleId = ex?.result?.rule_preview?.rule?.id

  return (
    <section aria-label="Plain-English rule" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Sparkles size={16} strokeWidth={1.75} className="text-accent" />
        <h2 className="text-[15px] font-semibold tracking-tight">Describe a rule in plain English</h2>
        <span className="ml-auto text-xs text-fg-muted">{aiOn ? 'Common phrasings are instant; anything else goes to AI' : 'Common phrasings work without AI'}</span>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          aria-label="Describe a rule"
          className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-1 px-3 text-[14px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-50"
          placeholder="Keep AIR and DOR on separate CIOCs"
          maxLength={600}
          disabled={disabled !== undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={disabled !== undefined || text.trim().length < 3 || intent.isPending}>
          {intent.isPending ? 'Checking…' : 'Check rule'}
        </Button>
      </form>
      {disabled ? (
        <p className="text-xs text-fg-muted">{disabled}</p>
      ) : (
        !ex && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Examples">
            {EXAMPLES.map((e) => (
              <li key={e}>
                <button type="button" className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg" onClick={() => { setText(e); ask(e) }}>
                  {e}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      {ex &&
        (ex.error != null ? (
          <p role="alert" className="text-[13px] text-danger">
            {describeError(ex.error)}
          </p>
        ) : !ex.result ? (
          <p className="text-xs text-fg-muted">Checking…</p>
        ) : (
          <IntentCard
            ex={ex}
            pid={pid}
            onAsk={ask}
            adding={confirm.isPending && confirm.variables?.id === ruleId}
            addError={confirm.isError && confirm.variables?.id === ruleId ? confirm.error : null}
            onDismiss={() => setEx({ ...ex, dismissed: true })}
            onAdd={() => {
              const rule = ex.result?.rule_preview?.rule
              if (rule) confirm.mutate(rule as unknown as Record<string, unknown>, { onSuccess: () => { setEx({ ...ex, added: String(rule.id) }); setText('') } })
            }}
          />
        ))}
    </section>
  )
}
