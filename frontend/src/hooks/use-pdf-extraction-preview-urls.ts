import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPdfExtractionBlobUrl } from '../services/file-service'

function key(fileId: string, slot: number) {
  return `${fileId}:${slot}`
}

function revokeAll(m: Map<string, string>) {
  for (const u of m.values()) URL.revokeObjectURL(u)
}

function sameEntries(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false
  }
  return true
}

/**
 * Loads authenticated PDF embedded-figure previews as blob URLs.
 * Revokes URLs when the ref list changes or the component unmounts.
 */
export function usePdfExtractionPreviewUrls(
  refs: ReadonlyArray<{ fileId: string; slot: number }>,
): Map<string, string> {
  const serialized = useMemo(() => JSON.stringify(refs), [refs])
  const [map, setMap] = useState<Map<string, string>>(() => new Map())
  const currentRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const list = JSON.parse(serialized) as Array<{ fileId: string; slot: number }>
    let cancelled = false

    if (!list.length) {
      if (currentRef.current.size > 0) {
        setMap((old) => {
          revokeAll(old)
          currentRef.current = new Map()
          return new Map()
        })
      }
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      const next = new Map<string, string>()
      for (const r of list) {
        if (cancelled) break
        try {
          const u = await fetchPdfExtractionBlobUrl(r.fileId, r.slot)
          if (cancelled) {
            URL.revokeObjectURL(u)
            break
          }
          next.set(key(r.fileId, r.slot), u)
        } catch {
          // icon fallback
        }
      }
      if (!cancelled) {
        setMap((old) => {
          if (sameEntries(old, next)) {
            return old
          }
          revokeAll(old)
          currentRef.current = next
          return next
        })
      } else {
        revokeAll(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [serialized])

  useEffect(() => {
    return () => {
      revokeAll(currentRef.current)
      currentRef.current = new Map()
    }
  }, [])

  return map
}
