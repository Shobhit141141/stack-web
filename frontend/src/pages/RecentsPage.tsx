import { useEffect, useState } from 'react'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { RecentsGuidelinesBanner } from '../components/recents/recents-guidelines-banner'
import { RecentTasksStrip } from '../components/recents/recent-tasks-strip'
import { FileBrowserView } from '../components/files/file-browser-view'
import { FileRenameDeleteModals } from '../components/files/file-rename-delete-modals'
import { ViewModeToggle } from '../components/files/view-mode-toggle'
import { emitFilesUpdated } from '../lib/file-sync-events'
import { useRecentFiles } from '../hooks/use-recent-files'
import { useBrowserViewMode } from '../hooks/use-browser-view-mode'
import { useOpenFile } from '../hooks/use-open-file'
import { deleteFile, renameFile } from '../services/file-service'
import {
  assignFileToWorkspace,
  fetchWorkspaces,
  type WorkspaceItem,
} from '../services/workspace-service'
import type { FileItem } from '../types/file'

const VIEW_MODE_KEY = 'stack-recents-view'

export function RecentsPage() {
  const { files, loading, error, refetch } = useRecentFiles()
  const { view, setView } = useBrowserViewMode(VIEW_MODE_KEY)
  const openFile = useOpenFile()
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])

  useEffect(() => {
    void fetchWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
  }, [])

  async function handleRenameConfirm(file: FileItem, newName: string) {
    await renameFile(file.id, newName)
    toast.success('File renamed')
    await refetch()
  }

  async function handleDeleteConfirm(file: FileItem) {
    await deleteFile(file.id)
    emitFilesUpdated()
    toast.success('File deleted')
    await refetch()
  }

  async function handleMoveToWorkspace(file: FileItem, workspaceId: string | null) {
    try {
      await assignFileToWorkspace(file.id, workspaceId)
      const label =
        workspaceId === null
          ? 'unassigned'
          : (workspaces.find((w) => w.id === workspaceId)?.name ?? 'workspace')
      toast.success(
        workspaceId === null ? 'File is now unassigned' : `Moved to ${label}`,
      )
      await refetch()
    } catch {
      toast.error('Could not move file')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:gap-5 sm:p-6">
      <div className="flex items-center justify-between">
        <Text size="5" weight="bold" className="text-neutral-900">
          Recents
        </Text>
        <ViewModeToggle view={view} onChange={setView} />
      </div>

      <RecentsGuidelinesBanner />

      <RecentTasksStrip />

      <FileBrowserView
        files={files}
        loading={loading}
        error={error}
        emptyMessage="No recent files yet."
        view={view}
        dateStyle="relative"
        onOpenFile={(f) => void openFile(f)}
        onRenameFile={(f) => setRenameTarget(f)}
        onDeleteFile={(f) => setDeleteTarget(f)}
        workspaces={workspaces}
        onMoveFileToWorkspace={handleMoveToWorkspace}
      />

      <FileRenameDeleteModals
        renameTarget={renameTarget}
        deleteTarget={deleteTarget}
        onCloseRename={() => setRenameTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onRenameConfirm={handleRenameConfirm}
        onDeleteConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
