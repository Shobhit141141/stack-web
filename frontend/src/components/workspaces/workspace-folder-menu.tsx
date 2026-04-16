import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  HiArrowTopRightOnSquare,
  HiArrowUturnLeft,
  HiEllipsisVertical,
  HiPencilSquare,
  HiTrash,
} from 'react-icons/hi2'
import type { WorkspaceItem } from '../../services/workspace-service'

export type WorkspaceFolderMenuState = {
  workspace: WorkspaceItem
  x: number
  y: number
  snapRightTo?: number
}

type MenuProps = {
  state: WorkspaceFolderMenuState | null
  onClose: () => void
  /** path for Open (e.g. routeMap.workspace(id)) */
  workspacePath: (id: string) => string
  onRename: (ws: WorkspaceItem) => void
  onDelete: (ws: WorkspaceItem) => void
  /** list rows: show Open. header: show Back to Files instead when set */
  mode: 'folder-list' | 'workspace-toolbar'
  onBackToFiles?: () => void
}

// floating menu: open / back, rename, delete — same behavior as file row ⋯ menu
export function WorkspaceFolderActionsMenu({
  state,
  onClose,
  workspacePath,
  onRename,
  onDelete,
  mode,
  onBackToFiles,
}: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

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

  const ws = state.workspace

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for workspace ${ws.name}`}
      className="fixed z-200 min-w-44 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
      style={{ left: state.x, top: state.y }}
    >
      {mode === 'folder-list' ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
          onClick={() => {
            onClose()
            navigate(workspacePath(ws.id))
          }}
        >
          <HiArrowTopRightOnSquare className="size-4 shrink-0 text-neutral-500" aria-hidden />
          Open
        </button>
      ) : onBackToFiles ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
          onClick={() => {
            onClose()
            onBackToFiles()
          }}
        >
          <HiArrowUturnLeft className="size-4 shrink-0 text-neutral-500" aria-hidden />
          Back to Files
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
        onClick={() => {
          onClose()
          onRename(ws)
        }}
      >
        <HiPencilSquare className="size-4 shrink-0 text-neutral-500" aria-hidden />
        Rename workspace
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
        onClick={() => {
          onClose()
          onDelete(ws)
        }}
      >
        <HiTrash className="size-4 shrink-0" aria-hidden />
        Delete workspace
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}

type TriggerProps = {
  onOpen: (payload: WorkspaceFolderMenuState) => void
  workspace: WorkspaceItem
  title?: string
  /** list row: grid cell. card: absolute corner over folder art */
  variant?: 'row' | 'card'
}

// icon-only ⋯ trigger — row end in list, fixed corner on grid cards
export function WorkspaceFolderMenuTrigger({
  onOpen,
  workspace,
  title,
  variant = 'row',
}: TriggerProps) {
  const position =
    variant === 'card'
      ? 'absolute top-2 right-2 z-10 inline-flex'
      : 'justify-self-end inline-flex'
  return (
    <button
      type="button"
      className={`${position} items-center justify-center rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700`}
      aria-label={title ?? `Workspace actions for ${workspace.name}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
        onOpen({
          workspace,
          x: rect.left,
          y: rect.bottom + 4,
          snapRightTo: rect.right,
        })
      }}
    >
      <HiEllipsisVertical className="size-5" aria-hidden />
    </button>
  )
}

type ToolbarTriggerProps = {
  onOpen: (payload: WorkspaceFolderMenuState) => void
  workspace: WorkspaceItem
  disabled?: boolean
}

// bordered icon button for workspace page header
export function WorkspaceToolbarMenuTrigger({ onOpen, workspace, disabled }: ToolbarTriggerProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-40"
      aria-label={`Workspace actions: ${workspace.name}`}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
        onOpen({
          workspace,
          x: rect.left,
          y: rect.bottom + 4,
          snapRightTo: rect.right,
        })
      }}
    >
      <HiEllipsisVertical className="size-5" aria-hidden />
    </button>
  )
}
