import { ArrowLeft, Box, Rotate3D, ScanSearch, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOpenTqs } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { PlantScene } from '@/components/plant/PlantScene'
import { SlotInspector } from '@/components/results/SlotInspector'
import { signalKey } from '@/lib/plant'
import type { Slot } from '@/lib/results'
import { useSlots } from '@/lib/useSlots'

const supportsWebgl = () => {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return reduced
}

/** A scene is always secondary to the auditable 2D layout, so there is a usable fallback. */
export default function Plant() {
  const { pid = '', rid = '' } = useParams()
  const { slots, layout, allocation, loading, error, refetch } = useSlots(pid, rid)
  const openTqs = useOpenTqs(pid)
  const [selected, setSelected] = useState<Slot>()
  const [cabinet, setCabinet] = useState<number | undefined>()
  const [fitKey, setFitKey] = useState(0)
  const reducedMotion = useReducedMotion()
  const webgl = supportsWebgl()
  const back = `/projects/${pid}/runs/${rid}/layout`
  const tqKeys = new Set((openTqs.data ?? []).flatMap((t) => t.signal_keys ?? []))
  const selectedHasTq = selected ? tqKeys.has(signalKey(selected) ?? '') : false

  if (error) return <ErrorPanel error={error} onRetry={refetch} />
  if (loading || !layout || !allocation) return <p className="p-8 text-[13px] text-fg-muted">Loading 3D schematic…</p>
  const cabinets = [...(layout.cabinets ?? [])].sort((a, b) => a.no - b.no)
  const selectedCabinet = cabinet ?? cabinets[0]?.no

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4 max-md:px-4">
        <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent"><Box size={18} strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">3D allocation schematic</h1>
          <p className="text-xs text-fg-muted">Interactive presentation of this run’s actual layout. It does not alter the allocation.</p>
        </div>
        <Link to={back} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-[13px] font-medium transition-[background-color] duration-150 ease-out hover:bg-surface-2">
          <ArrowLeft size={15} strokeWidth={1.75} /> 2D layout
        </Link>
      </header>

      {!webgl ? (
        <main className="grid flex-1 place-items-center p-6">
          <div className="max-w-md rounded-xl border border-border-strong bg-surface-1 p-6 text-center shadow-card">
            <TriangleAlert className="mx-auto mb-3 text-warning" size={24} strokeWidth={1.75} />
            <h2 className="font-medium">3D view is unavailable in this browser</h2>
            <p className="mt-2 text-[13px] text-fg-muted">Your allocation is safe and still available in the detailed 2D schematic.</p>
            <Link to={back} className="mt-5 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-fg">Open 2D layout</Link>
          </div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col p-5 max-md:p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Focus cabinet">
              {cabinets.map((item) => <button key={item.no} type="button" aria-pressed={selectedCabinet === item.no} onClick={() => { setCabinet(item.no); setFitKey((key) => key + 1) }} className={`rounded-md px-2.5 py-1.5 text-xs transition-[background-color,color] duration-150 ease-out ${selectedCabinet === item.no ? 'bg-surface-1 text-fg shadow-card' : 'text-fg-muted hover:text-fg'}`}>Cabinet {item.no}</button>)}
            </div>
            <button type="button" onClick={() => setFitKey((key) => key + 1)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-fg"><ScanSearch size={14} /> Fit view</button>
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-muted"><Rotate3D size={14} /> Drag to inspect · select a CHARM for details</span>
          </div>
          <section aria-label="3D cabinet schematic" className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border border-border-strong bg-[#11181f] shadow-card max-md:min-h-[420px]">
            <PlantScene layout={layout} slots={slots} tqKeys={tqKeys} selected={selected} focusCabinet={selectedCabinet} fitKey={fitKey} reducedMotion={reducedMotion} onSelect={setSelected} />
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md bg-surface-1/90 px-3 py-2 text-[11px] text-fg-muted shadow-card">
              <span><i className="mr-1 inline-block size-2 rounded-sm bg-io-air" />AIR</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-io-aor" />AOR</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-io-dir" />DIR</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-io-dor" />DOR</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-danger" />Open TQ</span>
            </div>
          </section>
          <p className="mt-2 text-xs text-fg-subtle">Cabinet dimensions and surrounding structures are schematic presentation geometry; positions and labels come from the selected run.</p>
        </main>
      )}
      {selected && <SlotInspector slot={selected} rows={allocation.rows} onClose={() => setSelected(undefined)} />}
      {selectedHasTq && <span className="sr-only">The selected position has an open technical query.</span>}
    </div>
  )
}
