import { CircleHelp, FolderKanban, LogOut, Settings, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useMatches, useNavigate, useParams } from 'react-router-dom'
import { useAiStatus, useOpenTqs, useProject } from '@/api/queries'
import { initials, useSession } from '@/state/session'
import { useAssistant } from '@/state/assistant'
import { AssistantPanel } from './assistant/AssistantPanel'
import { OfflineBanner } from './OfflineBanner'
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

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-[background-color,color] duration-150 ease-out',
    isActive ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  )

/** Section names come from route `handle.crumb`; the project name comes from the API. */
function useCrumbs(explicit?: string[]): string[] {
  const { pid } = useParams()
  const project = useProject(pid)
  const matches = useMatches() as { handle?: { crumb?: string } }[]
  if (explicit) return explicit
  const crumbs = ['Projects']
  if (pid) crumbs.push(project.data?.name ?? (project.isError ? 'Not found' : '…'))
  for (const m of matches) if (m.handle?.crumb) crumbs.push(m.handle.crumb)
  return crumbs
}

export function Shell({ crumbs, rail, children }: { crumbs?: string[]; rail?: ReactNode; children: ReactNode }) {
  const { pid } = useParams()
  const nav = useNavigate()
  const project = useProject(pid)
  const openTqs = useOpenTqs(pid)
  const ai = useAiStatus()
  const { name, role, signOut } = useSession()
  const assistantOpen = useAssistant((s) => s.open)
  const toggleAssistant = useAssistant((s) => s.toggle)
  const trail = useCrumbs(crumbs)
  const open = openTqs.data?.length ?? 0
  const aiOn = ai.data?.ai_available === true

  return (
    <div className="grid h-dvh grid-cols-[232px_1fr] bg-bg">
      <aside className="flex flex-col gap-6 border-r border-border bg-surface-1 p-3">
        <Brand />
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          <NavLink to="/projects" end className={navLink}>
            <FolderKanban size={16} strokeWidth={1.75} />
            Projects
          </NavLink>
          {pid && (
            <NavLink to={`/projects/${pid}/tqs`} className={navLink}>
              <CircleHelp size={16} strokeWidth={1.75} />
              TQ inbox
              {open > 0 && (
                <span className="ml-auto rounded-full bg-danger/20 px-1.5 text-[11px] font-medium text-danger tnum" aria-label={`${open} open`}>
                  {open}
                </span>
              )}
            </NavLink>
          )}
          <NavLink to="/settings" className={navLink}>
            <Settings size={16} strokeWidth={1.75} />
            Settings
          </NavLink>
        </nav>
        {project.data && (
          <div className="mt-auto rounded-lg border border-border p-2.5">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Current project</div>
            <div className="mt-1 truncate text-[13px] font-medium">{project.data.name}</div>
            <div className="truncate font-mono text-xs text-fg-muted">{[project.data.area, project.data.unit].filter(Boolean).join(' · ') || '–'}</div>
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-col">
        <OfflineBanner />
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-5">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            {trail.map((c, i) => (
              <span key={`${i}-${c}`} className={cn(i === trail.length - 1 && 'text-fg')}>
                {i > 0 && <span className="mr-1.5 text-fg-subtle">/</span>}
                {c}
              </span>
            ))}
          </nav>
          <div className="ml-6">{rail}</div>
          <div className="ml-auto flex items-center gap-2">
            {pid ? (
              <button
                type="button"
                aria-pressed={assistantOpen}
                title={aiOn ? 'AI features are advisory only' : 'AI is not configured. Everything else works.'}
                onClick={toggleAssistant}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-md px-2.5 text-xs transition-[background-color,color] duration-150 ease-out',
                  assistantOpen ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Sparkles size={14} strokeWidth={1.75} />
                Assistant
                <span className={cn('size-1.5 rounded-full', aiOn ? 'bg-success' : 'bg-fg-subtle')} aria-label={aiOn ? 'AI on' : 'AI off'} />
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-fg-muted" title={aiOn ? 'AI features are advisory only' : 'AI is not configured. Everything else works.'}>
                <span className={cn('size-1.5 rounded-full', aiOn ? 'bg-success' : 'bg-fg-subtle')} /> {aiOn ? 'AI on' : 'AI off'}
              </span>
            )}
            <ThemeToggle />
            {name && (
              <>
                <span className="grid size-8 place-items-center rounded-full bg-surface-3 text-xs font-medium" title={`${name} · ${role}`}>
                  {initials(name)}
                </span>
                <button
                  aria-label="Sign out"
                  className="grid size-8 place-items-center rounded-md text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg"
                  onClick={() => {
                    signOut()
                    nav('/login')
                  }}
                >
                  <LogOut size={15} strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
          <AssistantPanel />
        </div>
      </div>
    </div>
  )
}
