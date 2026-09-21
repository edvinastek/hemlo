import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from './types'

interface AppState {
  session: Session | null
  profile: Profile | null
  profiles: Profile[]
  online: boolean
  syncing: boolean
  lastSync: string | null
  setSession: (s: Session | null) => void
  setProfile: (p: Profile | null) => void
  setProfiles: (p: Profile[]) => void
  setOnline: (v: boolean) => void
  setSync: (syncing: boolean, lastSync?: string) => void
}

export const useApp = create<AppState>((set) => ({
  session: null,
  profile: null,
  profiles: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSync: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setProfiles: (profiles) => set({ profiles }),
  setOnline: (online) => set({ online }),
  setSync: (syncing, lastSync) => set((s) => ({ syncing, lastSync: lastSync ?? s.lastSync })),
}))
