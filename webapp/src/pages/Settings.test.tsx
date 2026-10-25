import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import { saveApiBase } from '@/api/config'
import Settings from './Settings'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('Settings', () => {
  it('reports the backend and AI state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (req: Request) => (new URL(req.url).pathname.endsWith('/ai/status') ? json({ ai_available: false, models: [] }) : json({ status: 'ok' }))))
    render(<QueryClientProvider client={makeQueryClient()}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(await screen.findByText('Not configured on this backend')).toBeInTheDocument()
  })

  it('rejects an address without a scheme', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({})))
    render(<QueryClientProvider client={makeQueryClient()}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>)
    const field = screen.getByLabelText(/API address/)
    await userEvent.clear(field)
    await userEvent.type(field, 'localhost:9000')
    expect(screen.getByRole('button', { name: 'Save and reload' })).toBeDisabled()
  })

  it('stores and clears an override', () => {
    saveApiBase('http://x:1/')
    expect(localStorage.getItem('apiBase')).toBe('http://x:1')
    saveApiBase('')
    expect(localStorage.getItem('apiBase')).toBeNull()
  })
})
