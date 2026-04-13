import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, type ReactNode } from 'react'
import { apiFetchOkAuthed } from '../lib/api-authed'
import { getSupabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth-store'
import type { MeProfile } from '../types/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const setReady = useAuthStore((s) => s.setReady)
  const setConfigError = useAuthStore((s) => s.setConfigError)
  const setSession = useAuthStore((s) => s.setSession)
  const setProfile = useAuthStore((s) => s.setProfile)
  const setError = useAuthStore((s) => s.setError)

  const fetchProfile = useCallback(async () => {
    const res = await apiFetchOkAuthed('/auth/me')
    const data = (await res.json()) as MeProfile
    setProfile(data)
  }, [setProfile])

  useEffect(() => {
    if (!supabase) {
      setConfigError(
        'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env (same Supabase project as the backend).',
      )
      setReady(true)
      return
    }
    setConfigError(null)

    const sb = supabase
    let cancelled = false

    // do not await profile before setReady; slow /auth/me was blocking the whole app after refresh
    function applySession(s: Session | null) {
      setSession(s)
      setError(null)
      if (s?.access_token) {
        void fetchProfile().catch((e) => {
          setProfile(null)
          setError(
            e instanceof Error ? e.message : 'Could not load profile',
          )
        })
      } else {
        setProfile(null)
      }
    }

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
      applySession(s)
      setReady(true)
    }

    void init()

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => {
      applySession(s)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile, setReady, setConfigError, setSession, setProfile, setError])

  return children
}
