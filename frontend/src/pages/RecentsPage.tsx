import { Text } from '@radix-ui/themes'
import { FileBrowserView } from '../components/files/file-browser-view'
import { ViewModeToggle } from '../components/files/view-mode-toggle'
import { useRecentFiles } from '../hooks/use-recent-files'
import { useBrowserViewMode } from '../hooks/use-browser-view-mode'
import { useOpenFile } from '../hooks/use-open-file'

const VIEW_MODE_KEY = 'stack-recents-view'

export function RecentsPage() {
  const { files, loading, error } = useRecentFiles()
  const { view, setView } = useBrowserViewMode(VIEW_MODE_KEY)
  const openFile = useOpenFile()

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Text size="5" weight="bold" className="text-neutral-900">
          Recents
        </Text>
        <ViewModeToggle view={view} onChange={setView} />
      </div>

      <FileBrowserView
        files={files}
        loading={loading}
        error={error}
        emptyMessage="No recent files yet."
        view={view}
        dateStyle="relative"
        onOpenFile={(f) => void openFile(f)}
      />
    </div>
  )
}
