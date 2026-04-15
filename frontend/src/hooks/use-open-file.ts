import { fetchFileSignedUrl } from '../services/file-service'
import { usePdfViewerStore } from '../store/pdf-viewer-store'
import type { FileItem } from '../types/file'

// opens pdf in app viewer or other types in a new tab via signed url (uses store getState for non-hook callers)
export async function openKnownFile(fileId: string, originalName: string): Promise<void> {
  const lower = originalName.toLowerCase()
  const isPdf = lower.endsWith('.pdf')
  if (isPdf) {
    usePdfViewerStore.getState().open(fileId, originalName)
    return
  }
  const url = await fetchFileSignedUrl(fileId)
  window.open(url, '_blank', 'noopener')
}

// opens pdf in app viewer or other types in a new tab via signed url
export function useOpenFile() {
  const openPdf = usePdfViewerStore((s) => s.open)
  return async (file: FileItem) => {
    const isPdf = file.type.toLowerCase().includes('pdf')
    if (isPdf) {
      openPdf(file.id, file.name)
    } else {
      const url = await fetchFileSignedUrl(file.id)
      window.open(url, '_blank', 'noopener')
    }
  }
}
