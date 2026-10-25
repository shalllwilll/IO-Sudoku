import { ArrowLeft, Box } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useLayout } from '@/api/queries'

/** Mount point for the 3D scene. Contract: docs/plant-contract.md. */
export default function Plant() {
  const { pid = '', rid = '' } = useParams()
  const layout = useLayout(pid, rid)
  const l = layout.data?.layout
  const back = `/projects/${pid}/runs/${rid}/layout`
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-fg-muted">
          <Box size={22} strokeWidth={1.5} />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">3D plant view</h1>
        <p className="text-[13px] text-fg-muted text-pretty">
          The 3D model is not connected yet. When it is, it opens here with this run&apos;s layout, placements and TQs, and the slot you pick stays in step with the 2D view.
        </p>
        {l && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted tnum">
            Ready to render {l.cabinets?.length ?? 0} cabinets · {l.ciocs?.length ?? 0} CIOCs
          </p>
        )}
        <Link to={back} className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium transition-[background-color] duration-150 ease-out hover:bg-surface-3">
          <ArrowLeft size={15} strokeWidth={1.75} /> Back to layout
        </Link>
      </div>
    </div>
  )
}
