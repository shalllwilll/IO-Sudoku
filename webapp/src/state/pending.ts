import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PendingState {
  /** project id -> answers that change run inputs since that project's last run was started */
  changed: Record<string, number>
  mark: (pid: string) => void
  clear: (pid: string) => void
}

/** The API has no "answers changed since the last run" flag, so the client counts them. */
export const usePending = create<PendingState>()(
  persist(
    (set) => ({
      changed: {},
      mark: (pid) => set((s) => ({ changed: { ...s.changed, [pid]: (s.changed[pid] ?? 0) + 1 } })),
      clear: (pid) => set((s) => ({ changed: { ...s.changed, [pid]: 0 } })),
    }),
    { name: 'io-sudoku.pending-answers' },
  ),
)
