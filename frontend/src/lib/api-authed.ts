import { apiFetch, type ApiFetchOptions } from './api'
import { getSupabase } from './supabase'

// exchanges refresh_token via api then persists session in supabase client; input: refresh_token string; output: true when session updated
async function refreshSessionViaApi(refreshToken: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const res = await apiFetch('/auth/refresh', {
    method: 'POST',
    json: { refresh_token: refreshToken },
  })
  if (!res.ok) return false
  const body = (await res.json()) as {
    access_token?: string
    refresh_token?: string
  }
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string'
  ) {
    return false
  }
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  })
  return !error
}

/** fetch with bearer from supabase session; on 401 retries once after POST /auth/refresh */
export async function apiFetchAuthed(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const supabase = getSupabase()
  const headers = new Headers(options.headers)

  if (!supabase) {
    return apiFetch(path, { ...options, headers })
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  let res = await apiFetch(path, { ...options, headers })

  if (res.status === 401 && session?.refresh_token) {
    const refreshed = await refreshSessionViaApi(session.refresh_token)
    if (refreshed) {
      const {
        data: { session: next },
      } = await supabase.auth.getSession()
      if (next?.access_token) {
        headers.set('Authorization', `Bearer ${next.access_token}`)
        res = await apiFetch(path, { ...options, headers })
      }
    }
  }

  return res
}

export async function apiFetchOkAuthed(
  path: string,
  options?: ApiFetchOptions,
): Promise<Response> {
  const res = await apiFetchAuthed(path, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `API ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
  return res
}
