import { create } from 'zustand'

export type Tab = 'photo' | 'look' | 'character'

interface CustomizeUi {
  open: boolean
  tab: Tab
  setOpen: (open: boolean) => void
  setTab: (tab: Tab) => void
}
export const useCustomize = create<CustomizeUi>((set) => ({
  open: false,
  tab: 'look',
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
}))
