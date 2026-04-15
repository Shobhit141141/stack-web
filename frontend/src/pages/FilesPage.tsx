import { useCallback, useEffect, useState } from 'react'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { HiOutlineArrowUpTray, HiOutlineFolderPlus } from 'react-icons/hi2'
import {
  fetchFileList,
  fetchFileSignedUrl,
} from '../services/file-service'
import {
  createWorkspace,
  fetchWorkspaces,
  type WorkspaceItem,
} from '../services/workspace-service'
import { useUploadStore } from '../store/upload-store'
import { usePdfViewerStore } from '../store/pdf-viewer-store'
import { Skeleton } from '../components/ui/skeleton'
import type { FileItem } from '../types/file'

type FileFilter =
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'workspace'; id: string }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fileIcon(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('pdf')) return '/icons/pdf.svg'
  if (t.includes('doc') || t.includes('word')) return '/icons/docx-file.svg'
  return '/icons/cloud.svg'
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

export function FilesPage() {
  const openUpload = useUploadStore((s) => s.open)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [filter, setFilter] = useState<FileFilter>({ kind: 'all' })
  const [files, setFiles] = useState<FileItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  const openFile = useOpenFile()

  const loadWorkspaces = useCallback(async () => {
    try {
      const list = await fetchWorkspaces()
      setWorkspaces(list)
    } catch {
      toast.error('Could not load workspaces')
    }
  }, [])

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params: Parameters<typeof fetchFileList>[0] = {
      page: 1,
      limit: 100,
      sort: 'createdAt_desc',
    }
    if (filter.kind === 'unassigned') {
      params.unassignedOnly = true
    } else if (filter.kind === 'workspace') {
      params.workspaceId = filter.id
    }
    fetchFileList(params)
      .then((res) => {
        if (!cancelled) {
          setFiles(res.files)
          setTotal(res.pagination.total)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load files')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter])

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
      setFilter({ kind: 'workspace', id: ws.id })
      toast.success(`Workspace “${ws.name}” created`)
    } catch {
      toast.error('Could not create workspace')
    } finally {
      setCreateBusy(false)
    }
  }

  function defaultWorkspaceForUpload(): string | null {
    if (filter.kind === 'workspace') return filter.id
    return null
  }

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text size="5" weight="bold" className="text-neutral-900">
            Files
          </Text>
          <Text size="2" color="gray" className="mt-1 block">
            Organize uploads into workspaces and scope search and chat to a workspace.
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
            onClick={() =>
              openUpload({ defaultWorkspaceId: defaultWorkspaceForUpload() })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <HiOutlineArrowUpTray className="size-4" aria-hidden />
            Upload
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Text size="2" weight="medium" className="mr-2 text-neutral-600">
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
        {workspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setFilter({ kind: 'workspace', id: w.id })}
            className={`max-w-[12rem] truncate rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter.kind === 'workspace' && filter.id === w.id
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
            title={w.name}
          >
            {w.name}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-neutral-100 bg-white p-4"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <Text size="2" className="text-red-600">
          {error}
        </Text>
      )}

      {!loading && !error && files.length === 0 && (
        <Text size="2" className="text-neutral-500">
          No files match this filter. Upload files or pick another workspace.
        </Text>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_6rem_8rem_10rem] gap-4 border-b border-neutral-200 pb-2 text-xs font-medium text-neutral-400">
            <span>Name</span>
            <span>Size</span>
            <span>Workspace</span>
            <span className="text-right">Added</span>
          </div>
          {files.map((f) => {
            const ws = f.workspaceId
              ? workspaces.find((w) => w.id === f.workspaceId)
              : undefined
            const wsName = ws ? ws.name : '—'
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => void openFile(f)}
                className="grid w-full cursor-pointer grid-cols-[1fr_6rem_8rem_10rem] items-center gap-4 rounded-lg border border-transparent bg-white py-3 text-left transition-colors hover:border-neutral-200 hover:bg-neutral-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img src={fileIcon(f.type)} alt="" className="h-10 w-10 shrink-0" />
                  <Text size="2" className="min-w-0 truncate font-medium text-neutral-900">
                    {f.name}
                  </Text>
                </div>
                <Text size="2" className="text-neutral-600">
                  {formatSize(f.size)}
                </Text>
                <Text size="2" className="truncate text-neutral-600" title={wsName}>
                  {wsName}
                </Text>
                <Text size="2" className="text-right text-neutral-500">
                  {formatDate(f.createdAt)}
                </Text>
              </button>
            )
          })}
        </div>
      )}

      {!loading && !error && total > files.length ? (
        <Text size="1" color="gray">
          Showing {files.length} of {total} files.
        </Text>
      ) : null}

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
