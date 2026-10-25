import { WifiOff } from 'lucide-react'
import { isNetworkError } from '@/api/errors'
import { useHealth } from '@/api/queries'

export function OfflineBanner() {
  const { error, refetch, isFetching } = useHealth()
  if (!isNetworkError(error)) return null
  return (
    <div role="status" className="flex items-center gap-3 border-b border-border bg-warning/10 px-5 py-2 text-[13px]">
      <WifiOff size={15} strokeWidth={1.75} className="text-warning" />
      <span className="text-pretty">The backend is not reachable. Changes cannot be saved until it is back.</span>
      <button className="ml-auto rounded px-2 py-0.5 text-fg-muted hover:text-fg disabled:opacity-60" disabled={isFetching} onClick={() => void refetch()}>
        Retry
      </button>
    </div>
  )
}
