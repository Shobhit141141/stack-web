import { useCallback, useState } from 'react'

export type BrowserViewMode = 'grid' | 'list'

export function readBrowserViewMode(storageKey: string): BrowserViewMode {
  try {
    const v = localStorage.getItem(storageKey)
    return v === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function useBrowserViewMode(storageKey: string): {
  view: BrowserViewMode
  setView: (mode: BrowserViewMode) => void
} {
  const [view, setViewState] = useState<BrowserViewMode>(() =>
    readBrowserViewMode(storageKey),
  )

  const setView = useCallback(
    (mode: BrowserViewMode) => {
      setViewState(mode)
      try {
        localStorage.setItem(storageKey, mode)
      } catch {
        // ignore
      }
    },
    [storageKey],
  )

  return { view, setView }
}
