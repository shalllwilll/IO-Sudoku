/** Confirmed plant hierarchy. Counts of cabinets and CIOCs always come from the API. */
export type Io = 'AIR' | 'AOR' | 'DIR' | 'DOR'
export const IO_TYPES: Io[] = ['AIR', 'AOR', 'DIR', 'DOR']
export const CIOCS_PER_CABINET = 4
export const BASEPLATES = 8
export const CHANNELS = 12
export const charmNo = (bp: number, ch: number) => (bp - 1) * CHANNELS + ch
