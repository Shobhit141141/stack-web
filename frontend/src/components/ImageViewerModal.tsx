import { useEffect, useState } from 'react'
import { Text } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import { HiOutlineXMark } from 'react-icons/hi2'
import { fetchFileSignedUrl } from '../services/file-service'
import { useImageViewerStore } from '../store/image-viewer-store'

export function ImageViewerModal() {
  const { fileId, fileName, close } = useImageViewerStore()
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load image'))
  }, [fileId])

  useEffect(() => {
    if (!fileId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fileId, close])

  return (
    <AnimatePresence>
      {fileId ? (
        <motion.div
          key="image-modal"
          data-no-link-import
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
              <Text size="3" weight="medium" className="truncate text-neutral-900">
                {fileName ?? 'Image Viewer'}
              </Text>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50"
                aria-label="Close image viewer"
              >
                <HiOutlineXMark className="size-4" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 bg-neutral-100">
              {!url && !error ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-800" />
                </div>
              ) : null}
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                  <Text size="2" className="text-red-600">
                    {error}
                  </Text>
                </div>
              ) : null}
              {url ? (
                <img
                  src={url}
                  alt={fileName ?? 'Image'}
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
