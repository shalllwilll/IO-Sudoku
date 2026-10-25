import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, unwrap } from './client'
import { ApiError } from './errors'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns typed data on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, [{ id: 'p1', name: 'A', runs: 0, uploads: 0, created_at: 'x' }])))
    const list = await unwrap(api.GET('/api/projects'))
    expect(list[0].id).toBe('p1')
  })

  it('throws ApiError with the backend code on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { code: 'not_found', message: 'gone', details: null })))
    const err = await unwrap(api.GET('/api/projects/{pid}', { params: { path: { pid: 'zz' } } })).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 404, code: 'not_found' })
  })

  it('maps a network failure to code "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const err = await unwrap(api.GET('/api/projects')).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('network')
  })
})
