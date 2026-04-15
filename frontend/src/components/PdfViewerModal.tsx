import { useEffect, useRef, useState } from 'react'
import { Text } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import { PDFViewer } from '@embedpdf/react-pdf-viewer'
import {
  DocumentManagerPlugin,
  type DocumentManagerCapability,
} from '@embedpdf/plugin-document-manager'
import type { PluginRegistry } from '@embedpdf/core'
import { HiOutlineXMark } from 'react-icons/hi2'
import { fetchFileSignedUrl } from '../services/file-service'
import { usePdfViewerStore } from '../store/pdf-viewer-store'

// full neutral palette — embedpdf defaults use blue accents (ThemeConfig in @embedpdf/snippet)
const pdfViewerTheme = {
  preference: 'light' as const,
  light: {
    background: {
      app: '#fafafa',
      surface: '#ffffff',
      surfaceAlt: '#f5f5f5',
      elevated: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.45)',
      input: '#ffffff',
    },
    foreground: {
      primary: '#171717',
      secondary: '#525252',
      muted: '#737373',
      disabled: '#a3a3a3',
      onAccent: '#fafafa',
    },
    border: {
      default: '#e5e5e5',
      subtle: '#f5f5f5',
      strong: '#d4d4d4',
    },
    accent: {
      primary: '#404040',
      primaryHover: '#525252',
      primaryActive: '#262626',
      primaryLight: '#e5e5e5',
      primaryForeground: '#fafafa',
    },
    interactive: {
      hover: '#f5f5f5',
      active: '#e5e5e5',
      selected: '#e5e5e5',
      focus: '#404040',
      focusRing: 'rgba(64, 64, 64, 0.18)',
    },
    scrollbar: {
      track: '#f5f5f5',
      thumb: '#d4d4d4',
      thumbHover: '#a3a3a3',
    },
    tooltip: {
      background: '#171717',
      foreground: '#fafafa',
    },
    state: {
      info: '#525252',
      infoLight: '#f5f5f5',
      warning: '#525252',
      warningLight: '#f5f5f5',
      success: '#404040',
      successLight: '#e5e5e5',
      error: '#525252',
      errorLight: '#f5f5f5',
    },
  },
  dark: {
    background: {
      app: '#171717',
      surface: '#262626',
      surfaceAlt: '#404040',
      elevated: '#404040',
      overlay: 'rgba(0, 0, 0, 0.6)',
      input: '#262626',
    },
    foreground: {
      primary: '#fafafa',
      secondary: '#d4d4d4',
      muted: '#a3a3a3',
      disabled: '#737373',
      onAccent: '#171717',
    },
    border: {
      default: '#404040',
      subtle: '#262626',
      strong: '#525252',
    },
    accent: {
      primary: '#e5e5e5',
      primaryHover: '#fafafa',
      primaryActive: '#d4d4d4',
      primaryLight: '#404040',
      primaryForeground: '#171717',
    },
    interactive: {
      hover: '#404040',
      active: '#525252',
      selected: '#525252',
      focus: '#e5e5e5',
      focusRing: 'rgba(229, 229, 229, 0.2)',
    },
    scrollbar: {
      track: '#262626',
      thumb: '#525252',
      thumbHover: '#737373',
    },
    tooltip: {
      background: '#fafafa',
      foreground: '#171717',
    },
  },
}

const DOCUMENT_MANAGER_ID = DocumentManagerPlugin.id

// waits until embedpdf document-manager reports an open doc, then hides our overlay
function subscribeDocumentReady(
  registry: PluginRegistry,
  onReady: () => void
): () => void {
  const unsubs: Array<() => void> = []
  let finished = false
  let cancelled = false

  const finish = () => {
    if (cancelled || finished) return
    finished = true
    unsubs.forEach((u) => u())
    unsubs.length = 0
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) onReady()
      })
    })
  }

  void (async () => {
    try {
      await registry.pluginsReady()
      if (cancelled) return
      const plugin = registry.getPlugin(DOCUMENT_MANAGER_ID)
      const cap = plugin?.provides() as DocumentManagerCapability | undefined
      if (!cap) {
        finish()
        return
      }
      if (cap.getActiveDocument()) {
        finish()
        return
      }
      unsubs.push(
        cap.onDocumentOpened(() => {
          finish()
        })
      )
      unsubs.push(
        cap.onDocumentError(() => {
          finish()
        })
      )
    } catch {
      finish()
    }
  })()

  return () => {
    cancelled = true
    finished = true
    unsubs.forEach((u) => u())
    unsubs.length = 0
  }
}

function PdfDocumentLoader({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-800"
        aria-hidden
      />
      <Text size="2" className="text-neutral-500">
        {label}
      </Text>
    </div>
  )
}

export function PdfViewerModal() {
  const { fileId, fileName, close } = usePdfViewerStore()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [documentReady, setDocumentReady] = useState(false)
  const docListenersCleanup = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!fileId) {
      setUrl(null)
      setError(null)
      setDocumentReady(false)
      docListenersCleanup.current?.()
      docListenersCleanup.current = null
      return
    }
    setUrl(null)
    setError(null)
    setDocumentReady(false)
    docListenersCleanup.current?.()
    docListenersCleanup.current = null
    fetchFileSignedUrl(fileId)
      .then(setUrl)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load file'))
  }, [fileId])

  useEffect(() => {
    if (!fileId) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [fileId, close])

  return (
    <AnimatePresence>
      {fileId && (
        <motion.div
          key="pdf-modal"
          data-no-link-import
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={(e) => { if (e.target === e.currentTarget) close() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
              <Text size="3" weight="medium" className="truncate text-neutral-900">
                {fileName ?? 'PDF Viewer'}
              </Text>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50"
                aria-label="Close viewer"
              >
                <HiOutlineXMark className="size-4" />
              </button>
            </div>

            {/* Viewer */}
            <div className="relative min-h-0 flex-1">
              {!url && !error && (
                <PdfDocumentLoader label="" />
              )}

              {error && (
                <div className="absolute inset-0 z-10 flex h-full items-center justify-center bg-white">
                  <Text size="2" className="text-red-600">{error}</Text>
                </div>
              )}

              {url && (
                <>
                 
                  <PDFViewer
                    key={url}
                    config={{ src: url, theme: pdfViewerTheme }}
                    style={{
                      width: '100%',
                      height: '100%',
                      opacity: documentReady ? 1 : 0,
                      pointerEvents: documentReady ? 'auto' : 'none',
                    }}
                    onReady={(registry) => {
                      docListenersCleanup.current?.()
                      docListenersCleanup.current = subscribeDocumentReady(registry, () => {
                        setDocumentReady(true)
                      })
                    }}
                  />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
