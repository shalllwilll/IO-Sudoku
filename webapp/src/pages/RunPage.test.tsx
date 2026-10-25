import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import RunPage from './RunPage'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

class FakeES {
  static last: FakeES | null = null
  static CLOSED = 2
  readyState = 0
  onerror: (() => void) | null = null
  listeners: Record<string, ((m: { data: string }) => void)[]> = {}
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeES.last = this
  }
  addEventListener(t: string, fn: (m: { data: string }) => void) {
    ;(this.listeners[t] ??= []).push(fn)
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  emit(seq: number, type: string, data: object) {
    for (const fn of this.listeners[type] ?? []) fn({ data: JSON.stringify({ seq, type, at: '', data }) })
  }
}

function mount(initial: string, fetchImpl: (req: Request) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => fetchImpl(req)))
  vi.stubGlobal('EventSource', FakeES)
  const router = createMemoryRouter([{ path: '/projects/:pid/run', element: <RunPage /> }], { initialEntries: [initial] })
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  FakeES.last = null
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const project = { id: 'p1', name: 'P', created_at: 'x', uploads: 1, runs: 0 }
const mapping = { sheets: [], fields: [], required: [], confirmed: {} }
const values = { unknown: [{ field: 'io_type', value: 'x', count: 1 }], overrides: {}, allowed: {} }
const rules = { preset: 'plant-default', presets: [], custom: false, rules: [] }

const setupFetch = (req: Request) => {
  const path = new URL(req.url).pathname
  if (req.method === 'POST') return json(201, { id: 'r9', project_id: 'p1', status: 'running', created_at: 'x', download_ready: false })
  if (path.endsWith('/mapping')) return json(200, mapping)
  if (path.endsWith('/values')) return json(200, values)
  if (path.endsWith('/rules')) return json(200, rules)
  if (path.endsWith('/runs')) return json(200, [])
  return json(200, project)
}

describe('Run page', () => {
  it('summarises readiness and starts a run, then follows it', async () => {
    const router = mount('/projects/p1/run', setupFetch)
    expect(await screen.findByText(/1 file imported/)).toBeInTheDocument()
    expect(await screen.findByText(/1 unrecognised value will become questions/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /start allocation/i }))
    await vi.waitFor(() => expect(router.state.location.search).toBe('?run=r9'))
    expect(await screen.findByRole('list', { name: 'Pipeline stages' })).toBeInTheDocument()
    expect(FakeES.last?.url).toMatch(/\/api\/projects\/p1\/runs\/r9\/events$/)
  })

  it('blocks starting without data', async () => {
    mount('/projects/p1/run', (req) => (new URL(req.url).pathname.endsWith('/projects/p1') ? json(200, { ...project, uploads: 0 }) : setupFetch(req)))
    expect(await screen.findByText('Upload the signal list first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start allocation/i })).toBeDisabled()
  })

  it('replays a burst at reading pace and ends on the results link', async () => {
    mount('/projects/p1/run?run=r9', setupFetch)
    await screen.findByRole('list', { name: 'Pipeline stages' })
    vi.useFakeTimers()
    const es = FakeES.last!
    await act(async () => {
      es.emit(1, 'run.started', { uploads: 1, params: {} })
      es.emit(2, 'stage.started', { stage: 'ingest' })
      es.emit(3, 'tq.raised', { id: 'T1', code: 'TQ-SPARE', severity: 'assumed', category: 'c', message: 'AIR spares assumed', signals: 4 })
      es.emit(4, 'validation.result', { ok: true, violations: 0, items: [] })
      es.emit(5, 'run.finished', { allocated: 189, held_out: 0, tqs: 1, solver: 'cpsat' })
    })
    expect(screen.queryByText('AIR spares assumed')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open results' })).toHaveAttribute('aria-disabled', 'true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.getByText('AIR spares assumed')).toBeInTheDocument()
    expect(screen.getByText(/Validator: every hard rule holds/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open results' })).toHaveAttribute('aria-disabled', 'false')
    expect(es.closed).toBe(true)
  })

  it('falls back to polling when the stream keeps failing', async () => {
    let finished = false
    mount('/projects/p1/run?run=r9', (req) => {
      const path = new URL(req.url).pathname
      if (path.endsWith('/runs/r9')) return json(200, { id: 'r9', project_id: 'p1', status: finished ? 'finished' : 'running', created_at: 'x', download_ready: true, summary: { allocated: 5 } })
      return setupFetch(req)
    })
    await screen.findByRole('list', { name: 'Pipeline stages' })
    vi.useFakeTimers()
    await act(async () => {
      for (let i = 0; i < 3; i++) FakeES.last!.onerror?.()
    })
    expect(screen.getByText(/Live updates are unavailable/)).toBeInTheDocument()
    finished = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByRole('link', { name: 'Open results' })).toHaveAttribute('aria-disabled', 'false')
  })
})
