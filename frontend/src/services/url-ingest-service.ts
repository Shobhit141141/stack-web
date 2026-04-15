import { apiFetchAuthed } from '../lib/api-authed'

export type UrlIngestJobStatus = {
  jobId: string
  state: string
  fileId?: string
  fileName?: string
  error?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** queues server-side URL ingest; throws with a readable message on 4xx/5xx/503 */
export async function queueIngestFromUrl(
  url: string,
  workspaceId?: string,
): Promise<{ jobId: string }> {
  const res = await apiFetchAuthed('/files/from-url', {
    method: 'POST',
    json: {
      url,
      ...(workspaceId ? { workspaceId } : {}),
    },
  })
  const text = await res.text()
  if (res.status === 503) {
    throw new Error(
      'Link import is unavailable (server needs Redis for this feature).',
    )
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const j = JSON.parse(text) as { error?: string }
      if (typeof j.error === 'string' && j.error) msg = j.error
    } catch {
      if (text.trim()) msg = text.slice(0, 200)
    }
    throw new Error(msg)
  }
  const body = JSON.parse(text) as { jobId?: string }
  if (typeof body.jobId !== 'string') {
    throw new Error('Invalid response from server')
  }
  return { jobId: body.jobId }
}

export async function fetchUrlIngestStatus(
  jobId: string,
): Promise<UrlIngestJobStatus> {
  const res = await apiFetchAuthed(
    `/files/url-jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
  )
  const text = await res.text()
  if (res.status === 503) {
    throw new Error(
      'Link import is unavailable (server needs Redis for this feature).',
    )
  }
  if (!res.ok) {
    let msg = `Status check failed (${res.status})`
    try {
      const j = JSON.parse(text) as { error?: string }
      if (typeof j.error === 'string' && j.error) msg = j.error
    } catch {
      if (text.trim()) msg = text.slice(0, 200)
    }
    throw new Error(msg)
  }
  return JSON.parse(text) as UrlIngestJobStatus
}

const MAX_POLL_MS = 180_000
const INITIAL_DELAY_MS = 500
const MAX_DELAY_MS = 2_500

/**
 * polls until job completes or fails, or throws on timeout.
 * input: jobId from queueIngestFromUrl; output: completed status with fileId/fileName
 */
export async function pollUrlIngestUntilDone(
  jobId: string,
  onProgress?: (status: UrlIngestJobStatus) => void,
): Promise<UrlIngestJobStatus> {
  const started = Date.now()
  let delay = INITIAL_DELAY_MS

  while (Date.now() - started < MAX_POLL_MS) {
    const status = await fetchUrlIngestStatus(jobId)
    onProgress?.(status)

    if (status.state === 'completed') {
      return status
    }
    if (status.state === 'failed') {
      return status
    }

    await sleep(delay)
    delay = Math.min(Math.round(delay * 1.2), MAX_DELAY_MS)
  }

  throw new Error('Import timed out. Try again or upload the file directly.')
}

/** full flow: queue + poll until done; throws on failure or missing file metadata */
export async function importFileFromUrl(
  url: string,
  onProgress?: (status: UrlIngestJobStatus) => void,
  workspaceId?: string,
): Promise<{ fileId: string; fileName: string }> {
  const { jobId } = await queueIngestFromUrl(url, workspaceId)
  const final = await pollUrlIngestUntilDone(jobId, onProgress)

  if (final.state === 'failed') {
    throw new Error(final.error?.trim() || 'Could not import from this link.')
  }

  if (!final.fileId || !final.fileName) {
    throw new Error('Import finished but file details were missing.')
  }

  return { fileId: final.fileId, fileName: final.fileName }
}
