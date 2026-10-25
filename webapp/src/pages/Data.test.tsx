import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import Data from './Data'
import MapPage from './Map'
import Values from './Values'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function mount(element: React.ReactNode, fetchImpl: (req: Request) => Promise<Response>) {
  const spy = vi.fn((req: Request) => fetchImpl(req))
  vi.stubGlobal('fetch', spy)
  const router = createMemoryRouter([{ path: '/projects/:pid/x', element }], { initialEntries: ['/projects/p1/x'] })
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return spy
}
afterEach(() => vi.unstubAllGlobals())

const upload = { id: 'u1', name: 'mdb.xlsx', size: 2048, sha256: 'x', created_at: '2026-01-01T00:00:00Z', sheets: [{ sheet: 'MDB-1', rows: 190, header_row: 1, deleted: 2, out_of_scope: 3, columns: [] }] }

describe('Data page', () => {
  it('lists uploads with per-sheet counts', async () => {
    mount(<Data />, async () => json(200, [upload]))
    expect(await screen.findByText('mdb.xlsx')).toBeInTheDocument()
    expect(screen.getByText('190')).toBeInTheDocument()
  })

  it('rejects a non-xlsx file before sending it', async () => {
    const spy = mount(<Data />, async () => json(200, []))
    await screen.findByText(/drop an \.xlsx/i)
    const calls = spy.mock.calls.length
    await userEvent.upload(screen.getByLabelText('Workbook file'), new File(['a'], 'data.csv'), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.xlsx/)
    expect(spy.mock.calls.length).toBe(calls)
  })

  it('shows the server message when the upload is refused', async () => {
    mount(<Data />, async (req) => (req.method === 'POST' ? json(415, { code: 'unreadable_workbook', message: 'bad', details: null }) : json(200, [])))
    await screen.findByText(/drop an \.xlsx/i)
    await userEvent.upload(screen.getByLabelText('Workbook file'), new File(['a'], 'data.xlsx'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be read/)
  })
})

const sheet = {
  file: 'mdb.xlsx',
  sheet: 'S1',
  columns: ['Tag', 'Cable', 'Pair', 'Type', 'Other'],
  grouping_mode: 'none',
  issues: [{ code: 'TQ-MAP', severity: 'warning', message: 'Column Type matched with low confidence', data: {} }],
  matches: {
    tag: { field: 'tag', column: 'Tag', confidence: 1, method: 'alias' },
    cable: { field: 'cable', column: 'Cable', confidence: 0.95, method: 'alias' },
    io_type: { field: 'io_type', column: 'Type', confidence: 0.8, method: 'fuzzy' },
  },
}
const mapping = { sheets: [sheet], fields: ['tag', 'cable', 'pair', 'io_type'], required: ['tag', 'cable', 'pair', 'io_type'], confirmed: {} }

describe('Map page', () => {
  it('blocks confirming while a required field is unmapped, then saves the choice', async () => {
    let put: unknown
    mount(<MapPage />, async (req) => {
      if (req.method === 'PUT') {
        put = await req.json()
        return json(200, { ...mapping, confirmed: (put as { confirmed: object }).confirmed })
      }
      return json(200, mapping)
    })
    expect(await screen.findByText('Column Type matched with low confidence')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Confirm mapping' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText(/Map every required field/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Column for pair'), 'Pair')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(put).toEqual({ confirmed: { 'mdb.xlsx': { tag: 'Tag', cable: 'Cable', pair: 'Pair', io_type: 'Type' } } })
  })
})

const values = {
  unknown: [{ field: 'io_type', value: 'Analog In', count: 3, suggestion: 'AIR' }],
  overrides: { io_types: {}, duty_classes: {}, segregation: {} },
  allowed: { io_type: ['AIR', 'AOR', 'DIR', 'DOR'], duty_class: ['standard'], segregation: ['A', 'B'] },
}

describe('Values page', () => {
  it('saves a decision as an override keyed by the raw value', async () => {
    let put: unknown
    mount(<Values />, async (req) => {
      if (req.method === 'PUT') {
        put = await req.json()
        return json(200, { ...values, unknown: [], overrides: put })
      }
      return json(200, values)
    })
    expect(await screen.findByText('Analog In')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save decisions' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Meaning of Analog In'), 'AIR')
    await userEvent.click(screen.getByRole('button', { name: 'Save decisions' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(put).toMatchObject({ io_types: { 'ANALOG IN': 'AIR' } })
  })

  it('shows the all-clear state when nothing is unknown', async () => {
    mount(<Values />, async () => json(200, { ...values, unknown: [] }))
    expect(await screen.findByText(/Every value in the data is recognised/)).toBeInTheDocument()
  })
})
