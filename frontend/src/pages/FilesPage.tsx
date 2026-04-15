import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { HiOutlineArrowUpTray, HiOutlineFolderPlus } from 'react-icons/hi2'
import { FileBrowserView } from '../components/files/file-browser-view'
import { FileRenameDeleteModals } from '../components/files/file-rename-delete-modals'
import { ViewModeToggle } from '../components/files/view-mode-toggle'
import { WorkspaceFolderBrowser } from '../components/workspaces/workspace-folder-browser'
import {
  fetchFileList,
  renameFile,
  deleteFile,
} from '../services/file-service'
import {
  createWorkspace,
  fetchWorkspaces,
  type WorkspaceItem,
} from '../services/workspace-service'
import { useLinkImportWorkspaceStore } from '../store/link-import-workspace-store'
import { useUploadStore } from '../store/upload-store'
import { useBrowserViewMode } from '../hooks/use-browser-view-mode'
import { useOpenFile } from '../hooks/use-open-file'
import { routeMap } from '../lib/routes'
import type { FileItem } from '../types/file'

type FileFilter =
  | { kind: 'all' }
  | { kind: 'unassigned' }

const FOLDER_VIEW_KEY = 'stack-files-workspace-folders-view'
const FILE_VIEW_KEY = 'stack-files-main-files-view'

export function FilesPage() {
  const navigate = useNavigate()
  const openUpload = useUploadStore((s) => s.open)
  const setLinkImportWorkspaceId = useLinkImportWorkspaceStore(
    (s) => s.setLinkImportWorkspaceId,
  )
  const { view: folderView, setView: setFolderView } = useBrowserViewMode(FOLDER_VIEW_KEY)
  const { view: fileView, setView: setFileView } = useBrowserViewMode(FILE_VIEW_KEY)

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(true)
  const [filter, setFilter] = useState<FileFilter>({ kind: 'all' })
  const [files, setFiles] = useState<FileItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)

  const openFile = useOpenFile()

  const loadWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true)
    try {
      const list = await fetchWorkspaces()
      setWorkspaces(list)
    } catch {
      toast.error('Could not load workspaces')
    } finally {
      setWorkspacesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    setLinkImportWorkspaceId(null)
  }, [setLinkImportWorkspaceId])

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params: Parameters<typeof fetchFileList>[0] = {
      page: 1,
      limit: 100,
      sort: 'createdAt_desc',
    }
    if (filter.kind === 'unassigned') {
      params.unassignedOnly = true
    }
    try {
      const res = await fetchFileList(params)
      setFiles(res.files)
      setTotal(res.pagination.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  async function handleRenameConfirm(file: FileItem, newName: string) {
    await renameFile(file.id, newName)
    toast.success('File renamed')
    await loadFiles()
  }

  async function handleDeleteConfirm(file: FileItem) {
    await deleteFile(file.id)
    toast.success('File deleted')
    await loadFiles()
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault()
    const name = newWorkspaceName.trim()
    if (!name) {
      toast.error('Enter a workspace name')
      return
    }
    setCreateBusy(true)
    try {
      const ws = await createWorkspace(name)
      setWorkspaces((prev) => [ws, ...prev])
      setNewWorkspaceName('')
      setCreateOpen(false)
      toast.success(`Workspace “${ws.name}” created`)
      await loadWorkspaces()
      navigate(routeMap.workspace(ws.id))
    } catch {
      toast.error('Could not create workspace')
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text size="5" weight="bold" className="text-neutral-900">
            Files
          </Text>
          <Text size="2" color="gray" className="mt-1 block">
            Open a workspace folder to chat (RAG) and browse its files. Filters below apply to the
            file list.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
          >
            <HiOutlineFolderPlus className="size-4" aria-hidden />
            New workspace
          </button>
          <button
            type="button"
            onClick={() => openUpload({ defaultWorkspaceId: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <HiOutlineArrowUpTray className="size-4" aria-hidden />
            Upload
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Text size="4" weight="bold" className="text-neutral-900">
            Workspaces
          </Text>
          <ViewModeToggle view={folderView} onChange={setFolderView} />
        </div>
        <WorkspaceFolderBrowser
          workspaces={workspaces}
          loading={workspacesLoading}
          view={folderView}
          workspaceHref={(id) => routeMap.workspace(id)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text size="4" weight="bold" className="text-neutral-900">
            All files
          </Text>
          <ViewModeToggle view={fileView} onChange={setFileView} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Text size="2" weight="medium" className="mr-1 text-neutral-600">
            Show:
          </Text>
          <button
            type="button"
            onClick={() => setFilter({ kind: 'all' })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter.kind === 'all'
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            All files
          </button>
          <button
            type="button"
            onClick={() => setFilter({ kind: 'unassigned' })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter.kind === 'unassigned'
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            No workspace
          </button>
        </div>

        <FileBrowserView
          files={files}
          loading={loading}
          error={error}
          emptyMessage="No files match this filter. Upload files or open a workspace folder."
          view={fileView}
          dateStyle="relative"
          onOpenFile={(f) => void openFile(f)}
          onRenameFile={(f) => setRenameTarget(f)}
          onDeleteFile={(f) => setDeleteTarget(f)}
        />

        {!loading && !error && total > files.length ? (
          <Text size="1" color="gray">
            Showing {files.length} of {total} files.
          </Text>
        ) : null}
      </section>

      <FileRenameDeleteModals
        renameTarget={renameTarget}
        deleteTarget={deleteTarget}
        onCloseRename={() => setRenameTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onRenameConfirm={handleRenameConfirm}
        onDeleteConfirm={handleDeleteConfirm}
      />

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-workspace-title"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Text id="new-workspace-title" size="4" weight="bold" className="text-neutral-900">
              New workspace
            </Text>
            <Text size="2" color="gray" className="mt-1 mb-4 block">
              Workspaces group files for search and chat context.
            </Text>
            <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-4">
              <div>
                <label htmlFor="ws-name" className="mb-1 block text-sm font-medium text-neutral-700">
                  Name
                </label>
                <input
                  id="ws-name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                  placeholder="e.g. Q1 reports"
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBusy}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {createBusy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
