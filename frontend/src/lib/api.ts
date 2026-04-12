/**
 * Typed fetch wrapper: prefixes `VITE_API_URL`, merges JSON headers when needed.
 */
function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/$/,
    '',
  )
  if (!base) return path.startsWith('/') ? path : `/${path}`
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export type ApiFetchOptions = RequestInit & {
  /** When set, body is JSON.stringify'd and Content-Type is application/json */
  json?: unknown
}

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { json, headers: initHeaders, body, ...rest } = options
  const headers = new Headers(initHeaders)

  let finalBody: BodyInit | undefined =
    body === null || body === undefined ? undefined : body
  if (json !== undefined) {
    finalBody = JSON.stringify(json)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
  }

  const res = await fetch(resolveUrl(path), {
    ...rest,
    headers,
    body: finalBody,
  })
  return res
}

/** Throws if !response.ok with status text for quick use in UI. */
export async function apiFetchOk(
  path: string,
  options?: ApiFetchOptions,
): Promise<Response> {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `API ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
  return res
}
