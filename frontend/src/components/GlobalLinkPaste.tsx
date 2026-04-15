import { useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { importFileFromUrl } from '../services/url-ingest-service'
import { useLinkImportWorkspaceStore } from '../store/link-import-workspace-store'

/** returns normalized http(s) URL or null */
function normalizePastedUrl(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, '')
  if (t.length < 12 || t.length > 2048) return null
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

// skips only zones that need native paste (modals, sidebar, embeds)
function shouldSkipGlobalLinkPaste(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false
  if (target.closest('[data-no-link-import]')) return true
  const el = target as HTMLElement
  if (el.isContentEditable) return true
  return false
}

export function GlobalLinkPaste() {
  const importingRef = useRef(false)

  const onPaste = useCallback((e: ClipboardEvent) => {
    if (importingRef.current) return
    if (shouldSkipGlobalLinkPaste(e.target)) return

    const text = e.clipboardData?.getData('text/plain')
    if (!text) return

    const url = normalizePastedUrl(text)
    if (!url) return

    e.preventDefault()
    e.stopPropagation()

    const workspaceId = useLinkImportWorkspaceStore.getState().linkImportWorkspaceId

    importingRef.current = true
    const promise = importFileFromUrl(url, undefined, workspaceId ?? undefined)
    toast.promise(promise, {
      loading: 'Importing from link…',
      success: (r) => `Saved “${r.fileName}”`,
      error: (err) =>
        err instanceof Error ? err.message : 'Could not import from this link',
    })
    void promise.finally(() => {
      importingRef.current = false
    })
  }, [])

  useEffect(() => {
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [onPaste])

  return null
}
