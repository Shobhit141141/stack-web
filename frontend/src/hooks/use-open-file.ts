import { fetchFileSignedUrl } from '../services/file-service'
import { useImageViewerStore } from '../store/image-viewer-store'
import { usePdfViewerStore } from '../store/pdf-viewer-store'
import type { FileItem } from '../types/file'
import { isImageFileType } from '../utils/file-display'

// opens pdf in app viewer or other types in a new tab via signed url (uses store getState for non-hook callers)
export async function openKnownFile(fileId: string, originalName: string): Promise<void> {
  const lower = originalName.toLowerCase()
  const isPdf = lower.endsWith('.pdf')
  const isImage =
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  if (isPdf) {
    usePdfViewerStore.getState().open(fileId, originalName)
    return
  }
  if (isImage) {
    useImageViewerStore.getState().open(fileId, originalName)
    return
  }
  const url = await fetchFileSignedUrl(fileId)
  window.open(url, '_blank', 'noopener')
}

// opens pdf in app viewer or other types in a new tab via signed url
export function useOpenFile() {
  const openPdf = usePdfViewerStore((s) => s.open)
  const openImage = useImageViewerStore((s) => s.open)
  return async (file: FileItem) => {
    const isPdf = file.type.toLowerCase().includes('pdf')
    const isImage = isImageFileType(file.type)
    if (isPdf) {
      openPdf(file.id, file.name, {
        summary: file.summary ?? null,
        summaryStatus: file.summaryStatus,
      })
    } else if (isImage) {
      openImage(file.id, file.name)
    } else {
      const url = await fetchFileSignedUrl(file.id)
      window.open(url, '_blank', 'noopener')
    }
  }
}
