import { apiFetchOkAuthed } from '../lib/api-authed'
import type { FileItem } from '../types/file'

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
