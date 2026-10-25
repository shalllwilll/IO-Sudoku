import { AlertTriangle, Check, CircleHelp, Lock, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { describeError } from '@/api/errors'
import type { IntentResult } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { asRules, describeRule } from '@/lib/rules'

export interface Exchange {
  id: number
  request: string
  result?: IntentResult
  error?: unknown
  added?: string
  dismissed?: boolean
}

export function IntentCard({ ex, pid, onAsk, onAdd, onDismiss, adding, addError }: { ex: Exchange; pid: string; onAsk: (q: string) => void; onAdd: () => void; onDismiss: () => void; adding: boolean; addError: unknown }) {
  const r = ex.result
  if (!r) return null
  const preview = r.rule_preview
  const rule = preview?.rule ? asRules([preview.rule as unknown as Record<string, unknown>])[0] : null

  if (r.state === 'preview' && preview && rule) {
    const errors = (preview.findings ?? []).filter((f) => f.severity === 'error')
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 shadow-card">
        <p className="text-[13px] text-fg-muted text-pretty">{preview.message}</p>
        <div className="rounded-md bg-surface-2 p-2.5">
          <div className="text-[13px] font-medium">{rule.name}</div>
          <div className="text-xs text-fg-muted text-pretty">{describeRule(rule)}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-fg-subtle">
            <span className="capitalize">{rule.strength}</span>
            <span className="font-mono">{rule.id}</span>
            {preview.source === 'template' ? <span>Built from a template, no AI</span> : preview.confidence != null && <span className="tnum">Written by AI, {Math.round(preview.confidence * 100)}% confident</span>}
          </div>
        </div>
        {(preview.dry_run ?? []).map((d) => (
          <p key={d.rule_id} className="text-xs text-fg-muted tnum">
            Touches {d.matched_signals} signals in {d.affected_blocks} cable blocks of your data.
          </p>
        ))}
        {(preview.findings ?? []).map((f, i) => (
          <p key={i} className={cn('flex gap-1.5 text-xs', f.severity === 'error' ? 'text-danger' : 'text-warning')}>
            <AlertTriangle size={13} strokeWidth={1.75} className="mt-px shrink-0" />
            <span className="text-pretty">{f.message}</span>
          </p>
        ))}
        {ex.added ? (
          <p className="flex items-center gap-1.5 text-[13px] text-success">
            <Check size={14} strokeWidth={2} /> Added as {ex.added}. <Link to={`/projects/${pid}/rules`} className="underline-offset-2 hover:underline">Review in Rules</Link>
          </p>
        ) : ex.dismissed ? (
          <p className="text-xs text-fg-subtle">Dismissed. Nothing was changed.</p>
        ) : (
          <>
            <p className="text-xs text-fg-subtle">Nothing changes until you add it. Adding saves it to this project&apos;s rules.</p>
            {addError != null && (
              <p role="alert" className="text-xs text-danger">
                {describeError(addError)}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="primary" disabled={errors.length > 0 || adding} onClick={onAdd}>
                {adding ? 'Adding…' : 'Add to rules'}
              </Button>
              <Button variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  const tone =
    r.state === 'conflict'
      ? { icon: Lock, cls: 'text-danger', title: 'This rule is locked' }
      : r.state === 'unavailable'
        ? { icon: Sparkles, cls: 'text-fg-muted', title: 'Needs AI, or a different phrasing' }
        : preview?.status === 'rejected'
          ? { icon: AlertTriangle, cls: 'text-warning', title: 'That rule was rejected' }
          : { icon: CircleHelp, cls: 'text-fg-muted', title: r.state === 'unknown' ? 'Not something I can place' : 'I need a bit more' }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 shadow-card">
      <div className={cn('flex items-center gap-2 text-[13px] font-medium', tone.cls)}>
        <tone.icon size={14} strokeWidth={1.75} /> <span className="text-fg">{tone.title}</span>
      </div>
      <p className="text-[13px] text-fg-muted text-pretty">{r.message}</p>
      {r.locked_rules && r.locked_rules.length > 0 && <p className="font-mono text-xs text-fg-subtle">{r.locked_rules.join(', ')}</p>}
      {(preview?.findings ?? []).map((f, i) => (
        <p key={i} className="text-xs text-warning text-pretty">{f.message}</p>
      ))}
      {r.state === 'unavailable' && (
        <Link to={`/projects/${pid}/rules`} className="text-[13px] text-accent hover:underline">
          Build the rule with the form instead
        </Link>
      )}
      {(r.questions ?? []).length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {r.questions!.map((q) => (
            <li key={q} className="text-xs text-fg-muted text-pretty">{q}</li>
          ))}
        </ul>
      )}
      {r.state === 'conflict' && <button type="button" className="self-start text-xs text-accent hover:underline" onClick={() => onAsk('Review capacity per CIOC')}>Try a capacity review instead</button>}
    </div>
  )
}
