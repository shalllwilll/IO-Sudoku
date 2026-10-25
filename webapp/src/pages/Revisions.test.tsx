import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import Revisions from './Revisions'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const impact = (o = {}) => ({ label: '01', baseline_label: '00', added: 2, deleted: 1, modified: 3, moved: 4, moves_by_reason: { cable_grew: 4 }, cabinets_used_before: 2, cabinets_used_after: 2, ciocs_used_before: 6, ciocs_used_after: 7, wired_spares_before: 17, wired_spares_after: 17, ...o })

let calls: { path: string; method: string; body?: unknown }[] = []
function mount(chain: unknown[]) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
    const url = new URL(req.url)
    const body = req.method === 'POST' ? await req.clone().json().catch(() => undefined) : undefined
    calls.push({ path: url.pathname, method: req.method, body })
    if (url.pathname.endsWith('/baseline')) return json({ label: '00', chain_run_id: 'r1', signals: 10, placed: 10 })
    if (url.pathname.endsWith('/revisions/compare')) return json({ from_label: '00', to_label: '01', added: 2, removed: 1, modified: 3, moved: 4, unchanged: 90, deltas: [{ tag: 'FT-1', kind: 'Added', old_slot: '-', new_slot: '1-2-3', cable: 'C1', pair: 1, fields: [] }, { tag: 'FT-2', kind: 'moved', old_slot: '1-1-1', new_slot: '1-1-2', fields: [] }] })
    if (url.pathname.endsWith('/revisions')) return json(chain)
    if (url.pathname.endsWith('/runs')) return json([{ id: 'abcdef123456', status: 'finished', created_at: '2026-01-01T00:00:00Z', summary: {} }])
    return json({})
  }))
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/projects/p1/revisions']}>
        <Routes>
          <Route path="/projects/:pid/revisions" element={<Revisions />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
afterEach(() => vi.unstubAllGlobals())

describe('Revisions', () => {
  it('asks for a baseline first and sets it from a finished run with the default label', async () => {
    mount([])
    await userEvent.click(await screen.findByRole('button', { name: 'Start from this run' }))
    expect(calls.find((c) => c.path.endsWith('/baseline'))?.body).toEqual({ run_id: 'abcdef123456', label: '00' })
  })

  it('shows the chain with impact and compares two issues, normalising change casing', async () => {
    mount([{ seq: 0, label: '00', run_id: 'r1', parent_label: null, impact: null }, { seq: 1, label: '01', run_id: 'r2', parent_label: '00', impact: impact() }])
    expect(await screen.findByText('Issue 01')).toBeInTheDocument()
    expect(screen.getByText('2 added · 1 deleted · 3 modified · 4 moved')).toBeInTheDocument()
    expect(screen.getByText('Moved: cable grew')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Compare' }))
    expect(await screen.findByText('FT-1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'moved' }))
    expect(screen.queryByText('FT-1')).not.toBeInTheDocument()
    expect(screen.getByText('FT-2')).toBeInTheDocument()
  })
})
