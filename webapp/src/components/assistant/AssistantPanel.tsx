import { AnimatePresence, motion } from 'motion/react'
import { Send, Sparkles, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useAiStatus, useConfirmRule, useIntent } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { IntentCard, type Exchange } from './IntentCard'
import { useAssistant } from '@/state/assistant'

const SUGGESTIONS = ['Keep AIR and DOR on separate CIOCs', 'Reserve baseplate 8 for spares', 'Keep each loop together on one CIOC']

export function AssistantPanel() {
  const { pid } = useParams()
  const open = useAssistant((s) => s.open)
  const close = useAssistant((s) => s.close)
  const ai = useAiStatus()
  const intent = useIntent(pid ?? '')
  const confirm = useConfirmRule(pid ?? '')
  const [text, setText] = useState('')
  const [log, setLog] = useState<Exchange[]>([])
  const counter = useRef(0)
  const section = useLocation().pathname.split('/')[3]
  const patch = (id: number, p: Partial<Exchange>) => setLog((l) => l.map((e) => (e.id === id ? { ...e, ...p } : e)))

  const ask = (request: string) => {
    const q = request.trim()
    if (q.length < 3 || !pid) return
    const id = ++counter.current
    setLog((l) => [...l, { id, request: q }])
    setText('')
    intent.mutate(q, { onSuccess: (result) => patch(id, { result }), onError: (error) => patch(id, { error }) })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(text)
  }
  const aiOn = ai.data?.ai_available === true

  return (
    <AnimatePresence initial={false}>
      {open && pid && (
        <motion.aside
          aria-label="Assistant"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24, transition: { duration: 0.15, ease: 'easeOut' } }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface-1 max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:shadow-float"
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <Sparkles size={15} strokeWidth={1.75} />
            <h2 className="text-[13px] font-medium">Assistant</h2>
            <span className={cn('ml-1 flex items-center gap-1.5 text-xs', aiOn ? 'text-success' : 'text-fg-muted')}>
              <span className={cn('size-1.5 rounded-full', aiOn ? 'bg-success' : 'bg-fg-subtle')} />
              {aiOn ? 'AI on' : 'AI off'}
            </span>
            <button type="button" aria-label="Close assistant" className="ml-auto grid size-8 place-items-center rounded-md text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg" onClick={close}>
              <X size={15} strokeWidth={1.75} />
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto overscroll-contain p-4" aria-live="polite">
            {!aiOn && (
              <p className="rounded-md bg-surface-2 p-3 text-xs text-fg-muted text-pretty">
                AI is not configured. Common phrasings such as "Keep AIR and DOR on separate CIOCs" still turn into rules here; unusual sentences need AI, and the rule form on the Rules page always works.
              </p>
            )}
            <p className="text-[13px] text-fg-muted text-pretty">
              Describe a constraint in plain words. You get a checked preview first; nothing is applied until you add it.
              {section === 'tqs' && ' To explain a single question, open it in the inbox.'}
            </p>
            {log.length === 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="Examples">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button type="button" className="w-full rounded-md border border-border px-3 py-2 text-left text-[13px] transition-[background-color] duration-150 ease-out hover:bg-surface-2" onClick={() => setText(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {log.map((ex) => (
              <div key={ex.id} className="flex flex-col gap-2">
                <p className="self-end rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-pretty">{ex.request}</p>
                {ex.error != null ? (
                  <p role="alert" className="text-[13px] text-danger">{describeError(ex.error)}</p>
                ) : !ex.result ? (
                  <p className="text-xs text-fg-muted">Checking…</p>
                ) : (
                  <IntentCard
                    ex={ex}
                    pid={pid ?? ''}
                    onAsk={ask}
                    adding={confirm.isPending && confirm.variables?.id === ex.result.rule_preview?.rule?.id}
                    addError={confirm.isError && confirm.variables?.id === ex.result.rule_preview?.rule?.id ? confirm.error : null}
                    onDismiss={() => patch(ex.id, { dismissed: true })}
                    onAdd={() => {
                      const rule = ex.result?.rule_preview?.rule
                      if (rule) confirm.mutate(rule as unknown as Record<string, unknown>, { onSuccess: () => patch(ex.id, { added: String(rule.id) }) })
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-border p-3">
            <input
              aria-label="Describe a constraint"
              className="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-1 px-3 text-[13px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft"
              placeholder="Keep AIR and DOR on separate CIOCs"
              maxLength={600}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="primary" className="size-9 px-0" aria-label="Send" disabled={text.trim().length < 3 || intent.isPending}>
              <Send size={14} strokeWidth={1.75} />
            </Button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
