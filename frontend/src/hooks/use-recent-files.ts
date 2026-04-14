import { useCallback, useEffect, useState } from 'react'
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

  useEffect(() => {
    load()
  }, [load])

  return { files, loading, error, refetch: load }
}
