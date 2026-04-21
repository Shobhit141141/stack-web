import { Text, Tooltip } from '@radix-ui/themes'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { DragEvent } from 'react'
import type { FileItem } from '../../types/file'
import type { BrowserViewMode } from '../../hooks/use-browser-view-mode'
import type { WorkspaceItem } from '../../services/workspace-service'
import { useImageThumbnailUrls } from '../../hooks/use-image-thumbnail-urls'
import { useMediaQuery } from '../../hooks/use-media-query'
import {
  FILE_LIST_GRID_TEMPLATE,
  FILE_LIST_GRID_WITH_WORKSPACE,
  fileIcon,
  formatFileSize,
  formatRelativeTime,
  formatShortDate,
  isImageFileType,
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
  /** when set with onMoveFileToWorkspace, context menu includes move flyout */
  workspaces?: WorkspaceItem[]
  onMoveFileToWorkspace?: (
    file: FileItem,
    workspaceId: string | null,
  ) => void | Promise<void>
  /** ⌘/Ctrl+click to multi-select; toolbar offers bulk delete */
  enableMultiSelect?: boolean
  /** show workspace label column (e.g. All files on Files page) */
  showWorkspaceTags?: boolean
  workspaceNameById?: Map<string, string>
  workspaceHref?: (workspaceId: string) => string
  onBulkDeleteRequest?: (files: FileItem[]) => void
  /** grid card min width in px (smaller value allows 2 cols on narrow layouts) */
  gridMinCardPx?: number
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
  workspaces,
  onMoveFileToWorkspace,
}: {
  state: FileActionsMenuState | null
  onClose: () => void
  onOpen: (file: FileItem) => void
  onRename?: (file: FileItem) => void | Promise<void>
  onDelete?: (file: FileItem) => void | Promise<void>
  workspaces?: WorkspaceItem[]
  onMoveFileToWorkspace?: (
    file: FileItem,
    workspaceId: string | null,
  ) => void | Promise<void>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [moveOpen, setMoveOpen] = useState(false)

  useEffect(() => {
    setMoveOpen(false)
  }, [state?.file.id])

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

  const showMove = Boolean(workspaces && onMoveFileToWorkspace)
  const flyoutLeft =
    state.snapRightTo !== undefined
  const file = state.file

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
          onOpen(file)
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
          void onRename?.(file)
        }}
      >
        Rename
      </button>
      {showMove ? (
        <div className="relative border-t border-neutral-100 pt-1">
          <button
            type="button"
            role="menuitem"
            aria-expanded={moveOpen}
            aria-haspopup="menu"
            className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
            onClick={() => setMoveOpen((v) => !v)}
          >
            Move to workspace
            <span className="text-neutral-400" aria-hidden>
              {flyoutLeft ? '‹' : '›'}
            </span>
          </button>
          {moveOpen ? (
            <div
              role="menu"
              className={`absolute top-0 z-210 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg ${
                flyoutLeft ? 'right-full mr-1' : 'left-full ml-1'
              }`}
            >
              <button
                type="button"
                role="menuitem"
                disabled={file.workspaceId === null}
                className="block w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => {
                  if (file.workspaceId === null) return
                  onClose()
                  setMoveOpen(false)
                  void onMoveFileToWorkspace?.(file, null)
                }}
              >
                Unassigned
                {file.workspaceId === null ? ' (current)' : ''}
              </button>
              {workspaces!.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="menuitem"
                  disabled={w.id === file.workspaceId}
                  className="block w-full max-w-56 truncate rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45"
                  title={w.name}
                  onClick={() => {
                    if (w.id === file.workspaceId) return
                    onClose()
                    setMoveOpen(false)
                    void onMoveFileToWorkspace?.(file, w.id)
                  }}
                >
                  {w.name}
                  {w.id === file.workspaceId ? ' (current)' : ''}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={!onDelete}
        className="block w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          onClose()
          void onDelete?.(file)
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

function summaryHoverText(file: FileItem): string {
  if (file.summaryStatus === 'pending') return 'Generating summary...'
  if (file.summaryStatus === 'ready' && file.summary?.trim()) {
    return file.summary.trim()
  }
  if (!file.summaryStatus && file.summary?.trim()) return file.summary.trim()
  return 'Summary unavailable'
}

function FileCardGrid({
  file,
  dateStyle,
  onMenu,
  selected,
  onMouseActivate,
  onKeyActivate,
  showWorkspaceTags,
  workspaceLabel,
  workspaceLinkTo,
  previewUrl,
}: {
  file: FileItem
  dateStyle: DateStyle
  onMenu: (f: FileItem, x: number, y: number, snapRightTo?: number) => void
  selected: boolean
  onMouseActivate: (f: FileItem, e: React.MouseEvent) => void
  onKeyActivate: (f: FileItem) => void
  showWorkspaceTags: boolean
  workspaceLabel: string | null
  workspaceLinkTo: string | null
  previewUrl?: string
}) {
  const selText = selected ? 'text-red-600' : 'text-neutral-900'
  const selMuted = selected ? 'text-red-600' : 'text-neutral-500'
  const chipLink = selected
    ? 'bg-red-50 font-medium text-red-700 ring-1 ring-red-200/80 hover:bg-red-100'
    : 'bg-neutral-100 font-medium text-neutral-700 hover:bg-neutral-200'
  const chipMuted = selected
    ? 'bg-red-50 text-red-600 ring-1 ring-red-200/80'
    : 'bg-neutral-50 text-neutral-400'
  const menuBtn = selected
    ? 'text-red-500 hover:bg-red-50 hover:text-red-700'
    : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'

  return (
    <Tooltip content={summaryHoverText(file)} delayDuration={300}>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => onMouseActivate(file, e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onKeyActivate(file)
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
          className={`absolute top-2 right-2 rounded-md p-1 ${menuBtn}`}
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
          src={isImageFileType(file.type) ? (previewUrl ?? fileIcon(file.type)) : fileIcon(file.type)}
          alt=""
          className="aspect-square w-full rounded-md object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.src = fileIcon(file.type)
          }}
        />
        <div className="flex w-full flex-col gap-0.5 overflow-hidden">
          <Text
            size="2"
            className={`w-full truncate text-left transition-all duration-200 group-hover:font-semibold ${selText}`}
          >
            {file.name}
          </Text>
          <div
            className={`flex items-center gap-1 text-xs transition-all duration-200 group-hover:font-semibold ${selMuted}`}
          >
            <span>{formatFileSize(file.size)}</span>
            <span>&middot;</span>
            <span>{formatDate(file.createdAt, dateStyle)}</span>
          </div>
          {showWorkspaceTags ? (
            <div className="min-w-0 text-xs">
              {workspaceLinkTo ? (
                <Link
                  to={workspaceLinkTo}
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 ${chipLink}`}
                  title={workspaceLabel ?? undefined}
                >
                  {workspaceLabel}
                </Link>
              ) : (
                <span
                  className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 ${chipMuted}`}
                  title="Not in a workspace"
                >
                  {workspaceLabel ?? 'No workspace'}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Tooltip>
  )
}

function FileRowList({
  file,
  dateStyle,
  onMenu,
  listGridTemplate,
  selected,
  onMouseActivate,
  onKeyActivate,
  showWorkspaceTags,
  showSizeColumn,
  inlineWorkspaceChip,
  workspaceLabel,
  workspaceLinkTo,
  previewUrl,
}: {
  file: FileItem
  dateStyle: DateStyle
  onMenu: (f: FileItem, x: number, y: number, snapRightTo?: number) => void
  listGridTemplate: string
  selected: boolean
  onMouseActivate: (f: FileItem, e: React.MouseEvent) => void
  onKeyActivate: (f: FileItem) => void
  showWorkspaceTags: boolean
  showSizeColumn: boolean
  inlineWorkspaceChip: boolean
  workspaceLabel: string | null
  workspaceLinkTo: string | null
  previewUrl?: string
}) {
  const selText = selected ? 'text-red-600' : 'text-neutral-900'
  const selMuted = selected ? 'text-red-600' : 'text-neutral-500'
  const chipLink = selected
    ? 'bg-red-50 text-xs font-medium text-red-700 ring-1 ring-red-200/80 hover:bg-red-100'
    : 'bg-neutral-100 text-xs font-medium text-neutral-700 hover:bg-neutral-200'
  const chipMuted = selected
    ? 'bg-red-50 text-xs text-red-600 ring-1 ring-red-200/80'
    : 'bg-neutral-50 text-xs text-neutral-400'
  const menuBtn = selected
    ? 'text-red-500 hover:bg-red-50 hover:text-red-700'
    : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'

  return (
    <Tooltip content={summaryHoverText(file)} delayDuration={300}>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => onMouseActivate(file, e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onKeyActivate(file)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu(file, e.clientX, e.clientY)
        }}
        draggable
        onDragStart={(ev) => onDragStartFile(ev, file)}
        className="group grid w-full cursor-pointer items-center rounded-lg bg-white px-0 py-3 text-left transition-colors"
        style={{ gridTemplateColumns: `${listGridTemplate} 28px`, gap: '1rem' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={isImageFileType(file.type) ? (previewUrl ?? fileIcon(file.type)) : fileIcon(file.type)}
            alt=""
            className="h-8 w-8 shrink-0 rounded object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = fileIcon(file.type)
            }}
          />
          <div className="min-w-0">
            <Text
              size="2"
              className={`min-w-0 truncate transition-all duration-200 group-hover:font-semibold ${selText}`}
            >
              {file.name}
            </Text>
            {inlineWorkspaceChip ? (
              <div className="mt-0.5 min-w-0">
                {workspaceLinkTo ? (
                  <Link
                    to={workspaceLinkTo}
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 ${chipLink}`}
                    title={workspaceLabel ?? undefined}
                  >
                    {workspaceLabel}
                  </Link>
                ) : (
                  <span
                    className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 ${chipMuted}`}
                    title="Not in a workspace"
                  >
                    {workspaceLabel ?? 'No workspace'}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {showWorkspaceTags ? (
          <div className="min-w-0 justify-self-start">
            {workspaceLinkTo ? (
              <Link
                to={workspaceLinkTo}
                onClick={(e) => e.stopPropagation()}
                className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 ${chipLink}`}
                title={workspaceLabel ?? undefined}
              >
                {workspaceLabel}
              </Link>
            ) : (
              <span
                className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 ${chipMuted}`}
                title="Not in a workspace"
              >
                {workspaceLabel ?? 'No workspace'}
              </span>
            )}
          </div>
        ) : null}
        {showSizeColumn ? (
          <Text
            size="1"
            className={`transition-all duration-200 group-hover:font-bold ${selMuted}`}
          >
            {formatFileSize(file.size)}
          </Text>
        ) : null}
        <Text
          size="1"
          className={`justify-self-end text-right transition-all duration-200 group-hover:font-bold ${selMuted}`}
        >
          {formatDate(file.createdAt, dateStyle)}
        </Text>
        <button
          type="button"
          className={`justify-self-end rounded-md p-1 ${menuBtn}`}
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
    </Tooltip>
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
  workspaces,
  onMoveFileToWorkspace,
  enableMultiSelect = false,
  showWorkspaceTags = false,
  workspaceNameById,
  workspaceHref,
  onBulkDeleteRequest,
  gridMinCardPx = 160,
}: Props) {
  const [menuState, setMenuState] = useState<FileActionsMenuState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const isMobile = useMediaQuery('(max-width: 639px)')
  const thumbnailUrls = useImageThumbnailUrls(
    files.map((f) => ({
      fileId: f.id,
      type: f.type,
      thumbnailUrl: f.thumbnailUrl ?? null,
    })),
  )

  const showWorkspaceColumn = showWorkspaceTags && !isMobile
  const showSizeColumn = !isMobile
  const listGridTemplate = showWorkspaceColumn
    ? FILE_LIST_GRID_WITH_WORKSPACE
    : showSizeColumn
      ? FILE_LIST_GRID_TEMPLATE
      : 'minmax(0,1fr) 5.25rem'
  const mobileGridClass = 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(var(--grid-min-card),1fr))]'
  const gridCssVars = {
    '--grid-min-card': `${gridMinCardPx}px`,
  } as React.CSSProperties

  function openMenu(file: FileItem, x: number, y: number, snapRightTo?: number) {
    setMenuState({ file, x, y, snapRightTo })
  }

  function workspaceMeta(file: FileItem): {
    label: string | null
    linkTo: string | null
  } {
    if (!file.workspaceId) {
      return { label: 'No workspace', linkTo: null }
    }
    const name = workspaceNameById?.get(file.workspaceId) ?? 'Workspace'
    const linkTo = workspaceHref ? workspaceHref(file.workspaceId) : null
    return { label: name, linkTo }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleMouseActivate = useCallback(
    (file: FileItem, e: React.MouseEvent) => {
      if (enableMultiSelect && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleSelect(file.id)
        return
      }
      if (enableMultiSelect && selectedIds.size > 0) {
        setSelectedIds(new Set())
      }
      onOpenFile(file)
    },
    [enableMultiSelect, onOpenFile, selectedIds.size, toggleSelect],
  )

  const handleKeyActivate = useCallback(
    (file: FileItem) => {
      if (enableMultiSelect && selectedIds.size > 0) {
        setSelectedIds(new Set())
      }
      onOpenFile(file)
    },
    [enableMultiSelect, onOpenFile, selectedIds.size],
  )

  useEffect(() => {
    const valid = new Set(files.map((f) => f.id))
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((id) => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [files])

  useEffect(() => {
    if (!enableMultiSelect || selectedIds.size === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedIds(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enableMultiSelect, selectedIds.size])

  const selectionToolbar =
    enableMultiSelect && selectedIds.size > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-sm font-medium text-neutral-800">
          {selectedIds.size} selected
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-200/80"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
          {onBulkDeleteRequest ? (
            <button
              type="button"
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              onClick={() => {
                const selected = files.filter((f) => selectedIds.has(f.id))
                if (selected.length) onBulkDeleteRequest(selected)
              }}
            >
              Delete…
            </button>
          ) : null}
        </div>
      </div>
    ) : null

  if (loading) {
    return view === 'grid' ? (
      <div className={`grid gap-3 ${mobileGridClass}`} style={gridCssVars}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-3 rounded-xl bg-white p-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex w-full flex-col items-center gap-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              {showWorkspaceTags ? <Skeleton className="h-3 w-20" /> : null}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <div
          className="grid items-center px-0 pb-1"
          style={{ gridTemplateColumns: `${listGridTemplate} 28px`, gap: '1rem' }}
        >
          <Skeleton className="h-3 w-10" />
          {showWorkspaceColumn ? <Skeleton className="h-3 w-16" /> : null}
          {showSizeColumn ? <Skeleton className="h-3 w-10" /> : null}
          <Skeleton className="h-3 w-14 justify-self-end" />
          <Skeleton className="h-3 w-5 justify-self-end" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="grid items-center rounded-lg bg-white px-0 py-3"
            style={{ gridTemplateColumns: `${listGridTemplate} 28px`, gap: '1rem' }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            {showWorkspaceColumn ? <Skeleton className="h-3 w-20" /> : null}
            {showSizeColumn ? <Skeleton className="h-3 w-14" /> : null}
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
      <div className="flex flex-col gap-3">
        {selectionToolbar}
        <div className={`grid gap-3 ${mobileGridClass}`} style={gridCssVars}>
          {files.map((f) => {
            const { label, linkTo } = workspaceMeta(f)
            return (
              <FileCardGrid
                key={f.id}
                file={f}
                dateStyle={dateStyle}
                onMenu={openMenu}
                selected={selectedIds.has(f.id)}
                onMouseActivate={handleMouseActivate}
                onKeyActivate={handleKeyActivate}
                showWorkspaceTags={showWorkspaceTags}
                workspaceLabel={label}
                workspaceLinkTo={linkTo}
                previewUrl={thumbnailUrls.get(f.id)}
              />
            )
          })}
          <FileActionsMenu
            state={menuState}
            onClose={() => setMenuState(null)}
            onOpen={onOpenFile}
            onRename={onRenameFile}
            onDelete={onDeleteFile}
            workspaces={workspaces}
            onMoveFileToWorkspace={onMoveFileToWorkspace}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {selectionToolbar}
      {isMobile ? null : (
        <div
          className="grid items-center px-0 pb-1"
          style={{ gridTemplateColumns: `${listGridTemplate} 28px`, gap: '1rem' }}
        >
          <span className="text-left text-xs font-medium text-neutral-400">Name</span>
          {showWorkspaceColumn ? (
            <span className="text-left text-xs font-medium text-neutral-400">Workspace</span>
          ) : null}
          {showSizeColumn ? <span className="text-left text-xs font-medium text-neutral-400">Size</span> : null}
          <span className="justify-self-end text-right text-xs font-medium text-neutral-400">
            {dateStyle === 'short' ? 'Added' : 'Uploaded'}
          </span>
          <span />
        </div>
      )}
      {files.map((f) => {
        const { label, linkTo } = workspaceMeta(f)
        return (
          <FileRowList
            key={f.id}
            file={f}
            dateStyle={dateStyle}
            onMenu={openMenu}
            listGridTemplate={listGridTemplate}
            selected={selectedIds.has(f.id)}
            onMouseActivate={handleMouseActivate}
            onKeyActivate={handleKeyActivate}
            showWorkspaceTags={showWorkspaceColumn}
            showSizeColumn={showSizeColumn}
            inlineWorkspaceChip={isMobile && showWorkspaceTags}
            workspaceLabel={label}
            workspaceLinkTo={linkTo}
            previewUrl={thumbnailUrls.get(f.id)}
          />
        )
      })}
      <FileActionsMenu
        state={menuState}
        onClose={() => setMenuState(null)}
        onOpen={onOpenFile}
        onRename={onRenameFile}
        onDelete={onDeleteFile}
        workspaces={workspaces}
        onMoveFileToWorkspace={onMoveFileToWorkspace}
      />
    </div>
  )
}
