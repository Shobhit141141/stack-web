import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { FileBrowserView } from '../components/files/file-browser-view'
import { ViewModeToggle } from '../components/files/view-mode-toggle'
import { WorkspaceChatPanel } from '../components/workspace/workspace-chat-panel'
import { fetchFileList } from '../services/file-service'
import { fetchWorkspaces, type WorkspaceItem } from '../services/workspace-service'
import { useLinkImportWorkspaceStore } from '../store/link-import-workspace-store'
import { useBrowserViewMode } from '../hooks/use-browser-view-mode'
import { useOpenFile } from '../hooks/use-open-file'
import { routeMap } from '../lib/routes'
import type { FileItem } from '../types/file'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FILE_VIEW_KEY = 'stack-workspace-page-files-view'

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function WorkspacePage() {
  const rawId = useParams().workspaceId ?? ''
  const workspaceId = rawId.trim()
  const setLinkImportWorkspaceId = useLinkImportWorkspaceStore(
    (s) => s.setLinkImportWorkspaceId,
  )
  const { view, setView } = useBrowserViewMode(FILE_VIEW_KEY)
  const openFile = useOpenFile()

  const [workspace, setWorkspace] = useState<WorkspaceItem | null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (!isUuid(workspaceId)) {
    return (
      <div className="p-6">
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
      <div className="p-6">
        <Text size="3" color="gray">
          Workspace not found.
        </Text>
        <Link to={routeMap.files} className="mt-2 inline-block text-sm text-neutral-700 underline">
          Back to Files
        </Link>
      </div>
    )
  }

  const name = workspace?.name ?? 'Workspace'

  return (
    <div
      data-no-link-import
      className="flex min-h-[min(100dvh,56rem)] flex-1 flex-col lg:min-h-[calc(100dvh-8rem)]"
    >
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <Link to={routeMap.files} className="hover:text-neutral-900">
            Files
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-neutral-900">{name}</span>
          <span aria-hidden className="text-neutral-300">
            |
          </span>
          <Link
            to={routeMap.timelineWorkspace(workspaceId)}
            className="hover:text-neutral-900"
          >
            Timeline
          </Link>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-[280px] min-w-0 flex-1 flex-col border-neutral-200 lg:min-h-0 lg:border-r">
          {workspace ? (
            <WorkspaceChatPanel workspaceId={workspace.id} workspaceName={workspace.name} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <Text size="2" color="gray">
                Loading…
              </Text>
            </div>
          )}
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-3 border-neutral-200 bg-neutral-50/60 p-4 lg:w-[22rem] lg:min-h-0 lg:border-l xl:w-96">
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
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
