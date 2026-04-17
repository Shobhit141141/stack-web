import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
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
  emitFilesUpdated,
  FILES_UPDATED_EVENT,
  type FilesUpdatedDetail,
} from '../lib/file-sync-events'
import { routeMap } from '../lib/routes'
import type { RootLayoutOutletContext } from '../layouts/root-layout-outlet-context'
import type { FileItem } from '../types/file'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FILE_VIEW_KEY = 'stack-workspace-page-files-view'

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
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
      if (!detail?.workspaceId || detail.workspaceId === workspaceId) {
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
    toast.success('File deleted')
    await load()
  }

  async function handleBulkDeleteConfirm(items: FileItem[]) {
    await Promise.all(items.map((f) => deleteFile(f.id)))
    emitFilesUpdated()
    toast.success(
      items.length === 1 ? 'File deleted' : `Deleted ${items.length} files`,
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
    <div
      data-no-link-import
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <section className="flex min-h-[min(42dvh,20rem)] min-w-0 flex-1 flex-col border-neutral-200 lg:min-h-0 lg:border-r">
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

        <aside className="flex w-full shrink-0 flex-col gap-3 border-neutral-200 bg-neutral-50/60 p-3 sm:p-4 lg:w-88 lg:min-h-0 lg:border-l xl:w-96">
          <div className="flex items-center justify-between gap-2">
            <Text size="3" weight="bold" className="text-neutral-900">
              Files
            </Text>
            <ViewModeToggle view={view} onChange={setView} />
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
          await deleteWorkspace(ws.id)
          emitFilesUpdated()
          toast.success(`Workspace “${ws.name}” deleted`)
          navigate(routeMap.files)
        }}
      />
    </div>
  )
}
