import { ArrowUpRight, Box } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

/**
 * The hardware visualisation remains its teammate-owned, standalone application.
 * It intentionally receives no workbook data or allocation data from this client.
 */
export default function Plant() {
  const { pid = '', rid = '' } = useParams()
  const stageUrl = (import.meta.env.VITE_PLANT_URL as string | undefined)?.trim() || 'http://127.0.0.1:5182/plant'
  const back = `/projects/${pid}/runs/${rid}/layout`
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <div className="max-w-md rounded-xl border border-border-strong bg-surface-1 p-6 text-center shadow-card">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><Box size={21} strokeWidth={1.75} /></span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Standalone 3D model</h1>
        <p className="mt-2 text-[13px] text-fg-muted">The 3D hardware model runs independently. Open it in a separate tab, then return here to inspect the allocation data.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={stageUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-fg transition-[background-color] duration-150 ease-out hover:bg-accent-strong">Open standalone 3D model <ArrowUpRight size={15} strokeWidth={1.75} /></a>
          <Link to={back} className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-[13px] font-medium text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg">Back to layout</Link>
        </div>
        <p className="mt-4 text-xs text-fg-subtle">Default local address: {stageUrl}</p>
      </div>
    </div>
  )
}
