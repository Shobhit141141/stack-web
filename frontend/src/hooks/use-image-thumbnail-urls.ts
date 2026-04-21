import { useEffect, useMemo, useState } from 'react'
import { fetchFileThumbnailUrl } from '../services/file-service'
import { isImageFileType } from '../utils/file-display'

type ThumbnailInput = {
  fileId: string
  type: string
  thumbnailUrl?: string | null
}

const thumbnailUrlCache = new Map<string, string>()

export function useImageThumbnailUrls(items: ThumbnailInput[]): Map<string, string> {
  const [version, setVersion] = useState(0)

  const imageIds = useMemo(
    () =>
      items
        .filter((item) => isImageFileType(item.type))
        .map((item) => item.fileId),
    [items],
  )

  useEffect(() => {
    for (const item of items) {
      if (!isImageFileType(item.type) || !item.thumbnailUrl) continue
      thumbnailUrlCache.set(item.fileId, item.thumbnailUrl)
    }
    const missing = imageIds.filter((id) => !thumbnailUrlCache.has(id))
    if (missing.length === 0) return
    let cancelled = false
    void Promise.all(
      missing.map(async (id) => {
        try {
          const url = await fetchFileThumbnailUrl(id)
          if (!cancelled) thumbnailUrlCache.set(id, url)
        } catch {
          // keep silent, fallback icon remains visible
        }
      }),
    ).then(() => {
      if (!cancelled) setVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [imageIds])

  return useMemo(() => {
    void version
    return new Map(thumbnailUrlCache)
  }, [version])
}
