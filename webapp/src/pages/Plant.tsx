import { ArrowLeft, Box } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/Button'

export default function Plant() {
  const nav = useNavigate()
  return (
    <Shell crumbs={['Projects', 'Unit 100 allocation', 'Results', '3D plant']}>
      <div className="grid h-full place-items-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-fg-muted">
            <Box size={22} strokeWidth={1.5} />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">3D plant view</h1>
          <p className="text-fg-muted text-pretty">
            The 3D model mounts here. It receives the layout, placements and TQs of this run, and reports back the slot a
            user selects, so both views stay in step.
          </p>
          <Button icon={<ArrowLeft size={15} strokeWidth={1.75} />} onClick={() => nav('/preview/layout')}>
            Back to layout
          </Button>
        </div>
      </div>
    </Shell>
  )
}
