import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from './api/queryClient'
import { routes } from './router'
import { useSession } from './state/session'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

function mount(path: string, fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => useSession.setState({ name: null, role: 'engineer' }))
afterEach(() => vi.unstubAllGlobals())

describe('routing', () => {
  it('redirects to /login when signed out', async () => {
    const router = mount('/projects', async () => json([]))
    expect(await screen.findByRole('heading', { name: /every signal/i })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows the shell when signed in and the offline banner when the backend is down', async () => {
    useSession.setState({ name: 'Priya Nair', role: 'engineer' })
    mount('/projects', async () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(await screen.findByText(/backend is not reachable/i)).toBeInTheDocument()
  })

  it('shows a clear error for an unknown project', async () => {
    useSession.setState({ name: 'Priya Nair', role: 'engineer' })
    mount('/projects/nope/data', async () =>
      new Response(JSON.stringify({ code: 'not_found', message: 'x', details: null }), { status: 404, headers: { 'content-type': 'application/json' } }),
    )
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
  })
})
