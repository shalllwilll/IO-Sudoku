import { Navigate, useParams } from 'react-router-dom'
import { useOpenTqs } from '@/api/queries'

/** Results open on Resolve when something needs a decision, otherwise on the cabinets. */
export default function Landing() {
  const open = useOpenTqs(useParams().pid)
  if (open.isPending) return <p className="p-8 text-[13px] text-fg-muted">Loading…</p>
  return <Navigate to={(open.data?.length ?? 0) > 0 ? 'tqs' : 'layout'} replace />
}
