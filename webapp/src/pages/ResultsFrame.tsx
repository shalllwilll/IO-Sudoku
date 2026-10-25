import { Download } from 'lucide-react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { downloadUrl } from '@/api/client'
import { useRun } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { cn } from '@/lib/cn'

const TABS = [
  ['', 'Overview'],
  ['allocation', 'Allocation'],
  ['layout', 'Layout'],
  ['tqs', 'TQs'],
] as const

const tab = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex h-11 items-center px-3 text-[13px] transition-[color] duration-150 ease-out',
    isActive ? 'text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-fg-muted hover:text-fg',
  )

export default function ResultsFrame() {
  const { pid = '', rid = '' } = useParams()
  const run = useRun(pid, rid)
  if (run.isError) return <ErrorPanel error={run.error} onRetry={() => void run.refetch()} />
  if (!run.data) return <p className="p-8 text-[13px] text-fg-muted">Loading run…</p>
  const r = run.data
  const ready = r.status === 'finished'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-6">
        {TABS.map(([to, label]) => (
          <NavLink key={label} to={to || '.'} end className={tab}>
            {label}
          </NavLink>
        ))}
        <span className="ml-auto mr-3 hidden text-xs text-fg-muted tnum md:block">
          <span className="font-mono">{r.id.slice(0, 8)}</span> · {new Date(r.created_at).toLocaleString()}
        </span>
        {r.download_ready ? (
          <a href={downloadUrl(pid, rid)} className="inline-flex h-8 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3 text-[13px] font-medium transition-[background-color,scale] duration-150 ease-out hover:bg-surface-3 active:scale-[0.96]">
            <Download size={14} strokeWidth={1.75} /> Download .xlsx
          </a>
        ) : (
          <span className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-[13px] text-fg-subtle" title={ready ? 'The allocation workbook was not written for this run.' : 'Available when the run finishes.'}>
            <Download size={14} strokeWidth={1.75} /> Download .xlsx
          </span>
        )}
      </div>
      {ready ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </div>
      ) : (
        <p className="p-8 text-[13px] text-fg-muted">{r.status === 'failed' ? `This run failed: ${r.error ?? 'unknown error'}` : 'This run is still working. Results appear when it finishes.'}</p>
      )}
    </div>
  )
}
