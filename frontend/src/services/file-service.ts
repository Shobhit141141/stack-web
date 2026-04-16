import { apiFetchOkAuthed } from '../lib/api-authed'
import type { FileItem, FileStorageSummary } from '../types/file'

export async function fetchFileStorageSummary(): Promise<FileStorageSummary> {
  const res = await apiFetchOkAuthed('/files/storage-summary')
  return (await res.json()) as FileStorageSummary
}

export async function fetchRecentFiles(): Promise<FileItem[]> {
  const res = await apiFetchOkAuthed('/files/recents')
  const body = (await res.json()) as { files: FileItem[] }
  return body.files
}

export async function fetchFileList(params?: {
  page?: number
  limit?: number
  sort?: string
  workspaceId?: string
  unassignedOnly?: boolean
}): Promise<{
  files: FileItem[]
  pagination: { page: number; total: number }
}> {
  const searchParams = new URLSearchParams()
  if (params?.page != null) searchParams.set('page', String(params.page))
  searchParams.set('limit', String(params?.limit ?? 50))
  if (params?.sort) searchParams.set('sort', params.sort)
  if (params?.workspaceId) searchParams.set('workspaceId', params.workspaceId)
  if (params?.unassignedOnly) searchParams.set('unassigned', '1')
  const q = searchParams.toString()
  const res = await apiFetchOkAuthed(`/files${q ? `?${q}` : ''}`)
  return (await res.json()) as {
    files: FileItem[]
    pagination: { page: number; total: number }
  }
}

export async function fetchFileSignedUrl(fileId: string): Promise<string> {
  const res = await apiFetchOkAuthed(`/files/${fileId}`)
  const body = (await res.json()) as { signedUrl: string }
  return body.signedUrl
}

function filenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      // ignore decode failures
    }
  }
  const ascii = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i)
  return ascii?.[1]?.trim()
}

export async function downloadFileBlob(fileId: string): Promise<{ blob: Blob; fileName?: string }> {
  const res = await apiFetchOkAuthed(`/files/${fileId}/download`)
  const blob = await res.blob()
  const fileName = filenameFromContentDisposition(res.headers.get('content-disposition'))
  return { blob, fileName }
}

export async function renameFile(
  fileId: string,
  name: string,
): Promise<FileItem> {
  const res = await apiFetchOkAuthed(`/files/${fileId}`, {
    method: 'PATCH',
    json: { name },
  })
  return (await res.json()) as FileItem
}

export async function deleteFile(fileId: string): Promise<void> {
  await apiFetchOkAuthed(`/files/${fileId}`, {
    method: 'DELETE',
  })
}
