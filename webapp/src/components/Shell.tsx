import { CircleHelp, FolderKanban, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ThemeToggle } from './ThemeToggle'

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="text-accent">
        {[0, 1, 2].flatMap((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`${r}${c}`}
              x={c * 8}
              y={r * 8}
              width="6"
              height="6"
              rx="1.6"
              fill="currentColor"
              opacity={(r + c) % 2 === 0 ? 1 : 0.35}
            />
          )),
        )}
      </svg>
      <span className="text-[13px] font-semibold tracking-tight">IO Signal Sudoku</span>
    </div>
  )
}

const nav = [
  { label: 'Projects', icon: FolderKanban, active: true },
  { label: 'TQ inbox', icon: CircleHelp, badge: 4 },
  { label: 'Settings', icon: Settings },
]

export function Shell({ crumbs, rail, children }: { crumbs: string[]; rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid h-dvh grid-cols-[232px_1fr] bg-bg">
      <aside className="flex flex-col gap-6 border-r border-border bg-surface-1 p-3">
        <Brand />
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          {nav.map(({ label, icon: Icon, active, badge }) => (
            <a
              key={label}
              href="#"
              onClick={(e) => e.preventDefault()}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-[background-color,color] duration-150 ease-out',
                active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
              {badge && <span className="ml-auto rounded-full bg-danger/20 px-1.5 text-[11px] font-medium text-danger tnum">{badge}</span>}
            </a>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border border-border p-2.5">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Current project</div>
          <div className="mt-1 text-[13px] font-medium">Unit 100 allocation</div>
          <div className="font-mono text-xs text-fg-muted">AR1 · 100</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-5">
          <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            {crumbs.map((c, i) => (
              <span key={c} className={cn(i === crumbs.length - 1 && 'text-fg')}>
                {i > 0 && <span className="mr-1.5 text-fg-subtle">/</span>}
                {c}
              </span>
            ))}
          </div>
          <div className="ml-6">{rail}</div>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted" title="AI features are advisory only">
              <span className="size-1.5 rounded-full bg-fg-subtle" /> AI off
            </span>
            <ThemeToggle />
            <span className="grid size-8 place-items-center rounded-full bg-surface-3 text-xs font-medium">SH</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
