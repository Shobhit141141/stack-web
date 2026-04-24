import { getSupabase } from "./supabase"
import { apiBase } from "./config"

async function refreshIfNeeded(): Promise<void> {
  const supabase = getSupabase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.refresh_token) return
  const res = await fetch(`${apiBase()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
  if (!res.ok) return
  const body = (await res.json()) as {
    access_token?: string
    refresh_token?: string
  }
  if (typeof body.access_token === "string" && typeof body.refresh_token === "string") {
    await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
  }
}

export async function apiFetchAuthed(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const { json, headers: h, ...rest } = init
  const headers = new Headers(h)
  const supabase = getSupabase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`)
  }
  let body = rest.body
  if (json !== undefined) {
    body = JSON.stringify(json)
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  }
  const url = path.startsWith("http") ? path : `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`
  let res = await fetch(url, { ...rest, headers, body })
  if (res.status === 401 && session?.refresh_token) {
    await refreshIfNeeded()
    const {
      data: { session: next },
    } = await supabase.auth.getSession()
    if (next?.access_token) {
      headers.set("Authorization", `Bearer ${next.access_token}`)
      res = await fetch(url, { ...rest, headers, body })
    }
  }
  return res
}

export async function apiFetchOkAuthed(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<Response> {
  const res = await apiFetchAuthed(path, init ?? {})
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`${res.status}: ${t.slice(0, 200)}`)
  }
  return res
}
