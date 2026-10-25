/** Run progress: the event shapes the API streams, a pure reducer into screen state, and a pacer. */

export interface StreamEvent {
  seq: number
  type: string
  at: string
  data: Record<string, any>
}

export const STAGE_ORDER = ['ingest', 'map', 'normalise', 'hardware', 'layout', 'pack'] as const
export const STAGE_INFO: Record<string, { label: string; detail: string }> = {
  ingest: { label: 'Ingest', detail: 'Read workbook, detect header, merge files' },
  map: { label: 'Map', detail: 'Match source columns to canonical fields' },
  normalise: { label: 'Normalise', detail: 'Resolve IO types, duty classes, segregation' },
  hardware: { label: 'Hardware', detail: 'Select CHARM and terminal block per signal' },
  layout: { label: 'Layout', detail: 'Derive cabinets, CIOCs and baseplates' },
  pack: { label: 'Pack', detail: 'Place cable blocks, validate against hard rules' },
}

export type CellKind = 'field' | 'wired_spare' | 'spare_slot' | 'cabinet_alarm' | 'empty'
export const TERMINAL_TYPES = ['run.finished', 'error']

export interface RunView {
  started?: { uploads: number; params: Record<string, unknown> }
  stages: Record<string, { state: 'active' | 'done'; reused?: boolean; seconds?: number }>
  groups: number
  /** `${cioc}:${baseplate}:${channel}` -> kind, in arrival order */
  cells: Map<string, CellKind>
  counts: Record<CellKind, number>
  rejections: { code: string; message: string; signals: number; keys: string[] }[]
  spare?: { wired: number; protectedPairs: number; slots: number }
  solver: { solver: string; status: string; detail: string }[]
  fallbacks: { solver: string; reason: string }[]
  tqs: { id: string; code: string; severity: string; category: string; message: string; signals: number }[]
  validation?: { ok: boolean; violations: number; items: string[] }
  finished?: { allocated: number; heldOut: number; tqs: number; solver: string }
  error?: { code: string; message: string }
  /** short human log of what has been shown, newest last */
  log: { seq: number; type: string; text: string }[]
}

export const emptyView = (): RunView => ({
  stages: {},
  groups: 0,
  cells: new Map(),
  counts: { field: 0, wired_spare: 0, spare_slot: 0, cabinet_alarm: 0, empty: 0 },
  rejections: [],
  solver: [],
  fallbacks: [],
  tqs: [],
  log: [],
})

function text(e: StreamEvent): string {
  const d = e.data
  switch (e.type) {
    case 'run.started':
      return `${d.uploads} ${d.uploads === 1 ? 'upload' : 'uploads'}`
    case 'stage.started':
      return String(d.stage)
    case 'stage.finished':
      return `${d.stage}${d.reused ? ' · reused' : ` · ${Number(d.seconds).toFixed(2)} s`}`
    case 'group.formed':
      return `${d.group?.id} · ${d.group?.signals} signals`
    case 'placement':
      return `batch ${d.batch} · ${d.count} positions`
    case 'rejection':
      return `${d.code} · ${d.signals} signals held out`
    case 'spare.assigned':
      return `${d.wired_spare_pairs} wired · ${d.protected_spare_pairs ?? 0} protected`
    case 'solver.status':
      return `${d.solver} · ${d.status}${d.detail ? ` · ${d.detail}` : ''}`
    case 'fallback.triggered':
      return `${d.solver} · ${d.reason}`
    case 'tq.raised':
      return `${d.code} · ${d.message}`
    case 'validation.result':
      return d.ok ? 'ok · 0 violations' : `${d.violations} violations`
    case 'run.finished':
      return `${d.allocated} placed · ${d.held_out} held out`
    case 'error':
      return `${d.code} · ${d.message}`
    default:
      return ''
  }
}

/** Apply one event. Never mutates the previous view. */
export function reduce(v: RunView, e: StreamEvent): RunView {
  const d = e.data
  const next: RunView = { ...v, log: [...v.log, { seq: e.seq, type: e.type, text: text(e) }] }
  switch (e.type) {
    case 'run.started':
      next.started = { uploads: d.uploads, params: d.params ?? {} }
      break
    case 'stage.started':
      next.stages = { ...v.stages, [d.stage]: { state: 'active' } }
      break
    case 'stage.finished':
      next.stages = { ...v.stages, [d.stage]: { state: 'done', reused: d.reused, seconds: d.seconds } }
      break
    case 'group.formed':
      next.groups = v.groups + 1
      break
    case 'placement': {
      const cells = new Map(v.cells)
      const counts = { ...v.counts }
      for (const p of d.placements as { cioc_no: number; baseplate: number; channel: number; kind: CellKind }[]) {
        const key = `${p.cioc_no}:${p.baseplate}:${p.channel}`
        const prev = cells.get(key)
        if (prev) counts[prev] -= 1
        cells.set(key, p.kind)
        counts[p.kind] = (counts[p.kind] ?? 0) + 1
      }
      next.cells = cells
      next.counts = counts
      break
    }
    case 'rejection':
      next.rejections = [...v.rejections, { code: d.code, message: d.message, signals: d.signals, keys: d.keys ?? [] }]
      break
    case 'spare.assigned':
      next.spare = { wired: d.wired_spare_pairs, protectedPairs: d.protected_spare_pairs ?? 0, slots: d.spare_slots }
      break
    case 'solver.status':
      next.solver = [...v.solver, { solver: d.solver, status: d.status, detail: d.detail ?? '' }]
      break
    case 'fallback.triggered':
      next.fallbacks = [...v.fallbacks, { solver: d.solver, reason: d.reason }]
      break
    case 'tq.raised':
      next.tqs = [...v.tqs, { id: d.id, code: d.code, severity: d.severity, category: d.category, message: d.message, signals: d.signals }]
      break
    case 'validation.result':
      next.validation = { ok: d.ok, violations: d.violations, items: d.items ?? [] }
      break
    case 'run.finished':
      next.finished = { allocated: d.allocated, heldOut: d.held_out, tqs: d.tqs, solver: d.solver }
      break
    case 'error':
      next.error = { code: d.code, message: d.message }
      break
  }
  return next
}

/** How long to hold each event on screen. The backend emits most events in one burst, so this is what makes the run readable. */
const BASE_GAP: Record<string, number> = {
  'run.started': 200,
  'stage.started': 120,
  'stage.finished': 160,
  'group.formed': 90,
  placement: 420,
  rejection: 300,
  'spare.assigned': 350,
  'solver.status': 350,
  'fallback.triggered': 450,
  'tq.raised': 220,
  'validation.result': 450,
  'run.finished': 0,
  error: 0,
}
const BUDGET_MS = 4000
const MIN_GAP = 8

export function paceGap(type: string, queued: number, reduceMotion = false): number {
  const base = BASE_GAP[type] ?? 150
  const squeezed = Math.min(base, Math.max(MIN_GAP, BUDGET_MS / Math.max(queued, 1)))
  return reduceMotion ? Math.min(squeezed, 30) : squeezed
}

/** Releases queued events one at a time at the paced gap. A live event arriving on an idle queue is shown at once. */
export class Pacer {
  private queue: StreamEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private ready = true
  private readonly show: (e: StreamEvent) => void
  private readonly reduceMotion: boolean

  constructor(show: (e: StreamEvent) => void, reduceMotion = false) {
    this.show = show
    this.reduceMotion = reduceMotion
  }

  push(e: StreamEvent) {
    this.queue.push(e)
    if (this.ready) this.next()
  }

  get pending() {
    return this.queue.length
  }

  private next() {
    const e = this.queue.shift()
    if (!e) return
    this.show(e)
    this.ready = false
    this.timer = setTimeout(
      () => {
        this.ready = true
        if (this.queue.length) this.next()
      },
      paceGap(e.type, this.queue.length, this.reduceMotion),
    )
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.queue = []
  }
}
