import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-strong shadow-card',
  secondary: 'bg-surface-2 text-fg border border-border-strong hover:bg-surface-3',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
  /** Opt out of the press scale where the motion would distract. */
  static?: boolean
}

export function Button({ variant = 'secondary', icon, static: still, className, children, ...rest }: Props) {
  return (
    <button
      className={cn(
        'inline-flex h-9 shrink-0 select-none whitespace-nowrap items-center justify-center gap-2 rounded-md px-3.5 text-[13px] font-medium',
        'transition-[scale,background-color,color,box-shadow,opacity] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        !still && 'enabled:active:scale-[0.96]',
        icon && 'pl-3',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
