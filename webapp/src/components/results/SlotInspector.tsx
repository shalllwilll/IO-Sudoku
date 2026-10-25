import type { Allocation } from '@/api/queries'
import { KIND_LABEL } from '@/components/charm/kinds'
import { cn } from '@/lib/cn'
import { charmNo } from '@/lib/hierarchy'
import { rowFor, type Slot } from '@/lib/results'

const EXPLAIN: Record<Slot['kind'], string> = {
  field: 'A field signal placed by the solver and checked by the validator.',
  wired_spare: 'CHARM and terminal block installed. Taken from a declared unused pair to meet the 10% spare rule; confirm it is wired (TQ-SPARE).',
  spare_slot: 'Declared cable pair, protected so nothing else takes it. No CHARM installed.',
  cabinet_alarm: 'Cabinet alarm, on the reserved first baseplate of the cabinet.',
  empty: 'Unused position.',
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="shrink-0 text-xs text-fg-muted">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right text-[13px]', mono && 'font-mono tnum')}>{value}</dd>
    </div>
  )
}

const text = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(v))

/** Context drawer, rendered only when a user selects a physical position. */
export function SlotInspector({ slot, rows, onClose }: { slot?: Slot; rows: Allocation['rows']; onClose: () => void }) {
  const row = slot ? rowFor(rows, slot) : undefined
  const sig = slot?.placement?.signal
  return (
    <aside
      aria-label="Slot inspector"
      className={cn(
        'fixed inset-y-0 right-0 z-40 w-full max-w-[380px] overflow-auto overscroll-contain border-l border-border-strong bg-surface-1 p-5 shadow-float',
        'max-md:inset-x-0 max-md:top-auto max-md:max-w-none max-md:max-h-[60%] max-md:rounded-t-xl max-md:border-l-0 max-md:border-t',
      )}
    >
      {slot ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Position</span>
            <button className="rounded px-1.5 text-xs text-fg-muted hover:text-fg" onClick={onClose}>
              Close
            </button>
          </div>
          <h2 className="font-mono text-[15px] font-medium tnum">
            CIOC {slot.cioc} · BP {slot.bp} · CH {slot.ch}
          </h2>
          <p className="mt-3 rounded-md bg-surface-2 p-3 text-xs text-fg-muted text-pretty">
            <span className="mb-1 block text-[13px] font-medium text-fg">{KIND_LABEL[slot.kind]}</span>
            {EXPLAIN[slot.kind]}
          </p>
          <dl className="mt-4">
            <Row label="Tag" value={slot.tag} mono />
            <Row label="IO type" value={slot.io} mono />
            <Row label="Cable" value={slot.cable} mono />
            <Row label="Pair" value={slot.pair} mono />
            <Row label="Segregation" value={text(sig?.segregation) ?? slot.seg} />
            <Row label="Affinity group" value={slot.group} mono />
            <Row label="Service" value={sig?.service ?? undefined} />
            <Row label="CHARM_No" value={charmNo(slot.bp, slot.ch)} mono />
            <Row label="CHARM type" value={text(row?.charmtype)} mono />
            <Row label="Terminal block" value={text(row?.charmtbpartno)} mono />
            <Row label="CIOC" value={slot.ciocName} mono />
            <Row label="Baseplate" value={slot.bpName} mono />
            <Row label="Cabinet" value={text(row?.electronicmarshallingcabinet) ?? slot.cab} mono />
            <Row label="Controller" value={text(row?.controller)} mono />
            <Row label="Change" value={slot.placement?.change ?? undefined} />
          </dl>
        </>
      ) : (
        <div className="grid h-full place-items-center text-center text-[13px] text-fg-subtle text-pretty">Select a position to see its signal, cable pair and why it is there.</div>
      )}
    </aside>
  )
}
