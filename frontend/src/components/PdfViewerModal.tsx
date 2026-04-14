import { useEffect, useState } from 'react'
import { Text } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import { PDFViewer } from '@embedpdf/react-pdf-viewer'
import { HiOutlineXMark } from 'react-icons/hi2'
import { fetchFileSignedUrl } from '../services/file-service'
import { usePdfViewerStore } from '../store/pdf-viewer-store'
import { Skeleton } from './ui/skeleton'

export function PdfViewerModal() {
  const { fileId, fileName, close } = usePdfViewerStore()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fileId) {
      setUrl(null)
      setError(null)
      return
    }
    setUrl(null)
    setError(null)
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
            <div className="min-h-0 flex-1">
              {!url && !error && (
                <div className="flex h-full items-center justify-center">
                  <Skeleton className="h-[80%] w-[60%] rounded-lg" />
                </div>
              )}

              {error && (
                <div className="flex h-full items-center justify-center">
                  <Text size="2" className="text-red-600">{error}</Text>
                </div>
              )}

              {url && (
                <PDFViewer
                  config={{ src: url, theme: { preference: 'light' } }}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
