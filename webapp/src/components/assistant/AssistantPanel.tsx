import { AnimatePresence, motion } from 'motion/react'
import { Send, Sparkles, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useAiStatus, useConfirmRule, useIntent } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { IntentCard, type Exchange } from './IntentCard'
import { useAssistant } from '@/state/assistant'

const CONTEXT: Record<string, { title: string; intro: string; prompts: string[] }> = {
  rules: { title: 'Rule copilot', intro: 'Describe a constraint and get a checked preview. Nothing changes until you explicitly add the rule.', prompts: ['Keep AIR and DOR on separate CIOCs', 'Reserve baseplate 8 for spares', 'Keep each loop together on one CIOC'] },
  tqs: { title: 'Decision copilot', intro: 'Ask about a constraint or draft a safe rule. Use the decision card to apply any change.', prompts: ['Explain why this needs a decision', 'Review capacity per CIOC', 'Keep AIR and DOR on separate CIOCs'] },
  revisions: { title: 'Revision copilot', intro: 'Ask for a rule preview or explain what a revision needs. The allocation never changes from this panel.', prompts: ['Explain a revision constraint', 'Keep each loop together on one CIOC', 'Reserve baseplate 8 for spares'] },
  results: { title: 'Allocation copilot', intro: 'Ask for a checked rule preview or help interpreting a result. Decisions still stay on the result screens.', prompts: ['Explain this allocation result', 'Review capacity per CIOC', 'Keep AIR and DOR on separate CIOCs'] },
}

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
  const path = useLocation().pathname
  const section = path.includes('/runs/') ? 'results' : path.split('/')[3] ?? 'rules'
  const context = CONTEXT[section] ?? CONTEXT.rules
  const patch = (id: number, p: Partial<Exchange>) => setLog((l) => l.map((e) => (e.id === id ? { ...e, ...p } : e)))
  const ask = (request: string) => {
    const q = request.trim()
    if (q.length < 3 || !pid) return
    const id = ++counter.current
    setLog((l) => [...l, { id, request: q }])
    setText('')
    intent.mutate(q, { onSuccess: (result) => patch(id, { result }), onError: (error) => patch(id, { error }) })
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(text) }
  const assisted = ai.data?.ai_available === true

  return <AnimatePresence initial={false}>{open && pid && <>
    <motion.button type="button" aria-label="Close copilot" className="fixed inset-0 z-40 cursor-default bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }} onClick={close} />
    <motion.aside aria-label="Allocation copilot" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.15, ease: 'easeOut' } }} transition={{ duration: 0.3, ease: 'easeOut' }} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col overflow-hidden overscroll-contain border-l border-border-strong bg-surface-1 shadow-float">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4"><span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><Sparkles size={16} strokeWidth={1.75} /></span><div><h2 className="text-[14px] font-semibold">{context.title}</h2><p className="text-xs text-fg-subtle">{assisted ? 'AI-assisted, checked preview' : 'Checked template preview'}</p></div><button type="button" aria-label="Close copilot" className="ml-auto grid size-8 place-items-center rounded-md text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg" onClick={close}><X size={16} strokeWidth={1.75} /></button></header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto overscroll-contain p-5" aria-live="polite">
        {log.length === 0 && <><p className="max-w-sm text-[15px] leading-6 text-fg-muted text-pretty">{context.intro}</p><div className="flex flex-col gap-2" aria-label="Suggested prompts">{context.prompts.map((s) => <button key={s} type="button" className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-left text-[13px] text-fg transition-[background-color,border-color] duration-150 ease-out hover:border-border-strong hover:bg-surface-3" onClick={() => ask(s)}>{s}</button>)}</div>{!assisted && <p className="rounded-lg bg-surface-2 p-3 text-xs leading-5 text-fg-muted">The online assistant is unavailable. Common allocation rules still receive a checked local preview; unusual requests explain what needs clarification.</p>}</>}
        {log.map((ex) => <div key={ex.id} className="flex flex-col gap-2"><p className="self-end rounded-xl bg-accent-soft px-3 py-2 text-[13px] text-pretty">{ex.request}</p>{ex.error != null ? <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">{describeError(ex.error)}<button type="button" className="ml-2 underline" onClick={() => ask(ex.request)}>Try again</button></div> : !ex.result ? <p className="text-xs text-fg-muted">Checking this safely…</p> : <IntentCard ex={ex} pid={pid} onAsk={ask} adding={confirm.isPending && confirm.variables?.id === ex.result.rule_preview?.rule?.id} addError={confirm.isError && confirm.variables?.id === ex.result.rule_preview?.rule?.id ? confirm.error : null} onDismiss={() => patch(ex.id, { dismissed: true })} onAdd={() => { const rule = ex.result?.rule_preview?.rule; if (rule) confirm.mutate(rule as unknown as Record<string, unknown>, { onSuccess: () => patch(ex.id, { added: String(rule.id) }) }) }} />}</div>)}
      </div>
      <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-border bg-surface-1 p-4"><input aria-label="Ask the allocation copilot" className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-1 px-3 text-[13px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft" placeholder="Describe a rule or ask what needs attention…" maxLength={600} value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit" variant="primary" className="h-10 px-3" aria-label="Send" disabled={text.trim().length < 3 || intent.isPending}><Send size={15} strokeWidth={1.75} /></Button></form>
    </motion.aside>
  </>}</AnimatePresence>
}
