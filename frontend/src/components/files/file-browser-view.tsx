import { Text } from '@radix-ui/themes'
import type { FileItem } from '../../types/file'
import type { BrowserViewMode } from '../../hooks/use-browser-view-mode'
import {
  FILE_LIST_GRID_TEMPLATE,
  fileIcon,
  formatFileSize,
  formatRelativeTime,
  formatShortDate,
} from '../../utils/file-display'
import { Skeleton } from '../ui/skeleton'

type DateStyle = 'relative' | 'short'

type Props = {
  files: FileItem[]
  loading: boolean
  error: string | null
  emptyMessage: string
  view: BrowserViewMode
  dateStyle?: DateStyle
  onOpenFile: (file: FileItem) => void
}

function formatDate(iso: string, style: DateStyle): string {
  return style === 'short' ? formatShortDate(iso) : formatRelativeTime(iso)
}

function FileCardGrid({
  file,
  dateStyle,
  onOpen,
}: {
  file: FileItem
  dateStyle: DateStyle
  onOpen: (f: FileItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="group flex cursor-pointer flex-col gap-2 rounded-xl bg-white p-4 text-left transition-colors"
    >
      <img
        src={fileIcon(file.type)}
        alt=""
        className="aspect-square w-full rounded-md object-cover"
      />
      <div className="flex w-full flex-col gap-0.5 overflow-hidden">
        <Text
          size="2"
          className="w-full truncate text-left text-neutral-900 transition-all duration-200 group-hover:font-semibold"
        >
          {file.name}
        </Text>
        <div className="flex items-center gap-1 text-xs text-neutral-500 transition-all duration-200 group-hover:font-semibold">
          <span>{formatFileSize(file.size)}</span>
          <span>&middot;</span>
          <span>{formatDate(file.createdAt, dateStyle)}</span>
        </div>
      </div>
    </button>
  )
}

function FileRowList({
  file,
  dateStyle,
  onOpen,
}: {
  file: FileItem
  dateStyle: DateStyle
  onOpen: (f: FileItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="group grid w-full cursor-pointer items-center rounded-lg bg-white px-0 py-3 text-left transition-colors"
      style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <img src={fileIcon(file.type)} alt="" className="h-8 w-8 shrink-0" />
        <Text
          size="2"
          className="min-w-0 truncate text-neutral-900 transition-all duration-200 group-hover:font-semibold"
        >
          {file.name}
        </Text>
      </div>
      <Text
        size="1"
        className="text-neutral-500 transition-all duration-200 group-hover:font-bold"
      >
        {formatFileSize(file.size)}
      </Text>
      <Text
        size="1"
        className="justify-self-end text-right text-neutral-500 transition-all duration-200 group-hover:font-bold"
      >
        {formatDate(file.createdAt, dateStyle)}
      </Text>
    </button>
  )
}

export function FileBrowserView({
  files,
  loading,
  error,
  emptyMessage,
  view,
  dateStyle = 'relative',
  onOpenFile,
}: Props) {
  if (loading) {
    return view === 'grid' ? (
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
        <div
          className="grid items-center px-0 pb-1"
          style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
        >
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-14 justify-self-end" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="grid items-center rounded-lg bg-white px-0 py-3"
            style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
          >
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
  }

  if (error) {
    return (
      <Text size="2" className="text-red-600">
        {error}
      </Text>
    )
  }

  if (files.length === 0) {
    return (
      <Text size="2" className="text-neutral-500">
        {emptyMessage}
      </Text>
    )
  }

  if (view === 'grid') {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {files.map((f) => (
          <FileCardGrid key={f.id} file={f} dateStyle={dateStyle} onOpen={onOpenFile} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid items-center px-0 pb-1"
        style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
      >
        <span className="text-left text-xs font-medium text-neutral-400">Name</span>
        <span className="text-left text-xs font-medium text-neutral-400">Size</span>
        <span className="justify-self-end text-right text-xs font-medium text-neutral-400">
          {dateStyle === 'short' ? 'Added' : 'Uploaded'}
        </span>
      </div>
      {files.map((f) => (
        <FileRowList key={f.id} file={f} dateStyle={dateStyle} onOpen={onOpenFile} />
      ))}
    </div>
  )
}
