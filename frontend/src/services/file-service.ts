import { apiFetchOkAuthed } from '../lib/api-authed'
import type { FileItem } from '../types/file'

export async function fetchRecentFiles(): Promise<FileItem[]> {
  const res = await apiFetchOkAuthed('/files/recents')
  const body = (await res.json()) as { files: FileItem[] }
  return body.files
}

export async function fetchFileSignedUrl(fileId: string): Promise<string> {
  const res = await apiFetchOkAuthed(`/files/${fileId}`)
  const body = (await res.json()) as { signedUrl: string }
  return body.signedUrl
}
