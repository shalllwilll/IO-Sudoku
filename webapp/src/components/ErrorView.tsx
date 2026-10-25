import { TriangleAlert } from 'lucide-react'
import { useRouteError } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { Button } from '@/components/ui/Button'

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto my-16 flex max-w-md flex-col items-start gap-3 rounded-lg border border-border bg-surface-1 p-5 shadow-card">
      <TriangleAlert size={18} strokeWidth={1.75} className="text-warning" />
      <h2 className="text-[15px] font-medium">Something went wrong</h2>
      <p className="text-[13px] text-fg-muted text-pretty">{describeError(error)}</p>
      <Button onClick={onRetry ?? (() => window.location.reload())}>{onRetry ? 'Try again' : 'Reload'}</Button>
    </div>
  )
}

/** Route-level errorElement. */
export function RouteError() {
  return <ErrorPanel error={useRouteError()} />
}
