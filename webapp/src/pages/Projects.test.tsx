import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import { projectStatus } from '@/lib/projectStatus'
import Projects from './Projects'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const project = (o: object) => ({ id: 'p1', name: 'Unit 100', created_at: '2026-01-01T00:00:00+00:00', uploads: 0, runs: 0, area: 'AR1', unit: '100', preset: 'strict', ...o })

function mount(fetchImpl: (req: Request) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((req: Request) => fetchImpl(req)))
  const router = createMemoryRouter(
    [
      { path: '/projects', element: <Projects /> },
      { path: '/projects/:pid', element: <p>workspace</p> },
    ],
    { initialEntries: ['/projects'] },
  )
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('projectStatus', () => {
  it('derives a state from uploads and runs', () => {
    expect(projectStatus({ uploads: 0, runs: 0 }).label).toBe('Needs data')
    expect(projectStatus({ uploads: 1, runs: 0 }).label).toBe('Ready to run')
    expect(projectStatus({ uploads: 1, runs: 1 }).label).toBe('1 run')
    expect(projectStatus({ uploads: 1, runs: 3 }).label).toBe('3 runs')
  })
})

describe('Projects page', () => {
  it('shows an empty state offering the sample plant and a new project', async () => {
    mount(async () => json(200, []))
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load sample plant' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New project' })).toHaveLength(1)
  })

  it('lists projects and filters by search', async () => {
    mount(async () => json(200, [project({}), project({ id: 'p2', name: 'Other', area: 'P30', unit: '32001' })]))
    expect(await screen.findByText('Unit 100')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Search projects'), 'p30')
    expect(screen.queryByText('Unit 100')).not.toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('creates a project and opens it', async () => {
    let body: unknown
    mount(async (req) => {
      if (req.method === 'POST') {
        body = await req.json()
        return json(201, project({ id: 'new' }))
      }
      return json(200, [])
    })
    await screen.findByText('No projects yet')
    await userEvent.click(screen.getByRole('button', { name: 'New project' }))
    await userEvent.type(screen.getByLabelText('Name'), 'My unit')
    await userEvent.click(screen.getByRole('radio', { name: /strict/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('workspace')).toBeInTheDocument()
    expect(body).toMatchObject({ name: 'My unit', preset: 'strict', area: null })
  })

  it('shows the backend error when creation fails', async () => {
    mount(async (req) => (req.method === 'POST' ? json(422, { code: 'validation_error', message: 'bad', details: null }) : json(200, [])))
    await screen.findByText('No projects yet')
    await userEvent.click(screen.getByRole('button', { name: 'New project' }))
    await userEvent.type(screen.getByLabelText('Name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid/i)
  })
})
