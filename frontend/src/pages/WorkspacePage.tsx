import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { HiOutlineArrowPath } from 'react-icons/hi2'
import { FileBrowserView } from '../components/files/file-browser-view'
import { FileRenameDeleteModals } from '../components/files/file-rename-delete-modals'
import { ViewModeToggle } from '../components/files/view-mode-toggle'
import {
  WorkspaceFolderActionsMenu,
  WorkspaceToolbarMenuTrigger,
  type WorkspaceFolderMenuState,
} from '../components/workspaces/workspace-folder-menu'
import { WorkspaceDeleteModal, WorkspaceRenameModal } from '../components/workspaces/workspace-modals'
import { WorkspaceChatPanel } from '../components/workspace/workspace-chat-panel'
import { deleteFile, fetchFileList, renameFile } from '../services/file-service'
import {
  assignFileToWorkspace,
  deleteWorkspace,
  fetchWorkspaces,
  renameWorkspace,
  type WorkspaceItem,
} from '../services/workspace-service'
import { useLinkImportWorkspaceStore } from '../store/link-import-workspace-store'
import { useBrowserViewMode } from '../hooks/use-browser-view-mode'
import { useOpenFile } from '../hooks/use-open-file'
import {
  applyFileListPatches,
  emitFilesUpdated,
  FILES_UPDATED_EVENT,
  filterFilesForWorkspace,
  type FilesUpdatedDetail,
} from '../lib/file-sync-events'
import { markWorkspaceDeleted } from '../lib/pending-workspace-deletes'
import { routeMap } from '../lib/routes'
import type { RootLayoutOutletContext } from '../layouts/root-layout-outlet-context'
import type { FileItem } from '../types/file'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FILE_VIEW_KEY = 'stack-workspace-page-files-view'
const SPLIT_STORAGE_KEY = 'stack-workspace-page-chat-pct'
const DEFAULT_CHAT_PCT = 60
const MIN_CHAT_PCT = 30
const MAX_CHAT_PCT = 60

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function clampPct(n: number): number {
  return Math.min(MAX_CHAT_PCT, Math.max(MIN_CHAT_PCT, n))
}

function readStoredChatPct(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_PCT
  try {
    const raw = window.localStorage.getItem(SPLIT_STORAGE_KEY)
    if (!raw) return DEFAULT_CHAT_PCT
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_CHAT_PCT
    return clampPct(n)
  } catch {
    return DEFAULT_CHAT_PCT
  }
}

export function WorkspacePage() {
  const navigate = useNavigate()
  const { setTopBarTrailing } = useOutletContext<RootLayoutOutletContext>()
  const rawId = useParams().workspaceId ?? ''
  const workspaceId = rawId.trim()
  const setLinkImportWorkspaceId = useLinkImportWorkspaceStore(
    (s) => s.setLinkImportWorkspaceId,
  )
  const { view, setView } = useBrowserViewMode(FILE_VIEW_KEY)
  const openFile = useOpenFile()

  const [workspace, setWorkspace] = useState<WorkspaceItem | null>(null)
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceItem[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)
  const [bulkDeleteFiles, setBulkDeleteFiles] = useState<FileItem[] | null>(null)
  const [workspaceMenuState, setWorkspaceMenuState] = useState<WorkspaceFolderMenuState | null>(
    null,
  )
  const [workspaceRenameTarget, setWorkspaceRenameTarget] = useState<WorkspaceItem | null>(null)
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<WorkspaceItem | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [chatPct, setChatPct] = useState<number>(() => readStoredChatPct())
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const chatPaneRef = useRef<HTMLElement | null>(null)
  const filesPaneRef = useRef<HTMLElement | null>(null)
  const draggingRef = useRef(false)
  const liveChatPctRef = useRef(chatPct)

  const applySplit = useCallback((pct: number) => {
    if (chatPaneRef.current) chatPaneRef.current.style.flexBasis = `${pct}%`
    if (filesPaneRef.current) filesPaneRef.current.style.flexBasis = `${100 - pct}%`
  }, [])

  const onSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      draggingRef.current = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [],
  )

  const onSplitPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const rect = splitContainerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const pct = clampPct(((e.clientX - rect.left) / rect.width) * 100)
      liveChatPctRef.current = pct
      applySplit(pct)
    },
    [applySplit],
  )

  const endSplitDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const final = liveChatPctRef.current
      setChatPct(final)
      try {
        window.localStorage.setItem(SPLIT_STORAGE_KEY, String(Math.round(final)))
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const onSplitDoubleClick = useCallback(() => {
    liveChatPctRef.current = DEFAULT_CHAT_PCT
    applySplit(DEFAULT_CHAT_PCT)
    setChatPct(DEFAULT_CHAT_PCT)
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(DEFAULT_CHAT_PCT))
    } catch {
      /* ignore */
    }
  }, [applySplit])

  const load = useCallback(async () => {
    if (!isUuid(workspaceId)) {
      setWorkspace(null)
      setFiles([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await fetchWorkspaces()
      setAllWorkspaces(list)
      const ws = list.find((w) => w.id === workspaceId) ?? null
      setWorkspace(ws)
      if (!ws) {
        setFiles([])
        setLoading(false)
        return
      }
      const res = await fetchFileList({
        page: 1,
        limit: 200,
        sort: 'createdAt_desc',
        workspaceId,
      })
      setFiles(res.files)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      toast.error('Could not load workspace')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (isUuid(workspaceId)) {
      setLinkImportWorkspaceId(workspaceId)
    }
    return () => {
      setLinkImportWorkspaceId(null)
    }
  }, [workspaceId, setLinkImportWorkspaceId])

  useEffect(() => {
    function onFilesUpdated(ev: Event) {
      const detail = (ev as CustomEvent<FilesUpdatedDetail>).detail
      if (detail?.optimistic?.patchFiles?.length) {
        setFiles((prev) =>
          filterFilesForWorkspace(
            applyFileListPatches(prev, detail.optimistic!.patchFiles),
            workspaceId,
          ),
        )
      }
      if (
        detail?.global ||
        !detail?.workspaceId ||
        detail.workspaceId === workspaceId
      ) {
        void load()
      }
    }
    window.addEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
    return () => window.removeEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
  }, [workspaceId, load])

  useEffect(() => {
    if (!workspace) {
      setTopBarTrailing(null)
      return
    }
    setTopBarTrailing(
      <WorkspaceToolbarMenuTrigger workspace={workspace} onOpen={setWorkspaceMenuState} />,
    )
    return () => setTopBarTrailing(null)
  }, [workspace, setTopBarTrailing])

  const handleRefreshFiles = useCallback(async () => {
    if (!isUuid(workspaceId) || refreshing) return
    setRefreshing(true)
    try {
      const res = await fetchFileList({
        page: 1,
        limit: 200,
        sort: 'createdAt_desc',
        workspaceId,
      })
      setFiles(filterFilesForWorkspace(res.files, workspaceId))
    } catch {
      toast.error('Could not refresh files')
    } finally {
      setRefreshing(false)
    }
  }, [workspaceId, refreshing])

  if (!isUuid(workspaceId)) {
    return (
      <div className="p-4 sm:p-6">
        <Text size="3" color="gray">
          Invalid workspace link.
        </Text>
        <Link to={routeMap.files} className="mt-2 inline-block text-sm text-neutral-700 underline">
          Back to Files
        </Link>
      </div>
    )
  }

  if (!loading && !workspace) {
    return (
      <div className="p-4 sm:p-6">
        <Text size="3" color="gray">
          Workspace not found.
        </Text>
        <Link to={routeMap.files} className="mt-2 inline-block text-sm text-neutral-700 underline">
          Back to Files
        </Link>
      </div>
    )
  }

  async function handleRenameConfirm(file: FileItem, newName: string) {
    await renameFile(file.id, newName)
    toast.success('File renamed')
    await load()
  }

  async function handleDeleteConfirm(file: FileItem) {
    await deleteFile(file.id)
    emitFilesUpdated()
    toast.success('File deletion started')
    await load()
  }

  async function handleBulkDeleteConfirm(items: FileItem[]) {
    await Promise.all(items.map((f) => deleteFile(f.id)))
    emitFilesUpdated()
    toast.success(
      items.length === 1
        ? 'File deletion started'
        : `Deletion started for ${items.length} files`,
    )
    await load()
  }

  async function handleMoveToWorkspace(file: FileItem, targetWorkspaceId: string | null) {
    try {
      await assignFileToWorkspace(file.id, targetWorkspaceId)
      toast.success(
        targetWorkspaceId === null
          ? 'File is now unassigned'
          : `Moved to ${allWorkspaces.find((w) => w.id === targetWorkspaceId)?.name ?? 'workspace'}`,
      )
      await load()
    } catch {
      toast.error('Could not move file')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {workspace ? (
        <WorkspaceFolderActionsMenu
          state={workspaceMenuState}
          onClose={() => setWorkspaceMenuState(null)}
          workspacePath={(id) => routeMap.workspace(id)}
          onRename={(ws) => setWorkspaceRenameTarget(ws)}
          onDelete={(ws) => setWorkspaceDeleteTarget(ws)}
          mode="workspace-toolbar"
          onBackToFiles={() => navigate(routeMap.files)}
        />
      ) : null}

      <div
        ref={splitContainerRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
      >
        <section
          ref={chatPaneRef}
          style={{ flexBasis: `${chatPct}%` }}
          className="flex min-h-0 min-w-0 flex-1 flex-col border-neutral-200 lg:flex-none"
        >
          {workspace ? (
            <WorkspaceChatPanel workspaceId={workspace.id} workspaceName={workspace.name} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
              <Text size="2" color="gray">
                Loading…
              </Text>
            </div>
          )}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={MIN_CHAT_PCT}
          aria-valuemax={MAX_CHAT_PCT}
          aria-valuenow={Math.round(chatPct)}
          aria-label="Resize chat and files panes"
          tabIndex={-1}
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={endSplitDrag}
          onPointerCancel={endSplitDrag}
          onDoubleClick={onSplitDoubleClick}
          title="Drag to resize · double-click to reset"
          className="group relative hidden shrink-0 cursor-col-resize touch-none select-none items-center justify-center bg-neutral-200 transition-colors hover:bg-neutral-300 active:bg-neutral-400 lg:flex lg:w-px"
        >
          <span className="pointer-events-none absolute inset-y-0 -left-2 -right-2" aria-hidden />
          <span
            className="pointer-events-none absolute h-8 w-0.5 rounded-full bg-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100"
            aria-hidden
          />
        </div>

        <aside
          ref={filesPaneRef}
          style={{ flexBasis: `${100 - chatPct}%` }}
          className="flex min-h-0 w-full min-w-0 flex-1 shrink-0 flex-col gap-3 border-neutral-200 bg-neutral-50/60 p-3 sm:p-4 lg:w-auto lg:flex-none"
        >
          <div className="flex items-center justify-between gap-2">
            <Text size="3" weight="bold" className="text-neutral-900">
              Files
            </Text>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleRefreshFiles()}
                disabled={refreshing || loading}
                title="Refresh files"
                aria-label="Refresh files"
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <HiOutlineArrowPath
                  className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
                  aria-hidden
                />
              </button>
              <ViewModeToggle view={view} onChange={setView} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FileBrowserView
              files={files}
              loading={loading}
              error={error}
              emptyMessage="No files in this workspace yet."
              view={view}
              dateStyle="relative"
              onOpenFile={(f) => void openFile(f)}
              onRenameFile={(f) => setRenameTarget(f)}
              onDeleteFile={(f) => setDeleteTarget(f)}
              workspaces={allWorkspaces}
              onMoveFileToWorkspace={handleMoveToWorkspace}
              enableMultiSelect
              onBulkDeleteRequest={(items) => setBulkDeleteFiles(items)}
            />
          </div>
        </aside>
      </div>

      <FileRenameDeleteModals
        renameTarget={renameTarget}
        deleteTarget={deleteTarget}
        bulkDeleteTargets={bulkDeleteFiles}
        onCloseRename={() => setRenameTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onCloseBulkDelete={() => setBulkDeleteFiles(null)}
        onRenameConfirm={handleRenameConfirm}
        onDeleteConfirm={handleDeleteConfirm}
        onBulkDeleteConfirm={handleBulkDeleteConfirm}
      />

      <WorkspaceRenameModal
        target={workspaceRenameTarget}
        onClose={() => setWorkspaceRenameTarget(null)}
        onConfirm={async (ws, newName) => {
          await renameWorkspace(ws.id, newName)
          toast.success('Workspace renamed')
          await load()
        }}
      />
      <WorkspaceDeleteModal
        target={workspaceDeleteTarget}
        onClose={() => setWorkspaceDeleteTarget(null)}
        onConfirm={async (ws) => {
          markWorkspaceDeleted(ws.id)
          await deleteWorkspace(ws.id)
          emitFilesUpdated()
          toast.success(`Workspace “${ws.name}” deletion started`)
          navigate(routeMap.files, { replace: true })
        }}
      />
    </div>
  )
}
