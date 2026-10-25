import type { Io, Slot } from '@/preview/mock'

export const IO_BG: Record<Io, string> = {
  AIR: 'bg-io-air',
  AOR: 'bg-io-aor',
  DIR: 'bg-io-dir',
  DOR: 'bg-io-dor',
}
export const IO_BORDER: Record<Io, string> = {
  AIR: 'border-io-air',
  AOR: 'border-io-aor',
  DIR: 'border-io-dir',
  DOR: 'border-io-dor',
}

export const KIND_LABEL: Record<Slot['kind'], string> = {
  field: 'Field signal',
  wired_spare: 'Wired spare',
  spare_slot: 'Spare slot',
  cabinet_alarm: 'Cabinet alarm',
  empty: 'Unused',
}

export function describe(s: Slot) {
  const where = `CIOC ${s.cioc}, baseplate ${s.bp}, channel ${s.ch}`
  return `${where}: ${KIND_LABEL[s.kind]}${s.io ? ' ' + s.io : ''}${s.tag ? ', ' + s.tag : ''}`
}
