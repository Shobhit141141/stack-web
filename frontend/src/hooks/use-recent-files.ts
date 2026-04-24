import { useCallback, useEffect, useState } from 'react'
import {
  applyFileListPatches,
  FILES_UPDATED_EVENT,
  type FilesUpdatedDetail,
} from '../lib/file-sync-events'
import type { FileItem } from '../types/file'
import { fetchRecentFiles } from '../services/file-service'

export function useRecentFiles() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchRecentFiles()
      setFiles(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [])

  const refetchQuiet = useCallback(async () => {
    try {
      const data = await fetchRecentFiles()
      setFiles(data)
    } catch {
      // keep prior list on background refresh failure
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onFilesUpdated(ev: Event) {
      const detail = (ev as CustomEvent<FilesUpdatedDetail>).detail
      if (detail?.optimistic?.patchFiles?.length) {
        setFiles((prev) => applyFileListPatches(prev, detail.optimistic!.patchFiles))
      }
      void refetchQuiet()
    }
    window.addEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
    return () => window.removeEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
  }, [refetchQuiet])

  return { files, loading, error, refetch: load }
}
