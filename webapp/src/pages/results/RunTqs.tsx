import { useParams } from 'react-router-dom'
import { useRunTqs } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { TqInbox } from '@/components/tq/TqInbox'

/** The questions this run raised. Answering here uses the same flow as the project inbox. */
export default function RunTqs() {
  const { pid = '', rid = '' } = useParams()
  const q = useRunTqs(pid, rid)
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <p className="p-8 text-[13px] text-fg-muted">Loading questions…</p>
  return <TqInbox pid={pid} tqs={q.data} runLabel="Questions from this run" />
}
