import { routeMap } from '../lib/routes'
import { useAuthStore } from '../store/auth-store'
import { getSupabase } from '../lib/supabase'

export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  useAuthStore.getState().setError(null)
  const redirectTo = `${window.location.origin}${routeMap.login}`
  const { error: oauthErr } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (oauthErr) useAuthStore.getState().setError(oauthErr.message)
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  useAuthStore.getState().setError(null)
  await supabase.auth.signOut()
  useAuthStore.getState().setProfile(null)
}
