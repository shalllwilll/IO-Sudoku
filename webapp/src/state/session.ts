import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Role = 'engineer' | 'reviewer'

interface SessionState {
  name: string | null
  role: Role
  signIn: (name: string, role: Role) => void
  signOut: () => void
}

/** Cosmetic demo identity. The backend has no authentication; this is kept on this device only. */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      name: null,
      role: 'engineer',
      signIn: (name, role) => set({ name: name.trim(), role }),
      signOut: () => set({ name: null }),
    }),
    { name: 'io-sudoku.session', partialize: (s) => ({ name: s.name, role: s.role }) },
  ),
)

export const isSignedIn = () => useSession.getState().name !== null

export function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
