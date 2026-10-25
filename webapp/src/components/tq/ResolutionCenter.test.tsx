import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import { usePending } from '@/state/pending'
import { useSession } from '@/state/session'
import { ResolutionCenter } from './ResolutionCenter'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const group = (o: Record<string, unknown> = {}) => ({
  key: 'TQ-DATA:area', code: 'TQ-DATA', category: 'missing data', priority: 'P3', title: 'Tag and cable use different area numbers', why: 'Usually a naming quirk.',
  tq_ids: ['a', 'b'], open_ids: ['a', 'b'], signals: 6, status: 'open', samples: ['tag x and cable y'], can_place: false,
  options: [{ label: 'Correct the source data', consequence: 'allocated next run', effect: 'note', changes_allocation: false, needs: [], choices: [] }, { label: 'Leave as is', consequence: 'default stays', effect: 'note', changes_allocation: false, needs: [], choices: [] }],
  recommended: { option: 'Leave as is', scope: 'everywhere', reason: 'Informational.' }, ...o,
})

let calls: { path: string; body?: unknown }[] = []
let placements: unknown = {}
function mount(groups: unknown[]) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
    const path = new URL(req.url).pathname
    const body = req.method === 'POST' ? await req.clone().json().catch(() => undefined) : undefined
    calls.push({ path, body })
    if (path.endsWith('/tq-groups')) return json(groups)
    if (path.endsWith('/runs')) return json([{ id: 'r1', status: 'finished', created_at: '2026-01-01T00:00:00Z' }])
    if (path.endsWith('/rules')) return json({ preset: 'strict', custom: false, rules: [{ id: 'STRICT-LOGIC', name: 'Same logic number stays together' }] })
    if (path.includes('/placements')) return json(placements)
    if (path.endsWith('/answer')) return json({ answer: {}, tq: {}, history: [] })
    if (path.endsWith('/bulk-answer')) return json({ answered: (body as { tq_ids: string[] }).tq_ids, failed: [] })
    return json({})
  }))
  render(<QueryClientProvider client={makeQueryClient()}><MemoryRouter><ResolutionCenter pid="p1" /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { useSession.setState({ name: 'Priya' }); usePending.setState({ changed: {} }) })
afterEach(() => vi.unstubAllGlobals())

describe('ResolutionCenter', () => {
  it('applies the recommended answer to every open question in the group at once', async () => {
    mount([group()])
    expect(await screen.findByText('Tag and cable use different area numbers')).toBeInTheDocument()
    expect(screen.getByText(/Records your decision; the layout stays as it is/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Leave as is' }))
    expect(calls.find((c) => c.path.endsWith('/bulk-answer'))?.body).toMatchObject({ tq_ids: ['a', 'b'], option: 'Leave as is', scope: 'everywhere', author: 'Priya' })
    expect(usePending.getState().changed.p1 ?? 0).toBe(0) // a note never asks for a re-run
  })

  it('offers no automatic answer for a blocking group and counts layout-changing answers for a re-run', async () => {
    mount([group({ code: 'TQ-VALUE', priority: 'P1', title: "Unrecognised io type 'Analog In'", recommended: null, tq_ids: ['v'], open_ids: ['v'], signals: 1, options: [{ label: 'Map to a known value', consequence: 'follows value', effect: 'value', changes_allocation: true, needs: ['value'], choices: ['AIR', 'DIR'] }, { label: 'Keep the default policy', consequence: 'default', effect: 'note', changes_allocation: false, needs: [], choices: [] }] })])
    expect(await screen.findByText(/No safe automatic answer/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Choose an answer/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Pick value' }))
    await userEvent.selectOptions(screen.getByLabelText('Value for Map to a known value'), 'AIR')
    await userEvent.click(screen.getByRole('button', { name: /Apply to all/ }))
    expect(calls.find((c) => c.path.endsWith('/bulk-answer'))?.body).toMatchObject({ option: 'Map to a known value', value: 'AIR' })
    expect(usePending.getState().changed.p1).toBe(1)
    expect(await screen.findByText(/Re-run to see the effect|changes the allocation/)).toBeInTheDocument()
  })

  const placeGroup = () => group({ code: 'TQ-RULE', priority: 'P1', title: 'Cables no rule-compliant slot can hold', recommended: null, can_place: true, tq_ids: ['t1'], open_ids: ['t1'], signals: 24,
    cables: [{ tq_id: 't1', cable: '320-CE-0001', signals: 24, open: true }],
    options: [{ label: 'Waive the rule', consequence: 'not enforced', effect: 'rule_waive', changes_allocation: true, needs: ['fields:rule'], choices: [] }, { label: 'Place it in a chosen slot', consequence: 'placed', effect: 'place', changes_allocation: true, needs: ['placement'], choices: [] }] })

  it('lists legal slots for a held-out cable and saves the verified one', async () => {
    placements = { cable: '320-CE-0001', size: 2, blockers: {}, candidates: [{ cioc_no: 2, cioc_name: 'CIOC-02', cells: [[1, 1], [1, 2]], summary: 'Cabinet 1 · CIOC-02 · baseplate 1 ch 1 to baseplate 1 ch 2', same_group: true }] }
    mount([placeGroup()])
    await userEvent.click(await screen.findByRole('button', { name: /Choose an answer/ }))
    expect(await screen.findByText(/1 legal slot found/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Verify and place here' }))
    expect(calls.find((c) => c.path.endsWith('/answer'))?.body).toMatchObject({ option: 'Place it in a chosen slot', scope: 'cable', target: '320-CE-0001', fields: { cioc: 2, cells: [[1, 1], [1, 2]] } })
    expect(usePending.getState().changed.p1).toBe(1)
  })

  it('names the rule blocking every slot and offers to waive it', async () => {
    placements = { cable: '320-CE-0001', size: 24, candidates: [], reason: 'none', blockers: { 'STRICT-LOGIC': 83 } }
    mount([placeGroup()])
    expect(await screen.findByText(/No free position is legal/)).toBeInTheDocument()
    expect(screen.getByText(/Same logic number stays together · rejected 83 positions/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Waive STRICT-LOGIC' }))
    expect(calls.find((c) => c.path.endsWith('/bulk-answer'))?.body).toMatchObject({ option: 'Waive the rule', fields: { rule: 'STRICT-LOGIC' } })
  })
})
