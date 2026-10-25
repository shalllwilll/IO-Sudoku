import { useParams, useSearchParams } from 'react-router-dom'
import { useProjectTqs } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { ResolutionCenter } from '@/components/tq/ResolutionCenter'
import { TqInbox } from '@/components/tq/TqInbox'

/** Resolution Center by default; the flat list of every question stays one click away. */
export default function Tqs() {
  const { pid = '' } = useParams()
  const all = useSearchParams()[0].get('all') === '1'
  const q = useProjectTqs(pid)
  if (all) {
    if (q.isError) return <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
    if (!q.data) return <p className="p-8 text-[13px] text-fg-muted">Loading questions…</p>
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TqInbox pid={pid} tqs={q.data} />
      </div>
    )
  }
  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <ResolutionCenter pid={pid} />
    </div>
  )
}
