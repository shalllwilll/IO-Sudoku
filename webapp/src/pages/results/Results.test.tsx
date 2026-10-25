import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import ResultsFrame from '../ResultsFrame'
import Allocation from './Allocation'
import LayoutTab from './LayoutTab'
import Overview from './Overview'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const layout = {
  run_id: 'r1',
  cioc_labels: {},
  layout: {
    cabinets: [{ no: 1, name: 'CAB-1', ciocs: [1] }],
    ciocs: [{ no: 1, name: 'CIOC1', cabinet: 1, seq_in_cabinet: 1, controller: 1, baseplates: [{ name: 'BP-1', cioc_no: 1, n: 1, reserved: 'alarm' }, { name: 'BP-2', cioc_no: 1, n: 2, reserved: null }] }],
  },
}
const placements = [
  { cioc_no: 1, baseplate: 2, channel: 1, kind: 'field', pair: 1, signal: { tag: 'FT-100', io_type: 'AIR', cable: 'C-1', segregation_family: 'A' } },
  { cioc_no: 1, baseplate: 2, channel: 2, kind: 'wired_spare', io_type: 'DOR', block_id: 'C-9', pair: 3 },
]
const allocation = { run_id: 'r1', solver: 'cpsat', utilisation: {}, placements, unplaced: [], issues: [], rows: [{ cioccslsname: 'CIOC1', baseplate: 'BP-2', channelno: 1, charmtype: 'SE4301' }] }
const report = {
  run_id: 'r1',
  report: {
    kpi: { signals_total: 2, allocated: 2, held_out: 0, cabinets: 1, ciocs: 1, baseplates: 8, baseplates_used: 2, positions: 96, occupied: 2, utilisation: 0.0208, by_io_type: { AIR: { field: 1, wired_spare: 0 }, DOR: { field: 0, wired_spare: 1 } }, spares: { by_controller_io: [{ controller: 'CTL1', io_type: 'AIR', field_signals: 1, wired_spares: 0, required: 1 }], cabinets: [] } },
    rules: [{ rule: 'R-CAP', description: 'Capacity respected', passed: true, violations: 0, enforced: true, strength: 'hard' }, { rule: 'R-X', description: 'Something fails', passed: false, violations: 2, enforced: true, strength: 'soft' }],
    declaration: { assumed: ['Hierarchy as confirmed'], defaulted: [], not_enforced: [], rule_set: 'plant-default (abc)' },
  },
}
const run = (o: object = {}) => ({ id: 'r1abcdef0', project_id: 'p1', status: 'finished', created_at: '2026-01-01T00:00:00Z', download_ready: true, ...o })

function mount(path: string, runOut = run()) {
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
    const p = new URL(req.url).pathname
    if (p.endsWith('/report')) return json(report)
    if (p.endsWith('/allocation')) return json(allocation)
    if (p.endsWith('/layout')) return json(layout)
    return json(runOut)
  }))
  const router = createMemoryRouter(
    [{ path: '/projects/:pid/runs/:rid', element: <ResultsFrame />, children: [{ index: true, element: <Overview /> }, { path: 'allocation', element: <Allocation /> }, { path: 'layout', element: <LayoutTab /> }] }],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
// jsdom lays nothing out; the virtualizer reads clientHeight/clientWidth, so give every element a size so the virtualized table has a viewport.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Results', () => {
  it('overview shows KPIs, spare shortfall, failing rules and assumptions', async () => {
    mount('/projects/p1/runs/r1')
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByText('1 failing')).toBeInTheDocument()
    expect(screen.getByLabelText('Short')).toBeInTheDocument()
    expect(screen.getByText('Something fails')).toBeInTheDocument()
    expect(screen.getByText('Hierarchy as confirmed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download \.xlsx/i })).toHaveAttribute('href', expect.stringContaining('/runs/r1/download'))
  })

  it('allocation lists occupied positions, filters, and opens the inspector with hardware details', async () => {
    mount('/projects/p1/runs/r1/allocation')
    expect(await screen.findByText('FT-100')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 positions')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'DOR' }))
    expect(screen.queryByText('FT-100')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'DOR' }))
    await userEvent.click(screen.getByText('FT-100'))
    expect(await screen.findByText('SE4301')).toBeInTheDocument()
  })

  it('layout shows the CIOC grid and a positions inspector', async () => {
    mount('/projects/p1/runs/r1/layout')
    expect(await screen.findByRole('region', { name: 'CIOC 1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /CIOC 1, baseplate 2, channel 1:/ }))
    expect(screen.getByText('CIOC 1 · BP 2 · CH 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view in 3d/i })).toHaveAttribute('href', '/projects/p1/plant?run=r1')
  })

  it('explains an unfinished run instead of showing empty tabs', async () => {
    mount('/projects/p1/runs/r1', run({ status: 'failed', error: 'boom', download_ready: false }))
    expect(await screen.findByText(/This run failed: boom/)).toBeInTheDocument()
  })
})
