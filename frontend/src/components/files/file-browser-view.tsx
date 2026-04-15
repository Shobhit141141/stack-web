import { Text } from '@radix-ui/themes'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DragEvent } from 'react'
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
  onRenameFile?: (file: FileItem) => void | Promise<void>
  onDeleteFile?: (file: FileItem) => void | Promise<void>
}

const FILE_DRAG_MIME = 'application/x-stack-file'

function onDragStartFile(ev: DragEvent<HTMLElement>, file: FileItem) {
  const payload = JSON.stringify({ id: file.id, name: file.name })
  ev.dataTransfer.setData(FILE_DRAG_MIME, payload)
  ev.dataTransfer.setData('text/plain', `@${file.name}`)
  ev.dataTransfer.effectAllowed = 'copy'
}

type FileActionsMenuState = {
  file: FileItem
  x: number
  y: number
  /** align menu right edge to this viewport x (ellipsis trigger) */
  snapRightTo?: number
}

function FileActionsMenu({
  state,
  onClose,
  onOpen,
  onRename,
  onDelete,
}: {
  state: FileActionsMenuState | null
  onClose: () => void
  onOpen: (file: FileItem) => void
  onRename?: (file: FileItem) => void | Promise<void>
  onDelete?: (file: FileItem) => void | Promise<void>
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!state || !ref.current) return
    const el = ref.current
    const pad = 8
    let left = state.x
    let top = state.y
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    let r = el.getBoundingClientRect()
    if (state.snapRightTo !== undefined) {
      left = state.snapRightTo - r.width
      el.style.left = `${left}px`
      r = el.getBoundingClientRect()
    }
    if (r.right > window.innerWidth - pad) {
      left -= r.right - (window.innerWidth - pad)
    }
    if (left < pad) left = pad
    if (r.bottom > window.innerHeight - pad) {
      top -= r.bottom - (window.innerHeight - pad)
    }
    if (top < pad) top = pad
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [state])

  useEffect(() => {
    if (!state) return
    function onDocClick(e: MouseEvent) {
      const el = ref.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      onClose()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [state, onClose])

  if (!state) return null

  const menu = (
    <div
      ref={ref}
      role="menu"
      className="fixed z-200 min-w-40 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
      style={{ left: state.x, top: state.y }}
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
        onClick={() => {
          onClose()
          onOpen(state.file)
        }}
      >
        Open
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!onRename}
        className="block w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          onClose()
          void onRename?.(state.file)
        }}
      >
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!onDelete}
        className="block w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          onClose()
          void onDelete?.(state.file)
        }}
      >
        Delete
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}

function formatDate(iso: string, style: DateStyle): string {
  return style === 'short' ? formatShortDate(iso) : formatRelativeTime(iso)
}

function FileCardGrid({
  file,
  dateStyle,
  onOpen,
  onMenu,
}: {
  file: FileItem
  dateStyle: DateStyle
  onOpen: (f: FileItem) => void
  onMenu: (f: FileItem, x: number, y: number, snapRightTo?: number) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(file)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(file)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(file, e.clientX, e.clientY)
      }}
      draggable
      onDragStart={(ev) => onDragStartFile(ev, file)}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-xl bg-white p-4 text-left transition-colors"
    >
      <button
        type="button"
        className="absolute top-2 right-2 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        onClick={(e) => {
          e.stopPropagation()
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
          onMenu(file, rect.left, rect.bottom + 4, rect.right)
        }}
        aria-label={`File actions for ${file.name}`}
      >
        ⋯
      </button>
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
    </div>
  )
}

function FileRowList({
  file,
  dateStyle,
  onOpen,
  onMenu,
}: {
  file: FileItem
  dateStyle: DateStyle
  onOpen: (f: FileItem) => void
  onMenu: (f: FileItem, x: number, y: number, snapRightTo?: number) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(file)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(file)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(file, e.clientX, e.clientY)
      }}
      draggable
      onDragStart={(ev) => onDragStartFile(ev, file)}
      className="group grid w-full cursor-pointer items-center rounded-lg bg-white px-0 py-3 text-left transition-colors"
      style={{ gridTemplateColumns: `${FILE_LIST_GRID_TEMPLATE} 28px`, gap: '1rem' }}
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
      <button
        type="button"
        className="justify-self-end rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        onClick={(e) => {
          e.stopPropagation()
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
          onMenu(file, rect.left, rect.bottom + 4, rect.right)
        }}
        aria-label={`File actions for ${file.name}`}
      >
        ⋯
      </button>
    </div>
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
  onRenameFile,
  onDeleteFile,
}: Props) {
  const [menuState, setMenuState] = useState<FileActionsMenuState | null>(null)

  function openMenu(file: FileItem, x: number, y: number, snapRightTo?: number) {
    setMenuState({ file, x, y, snapRightTo })
  }

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
          style={{ gridTemplateColumns: `${FILE_LIST_GRID_TEMPLATE} 28px`, gap: '1rem' }}
        >
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-14 justify-self-end" />
          <Skeleton className="h-3 w-5 justify-self-end" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="grid items-center rounded-lg bg-white px-0 py-3"
            style={{ gridTemplateColumns: `${FILE_LIST_GRID_TEMPLATE} 28px`, gap: '1rem' }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14 justify-self-end" />
            <Skeleton className="h-3 w-5 justify-self-end" />
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
          <FileCardGrid
            key={f.id}
            file={f}
            dateStyle={dateStyle}
            onOpen={onOpenFile}
            onMenu={openMenu}
          />
        ))}
        <FileActionsMenu
          state={menuState}
          onClose={() => setMenuState(null)}
          onOpen={onOpenFile}
          onRename={onRenameFile}
          onDelete={onDeleteFile}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid items-center px-0 pb-1"
        style={{ gridTemplateColumns: `${FILE_LIST_GRID_TEMPLATE} 28px`, gap: '1rem' }}
      >
        <span className="text-left text-xs font-medium text-neutral-400">Name</span>
        <span className="text-left text-xs font-medium text-neutral-400">Size</span>
        <span className="justify-self-end text-right text-xs font-medium text-neutral-400">
          {dateStyle === 'short' ? 'Added' : 'Uploaded'}
        </span>
        <span />
      </div>
      {files.map((f) => (
        <FileRowList
          key={f.id}
          file={f}
          dateStyle={dateStyle}
          onOpen={onOpenFile}
          onMenu={openMenu}
        />
      ))}
      <FileActionsMenu
        state={menuState}
        onClose={() => setMenuState(null)}
        onOpen={onOpenFile}
        onRename={onRenameFile}
        onDelete={onDeleteFile}
      />
    </div>
  )
}
