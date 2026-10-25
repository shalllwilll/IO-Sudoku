import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import { usePending } from '@/state/pending'
import { useSession } from '@/state/session'
import type { TQ } from '@/lib/tq'
import { TqInbox } from './TqInbox'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const tq = (o: Partial<TQ> = {}): TQ =>
  ({
    id: 'TQ-1', code: 'TQ-VALUE', severity: 'assumed', category: 'missing data', subject: 'f.xlsx:5', message: "unknown IO type 'Analog In'", default_applied: 'kept the safe default', scope: 'signal', status: 'open', answer: null,
    options: [{ label: 'Map to a known value', consequence: 'signal follows that value' }, { label: 'Keep the default policy', consequence: 'keeps the default' }],
    signal_keys: ['f.xlsx:5'], data: { field: 'io_type', value: 'Analog In' }, ...o,
  }) as TQ

let calls: { path: string; method: string; body?: unknown }[] = []
function mount(tqs: TQ[]) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
    const path = new URL(req.url).pathname
    const body = req.method === 'POST' ? await req.clone().json() : undefined
    calls.push({ path, method: req.method, body })
    if (path.endsWith('/answer')) return json({ answer: { seq: 1, tq_id: 'TQ-1', option: body.option, scope: body.scope, author: 'Priya', at: '', effect: body.value ? 'value' : 'note', value: body.value }, tq: { ...tqs[0], status: 'answered' }, history: [{ seq: 1, tq_id: 'TQ-1', option: body.option, scope: body.scope, author: 'Priya', at: '', effect: 'value', value: body.value }] })
    if (path.endsWith('/values')) return json({ unknown: [], overrides: {}, allowed: { io_type: ['AIR', 'AOR'], duty_class: [], segregation: [] } })
    if (path.endsWith('/ai/status')) return json({ ai_available: false, models: [] })
    return json({})
  }))
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <TqInbox pid="p1" tqs={tqs} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  useSession.setState({ name: 'Priya', role: 'engineer' })
  usePending.setState({ changed: {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('TqInbox', () => {
  it('groups by category, hides answered by default and filters', async () => {
    mount([tq(), tq({ id: 'TQ-2', code: 'TQ-CAP', category: 'capacity issues', message: 'cap problem', severity: 'blocking' }), tq({ id: 'TQ-3', status: 'answered', message: 'old one' })])
    expect(screen.getByRole('region', { name: 'missing data' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'capacity issues' })).toBeInTheDocument()
    expect(screen.queryByText('old one')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'answered' }))
    expect(screen.getByText('old one')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Blocking' }))
    expect(screen.queryByText('old one')).not.toBeInTheDocument()
    expect(screen.getByText('cap problem')).toBeInTheDocument()
  })

  it('answers a value question and marks the project as needing a re-run', async () => {
    mount([tq()])
    await userEvent.click(screen.getByText("unknown IO type 'Analog In'"))
    const detail = screen.getByRole('complementary', { name: 'Question detail' })
    await userEvent.click(within(detail).getByRole('button', { name: 'Save answer' }))
    expect(await within(detail).findByRole('alert')).toHaveTextContent('Pick the value')
    await userEvent.selectOptions(await within(detail).findByLabelText('Becomes'), 'AIR')
    await userEvent.click(within(detail).getByRole('button', { name: 'Save answer' }))
    expect(await within(detail).findByLabelText('Answer history')).toHaveTextContent('Priya chose “Map to a known value” (AIR)')
    const post = calls.find((c) => c.path.endsWith('/answer'))!
    expect(post.body).toMatchObject({ option: 'Map to a known value', value: 'AIR', scope: 'row', target: 'f.xlsx:5', author: 'Priya' })
    expect(usePending.getState().changed.p1).toBe(1)
  })

  it('a note answer does not count as changing run inputs', async () => {
    mount([tq()])
    await userEvent.click(screen.getByText("unknown IO type 'Analog In'"))
    await userEvent.click(screen.getByRole('radio', { name: /Keep the default policy/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save answer' }))
    await vi.waitFor(() => expect(calls.some((c) => c.path.endsWith('/answer'))).toBe(true))
    expect(usePending.getState().changed.p1 ?? 0).toBe(0)
  })

  it('shows the re-run banner when answers are pending', () => {
    usePending.setState({ changed: { p1: 2 } })
    mount([tq()])
    expect(screen.getByRole('status')).toHaveTextContent('2 answers change run inputs')
    expect(screen.getByRole('link', { name: 'Run again to apply' })).toHaveAttribute('href', '/projects/p1/run')
  })

  it('has an empty state', () => {
    mount([])
    expect(screen.getByText(/No questions yet/)).toBeInTheDocument()
  })
})
