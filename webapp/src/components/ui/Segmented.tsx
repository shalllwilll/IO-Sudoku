import { cn } from '@/lib/cn'

interface Props<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-2 text-left transition-[background-color,color,box-shadow] duration-150 ease-out',
            o.value === value ? 'bg-surface-1 text-fg shadow-card' : 'text-fg-muted hover:text-fg',
          )}
        >
          <div className="text-[13px] font-medium">{o.label}</div>
          {o.hint && <div className="text-xs text-fg-subtle">{o.hint}</div>}
        </button>
      ))}
    </div>
  )
}
