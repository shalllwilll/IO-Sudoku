import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyView, Pacer, paceGap, reduce, type StreamEvent } from './runStream'

const ev = (seq: number, type: string, data: Record<string, unknown> = {}): StreamEvent => ({ seq, type, at: '', data })

describe('reduce', () => {
  it('tracks stages and never mutates the previous view', () => {
    const a = emptyView()
    const b = reduce(a, ev(1, 'stage.started', { stage: 'ingest' }))
    const c = reduce(b, ev(2, 'stage.finished', { stage: 'ingest', reused: false, seconds: 0.05 }))
    expect(a.stages).toEqual({})
    expect(b.stages.ingest.state).toBe('active')
    expect(c.stages.ingest).toMatchObject({ state: 'done', seconds: 0.05 })
  })

  it('fills cells from placement batches and counts kinds', () => {
    const v = reduce(
      emptyView(),
      ev(1, 'placement', {
        batch: 1,
        count: 3,
        placements: [
          { cioc_no: 1, baseplate: 1, channel: 1, kind: 'cabinet_alarm' },
          { cioc_no: 1, baseplate: 2, channel: 1, kind: 'field' },
          { cioc_no: 1, baseplate: 2, channel: 2, kind: 'wired_spare' },
        ],
      }),
    )
    expect(v.cells.size).toBe(3)
    expect(v.counts).toMatchObject({ cabinet_alarm: 1, field: 1, wired_spare: 1 })
  })

  it('replacing a cell moves the count instead of double counting', () => {
    const batch = (kind: string) => ev(1, 'placement', { batch: 1, count: 1, placements: [{ cioc_no: 1, baseplate: 1, channel: 1, kind }] })
    const v = reduce(reduce(emptyView(), batch('spare_slot')), batch('field'))
    expect(v.counts).toMatchObject({ spare_slot: 0, field: 1 })
  })

  it('collects TQs, rejections, solver status, validation and the terminal event', () => {
    let v = emptyView()
    v = reduce(v, ev(1, 'tq.raised', { id: 'T1', code: 'TQ-SPARE', severity: 'assumed', category: 'spares', message: 'm', signals: 4 }))
    v = reduce(v, ev(2, 'rejection', { code: 'X', message: 'held', signals: 2, keys: ['a'] }))
    v = reduce(v, ev(3, 'solver.status', { solver: 'cpsat', status: 'optimal', detail: '' }))
    v = reduce(v, ev(4, 'validation.result', { ok: true, violations: 0, items: [] }))
    v = reduce(v, ev(5, 'run.finished', { allocated: 189, held_out: 2, tqs: 1, solver: 'cpsat' }))
    expect([v.tqs.length, v.rejections.length, v.solver.length]).toEqual([1, 1, 1])
    expect(v.validation?.ok).toBe(true)
    expect(v.finished).toEqual({ allocated: 189, heldOut: 2, tqs: 1, solver: 'cpsat' })
    expect(v.log.at(-1)?.text).toBe('189 placed · 2 held out')
  })

  it('records an error event', () => {
    expect(reduce(emptyView(), ev(1, 'error', { code: 'Boom', message: 'bad' })).error).toEqual({ code: 'Boom', message: 'bad' })
  })
})

describe('paceGap', () => {
  it('holds events at their base gap for small runs', () => {
    expect(paceGap('placement', 3)).toBe(420)
  })
  it('squeezes the gap when many events are queued so a big run still takes about 4 s', () => {
    expect(paceGap('group.formed', 400)).toBe(10)
    expect(paceGap('group.formed', 100000)).toBe(8)
  })
  it('is near-instant under reduced motion', () => {
    expect(paceGap('placement', 3, true)).toBe(30)
  })
})

describe('Pacer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the first event at once and releases a burst one by one', () => {
    const shown: number[] = []
    const p = new Pacer((e) => shown.push(e.seq))
    for (let i = 1; i <= 3; i++) p.push(ev(i, 'tq.raised'))
    expect(shown).toEqual([1])
    vi.advanceTimersByTime(paceGap('tq.raised', 2))
    expect(shown).toEqual([1, 2])
    vi.advanceTimersByTime(1000)
    expect(shown).toEqual([1, 2, 3])
  })

  it('shows a later live event immediately once the queue has drained', () => {
    const shown: number[] = []
    const p = new Pacer((e) => shown.push(e.seq))
    p.push(ev(1, 'stage.started'))
    vi.advanceTimersByTime(1000)
    p.push(ev(2, 'stage.finished'))
    expect(shown).toEqual([1, 2])
  })

  it('stop drops anything still queued', () => {
    const shown: number[] = []
    const p = new Pacer((e) => shown.push(e.seq))
    p.push(ev(1, 'tq.raised'))
    p.push(ev(2, 'tq.raised'))
    p.stop()
    vi.advanceTimersByTime(5000)
    expect(shown).toEqual([1])
  })
})
