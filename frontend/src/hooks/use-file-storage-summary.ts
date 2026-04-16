import { useCallback, useEffect, useState } from 'react'
import { FILES_UPDATED_EVENT } from '../lib/file-sync-events'
import { fetchFileStorageSummary } from '../services/file-service'
import type { FileStorageSummary } from '../types/file'
import { useAuthStore } from '../store/auth-store'

// loads GET /files/storage-summary when signed in; refetches on stack:files-updated
export function useFileStorageSummary() {
  const session = useAuthStore((s) => s.session)
  const [data, setData] = useState<FileStorageSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      setData(await fetchFileStorageSummary())
    } catch {
      setData((prev) => prev)
    } finally {
      setLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onFilesUpdated() {
      void load()
    }
    window.addEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
    return () => window.removeEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
  }, [load])

  return { data, loading, refetch: load }
}
