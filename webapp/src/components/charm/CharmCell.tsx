import { cn } from '@/lib/cn'
import type { Slot } from '@/lib/results'
import { describe, IO_BG, IO_BORDER } from './kinds'

interface Props {
  slot: Slot
  size?: number
  selected?: boolean
  dimmed?: boolean
  onSelect?: (s: Slot) => void
}

/** One CHARM position. Kind is carried by shape and texture as well as colour. */
export function CharmCell({ slot, size = 20, selected, dimmed, onSelect }: Props) {
  const { kind, io } = slot
  return (
    <button
      type="button"
      aria-label={describe(slot)}
      aria-pressed={selected}
      onClick={() => onSelect?.(slot)}
      style={{ width: size, height: size }}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-[5px] transition-[opacity,box-shadow,background-color] duration-150 ease-out',
        kind === 'field' && io && IO_BG[io],
        kind === 'wired_spare' && io && ['border-2 bg-transparent', IO_BORDER[io]],
        kind === 'spare_slot' && 'border border-dashed border-fg-subtle bg-transparent',
        kind === 'cabinet_alarm' && 'bg-fg-muted pat-alarm',
        kind === 'empty' && 'bg-surface-2',
        dimmed && 'opacity-20',
        selected && 'ring-2 ring-fg ring-offset-2 ring-offset-bg',
      )}
    >
      {kind === 'wired_spare' && io && <span className={cn('size-1.5 rounded-full', IO_BG[io])} />}
    </button>
  )
}
