import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { MeProfile } from '../types/auth'

type AuthState = {
  ready: boolean
  configError: string | null
  session: Session | null
  profile: MeProfile | null
  error: string | null
  setReady: (ready: boolean) => void
  setConfigError: (configError: string | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: MeProfile | null) => void
  setError: (error: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  configError: null,
  session: null,
  profile: null,
  error: null,
  setReady: (ready) => set({ ready }),
  setConfigError: (configError) => set({ configError }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setError: (error) => set({ error }),
}))
