import createClient, { type Middleware } from 'openapi-fetch'
import { API_BASE } from './config'
import { ApiError, fromResponse } from './errors'
import type { components, paths } from './schema'

export type Schemas = components['schemas']

/** Turns every non-2xx response and every network failure into an ApiError. */
const errors: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined
    let body: unknown
    try {
      body = await response.clone().json()
    } catch {
      body = undefined
    }
    throw fromResponse(response.status, body)
  },
  onError({ error }) {
    if (error instanceof ApiError) return error
    if (error instanceof DOMException && error.name === 'AbortError') return error
    return new ApiError(0, 'network', 'Network request failed')
  },
}

export const api = createClient<paths>({ baseUrl: API_BASE, fetch: (request) => globalThis.fetch(request) })
api.use(errors)

/** Unwrap a typed call: the data on success, a thrown ApiError otherwise. */
export async function unwrap<T>(call: Promise<{ data?: T }>): Promise<T> {
  const { data } = await call
  return data as T
}

export const downloadUrl = (pid: string, rid: string) =>
  `${API_BASE}/api/projects/${encodeURIComponent(pid)}/runs/${encodeURIComponent(rid)}/download`

export const reportXlsxUrl = (pid: string, rid: string, kind: string) =>
  `${API_BASE}/api/projects/${encodeURIComponent(pid)}/runs/${encodeURIComponent(rid)}/reports/${kind}?format=xlsx`
export const revisionXlsxUrl = (pid: string, from: string, to: string) =>
  `${API_BASE}/api/projects/${encodeURIComponent(pid)}/revisions/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=xlsx`
