import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth-store'
import { signInWithGoogle, signOut } from './auth-actions'

const MISSING_SUPABASE_MSG =
  'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env (same Supabase project as the backend).'

export function useAuth() {
  const supabase = getSupabase()
  const slice = useAuthStore(
    useShallow((s) => ({
      ready: s.ready,
      configError: s.configError,
      session: s.session,
      profile: s.profile,
      error: s.error,
    })),
  )

  return {
    ready: supabase ? slice.ready : true,
    configError: supabase === null ? MISSING_SUPABASE_MSG : slice.configError,
    session: slice.session,
    profile: slice.profile,
    error: slice.error,
    signInWithGoogle,
    signOut,
  }
}
