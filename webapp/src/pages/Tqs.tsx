import { useParams } from 'react-router-dom'
import { useProjectTqs } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { TqInbox } from '@/components/tq/TqInbox'

export default function Tqs() {
  const { pid = '' } = useParams()
  const q = useProjectTqs(pid)
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <p className="p-8 text-[13px] text-fg-muted">Loading questions…</p>
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TqInbox pid={pid} tqs={q.data} />
    </div>
  )
}
