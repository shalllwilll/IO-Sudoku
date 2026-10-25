import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export type StepState = 'done' | 'current' | 'attention' | 'todo'
export interface Step {
  id: string
  label: string
  state: StepState
  note?: string
}

export function StepRail({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Project steps">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1">
          <span
            aria-current={s.state === 'current' ? 'step' : undefined}
            className={cn(
              'flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] transition-[background-color,color] duration-150 ease-out',
              s.state === 'current' && 'bg-accent-soft text-fg',
              s.state === 'done' && 'text-fg-muted',
              s.state === 'attention' && 'text-fg',
              s.state === 'todo' && 'text-fg-subtle',
            )}
          >
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full border text-[11px] font-medium tnum',
                s.state === 'done' && 'border-transparent bg-success/20 text-success',
                s.state === 'current' && 'border-accent bg-accent text-accent-fg',
                s.state === 'attention' && 'border-warning text-warning',
                s.state === 'todo' && 'border-border-strong',
              )}
            >
              {s.state === 'done' ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            {s.label}
            {s.note && <span className="rounded bg-warning/15 px-1.5 text-[11px] text-warning">{s.note}</span>}
          </span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-border-strong" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}
