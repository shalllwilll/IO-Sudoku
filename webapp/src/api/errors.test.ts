import { describe, expect, it } from 'vitest'
import { ApiError, describeError, fromResponse, isNetworkError } from './errors'

describe('fromResponse', () => {
  it('reads the backend error shape', () => {
    const e = fromResponse(404, { code: 'not_found', message: 'No such project', details: { id: 'x' } })
    expect(e).toMatchObject({ status: 404, code: 'not_found', message: 'No such project', details: { id: 'x' } })
  })
  it('tolerates bodies that are not the expected shape', () => {
    expect(fromResponse(500, undefined).code).toBe('http_error')
    expect(fromResponse(422, { detail: [] }).code).toBe('http_error')
  })
})

describe('describeError', () => {
  it('prefers friendly text for known codes', () => {
    expect(describeError(new ApiError(415, 'not_xlsx', 'raw'))).toMatch(/\.xlsx/)
  })
  it('falls back to the server message for unknown codes', () => {
    expect(describeError(new ApiError(400, 'weird', 'Server said so'))).toBe('Server said so')
  })
  it('handles plain errors and unknown values', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError(42)).toBe('Something went wrong.')
  })
  it('recognises network failures', () => {
    expect(isNetworkError(new ApiError(0, 'network', 'x'))).toBe(true)
    expect(isNetworkError(new ApiError(500, 'x', 'x'))).toBe(false)
  })
})
