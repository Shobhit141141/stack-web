/** PDF OCR path on the server (for future API fields or tooling). */
export type OcrPdfEngine = 'none' | 'tesseract' | 'ai'

export type FileItem = {
  id: string
  name: string
  type: string
  size: number
  workspaceId: string | null
  thumbnailUrl?: string | null
  summary?: string | null
  summaryStatus?: 'pending' | 'ready' | 'failed'
  createdAt: string
}

/** GET /files/storage-summary — per-user file count and size totals */
export type FileStorageSummary = {
  fileCount: number
  maxFiles: number
  totalSizeBytes: number
  maxBytesPerFile: number
  maxTotalBytesIfFull: number
}
