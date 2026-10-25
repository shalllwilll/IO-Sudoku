import { create } from 'zustand'

interface AssistantState {
  open: boolean
  toggle: () => void
  close: () => void
}

export const useAssistant = create<AssistantState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}))
