import { useParams } from 'react-router-dom'
import { useOpenTqs } from '@/api/queries'
import { CabinetExplorer } from '@/components/cabinet/CabinetExplorer'
import { ErrorPanel } from '@/components/ErrorView'
import { useSlots } from '@/lib/useSlots'

export default function LayoutTab() {
  const { pid = '', rid = '' } = useParams()
  const { slots, layout, allocation, error, loading, refetch } = useSlots(pid, rid)
  const openTqs = useOpenTqs(pid)
  if (error) return <ErrorPanel error={error} onRetry={refetch} />
  if (loading || !layout || !allocation) return <p className="p-8 text-[13px] text-fg-muted">Loading layout…</p>
  const tqKeys = new Set((openTqs.data ?? []).flatMap((t) => t.signal_keys ?? []))
  return <CabinetExplorer pid={pid} rid={rid} layout={layout} allocation={allocation} slots={slots} tqKeys={tqKeys} />
}
