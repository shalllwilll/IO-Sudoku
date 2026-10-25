import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const inputClass =
  'h-10 w-full rounded-md border border-border-strong bg-surface-1 px-3 text-[14px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft'

export function Field({ label, hint, className, ...rest }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <input className={cn(inputClass, className)} {...rest} />
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </label>
  )
}
