import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { apiFetchOk } from '../lib/api'
import { getSupabase } from '../lib/supabase'

export type MeProfile = {
  id: string
  email: string
  userName: string
  displayName: string | null
  avatarUrl: string | null
}

type AuthContextValue = {
  ready: boolean
  configError: string | null
  session: Session | null
  profile: MeProfile | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<MeProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async (accessToken: string) => {
    const res = await apiFetchOk('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = (await res.json()) as MeProfile
    setProfile(data)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    const sb = supabase

    let cancelled = false

    async function init() {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { error: exchangeErr } =
            await sb.auth.exchangeCodeForSession(code)
          if (exchangeErr) throw exchangeErr
          window.history.replaceState({}, '', window.location.pathname)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed')
      }

      const {
        data: { session: s },
      } = await sb.auth.getSession()
      if (cancelled) return
      setSession(s)
      if (s?.access_token) {
        try {
          await fetchProfile(s.access_token)
        } catch (e) {
          setProfile(null)
          setError(
            e instanceof Error ? e.message : 'Could not load profile',
          )
        }
      } else {
        setProfile(null)
      }
      setReady(true)
    }

    void init()

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      setError(null)
      if (s?.access_token) {
        try {
          await fetchProfile(s.access_token)
        } catch (e) {
          setProfile(null)
          setError(
            e instanceof Error ? e.message : 'Could not load profile',
          )
        }
      } else {
        setProfile(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    setError(null)
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthErr) setError(oauthErr.message)
  }, [supabase])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setError(null)
    await supabase.auth.signOut()
    setProfile(null)
  }, [supabase])

  const configError =
    supabase === null
      ? 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env (same Supabase project as the backend).'
      : null

  const value: AuthContextValue = {
    ready: supabase ? ready : true,
    configError,
    session,
    profile,
    signInWithGoogle,
    signOut,
    error,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
