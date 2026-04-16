export type FileItem = {
  id: string
  name: string
  type: string
  size: number
  workspaceId: string | null
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
