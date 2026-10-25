import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import Plant from './Plant'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const layout = { run_id: 'r1', cioc_labels: {}, layout: { spare_baseplates_per_cabinet: 0, cabinets: [{ no: 1, name: 'CAB-1', ciocs: [1] }], ciocs: [{ no: 1, name: 'CIOC-1', cabinet: 1, seq_in_cabinet: 1, controller: 1, baseplates: [{ name: 'BP-1', cioc_no: 1, n: 1, reserved: null }] }] } }
const allocation = { run_id: 'r1', solver: 'greedy', utilisation: {}, placements: [], unplaced: [], issues: [], rows: [] }

function mount() {
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/layout')) return json(layout)
    if (path.endsWith('/allocation')) return json(allocation)
    if (path.endsWith('/tqs')) return json([])
    return json({})
  }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const router = createMemoryRouter([{ path: '/projects/:pid/runs/:rid/plant', element: <Plant /> }], { initialEntries: ['/projects/p1/runs/r1/plant'] })
  render(<QueryClientProvider client={makeQueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Plant', () => {
  it('keeps the 2D layout available when WebGL cannot be created', async () => {
    mount()
    expect(await screen.findByText(/3D view is unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open 2d layout/i })).toHaveAttribute('href', '/projects/p1/runs/r1/layout')
  })
})
