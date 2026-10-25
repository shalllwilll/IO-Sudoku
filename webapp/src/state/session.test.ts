import { beforeEach, describe, expect, it } from 'vitest'
import { initials, isSignedIn, useSession } from './session'

beforeEach(() => useSession.setState({ name: null, role: 'engineer' }))

describe('session', () => {
  it('signs in and out', () => {
    expect(isSignedIn()).toBe(false)
    useSession.getState().signIn('  Priya Nair ', 'reviewer')
    expect(useSession.getState()).toMatchObject({ name: 'Priya Nair', role: 'reviewer' })
    expect(isSignedIn()).toBe(true)
    useSession.getState().signOut()
    expect(isSignedIn()).toBe(false)
  })
  it('derives initials from names and emails', () => {
    expect(initials('Priya Nair')).toBe('PN')
    expect(initials('priya')).toBe('PR')
    expect(initials('priya.nair@example.com')).toBe('PC')
  })
})
