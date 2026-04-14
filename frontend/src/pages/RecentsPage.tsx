import { useState } from 'react'
import { Text } from '@radix-ui/themes'
import { HiOutlineSquares2X2, HiOutlineListBullet } from 'react-icons/hi2'
import { useRecentFiles } from '../hooks/use-recent-files'
import { fetchFileSignedUrl } from '../services/file-service'
import { usePdfViewerStore } from '../store/pdf-viewer-store'
import { Skeleton } from '../components/ui/skeleton'
import type { FileItem } from '../types/file'

type ViewMode = 'grid' | 'list'

const VIEW_MODE_KEY = 'stack-recents-view'
const LIST_GRID_TEMPLATE = 'minmax(0,1fr) 5rem 5rem'

function readViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY)
    return v === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

function useOpenFile() {
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

function fileIcon(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('pdf')) return '/icons/pdf.svg'
  if (t.includes('doc') || t.includes('word')) return '/icons/docx-file.svg'
  return '/icons/cloud.svg'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function FileCardGrid({ file, onOpen }: { file: FileItem; onOpen: (f: FileItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="group flex cursor-pointer flex-col gap-2 rounded-xl bg-white p-4 text-left transition-colors"
    >
      <img src={fileIcon(file.type)} alt="" className="w-full aspect-square rounded-md object-cover" />
      <div className="flex w-full flex-col gap-0.5 overflow-hidden">
        <Text size="2" className="w-full truncate text-left text-neutral-900 transition-all duration-200 group-hover:font-semibold">
          {file.name}
        </Text>
        <div className="flex items-center gap-1 text-xs text-neutral-500 transition-all duration-200 group-hover:font-semibold">
          <span>{formatSize(file.size)}</span>
          <span>&middot;</span>
          <span>{formatDate(file.createdAt)}</span>
        </div>
      </div>
    </button>
  )
}

function FileRowList({ file, onOpen }: { file: FileItem; onOpen: (f: FileItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="group grid w-full cursor-pointer items-center rounded-lg bg-white px-0 py-3 text-left transition-colors"
      style={{ gridTemplateColumns: LIST_GRID_TEMPLATE, gap: '1rem' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <img src={fileIcon(file.type)} alt="" className="h-8 w-8 shrink-0" />
        <Text size="2" className="min-w-0 truncate text-neutral-900 transition-all duration-200 group-hover:font-semibold">
          {file.name}
        </Text>
      </div>
      <Text size="1" className="text-neutral-500 transition-all duration-200 group-hover:font-bold">
        {formatSize(file.size)}
      </Text>
      <Text size="1" className="justify-self-end text-right text-neutral-500 transition-all duration-200 group-hover:font-bold">
        {formatDate(file.createdAt)}
      </Text>
    </button>
  )
}

export function RecentsPage() {
  const { files, loading, error } = useRecentFiles()
  const openFile = useOpenFile()
  const [view, setView] = useState<ViewMode>(readViewMode)

  const toggleView = (mode: ViewMode) => {
    setView(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Text size="5" weight="bold" className="text-neutral-900">
          Recents
        </Text>
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => toggleView('grid')}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors ${
              view === 'grid'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
            aria-label="Grid view"
          >
            <HiOutlineSquares2X2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleView('list')}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors ${
              view === 'list'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
            aria-label="List view"
          >
            <HiOutlineListBullet className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-3 rounded-xl bg-white p-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex w-full flex-col items-center gap-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid items-center px-0 pb-1" style={{ gridTemplateColumns: LIST_GRID_TEMPLATE, gap: '1rem' }}>
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-14 justify-self-end" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid items-center rounded-lg bg-white px-0 py-3" style={{ gridTemplateColumns: LIST_GRID_TEMPLATE, gap: '1rem' }}>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-14 justify-self-end" />
              </div>
            ))}
          </div>
        )
      )}

      {error && (
        <Text size="2" className="text-red-600">
          {error}
        </Text>
      )}

      {!loading && !error && files.length === 0 && (
        <Text size="2" className="text-neutral-500">
          No recent files yet.
        </Text>
      )}

      {!loading && !error && files.length > 0 && (
        view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {files.map((f) => (
              <FileCardGrid key={f.id} file={f} onOpen={openFile} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid items-center px-0 pb-1" style={{ gridTemplateColumns: LIST_GRID_TEMPLATE, gap: '1rem' }}>
              <span className="text-left text-xs font-medium text-neutral-400">Name</span>
              <span className="text-left text-xs font-medium text-neutral-400">Size</span>
              <span className="justify-self-end text-right text-xs font-medium text-neutral-400">Uploaded</span>
            </div>
            {files.map((f) => (
              <FileRowList key={f.id} file={f} onOpen={openFile} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
