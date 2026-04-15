import { Text } from '@radix-ui/themes'
import { Link } from 'react-router-dom'
import { HiOutlineFolder } from 'react-icons/hi2'
import type { WorkspaceItem } from '../../services/workspace-service'
import type { BrowserViewMode } from '../../hooks/use-browser-view-mode'
import { FILE_LIST_GRID_TEMPLATE, formatRelativeTime } from '../../utils/file-display'
import { Skeleton } from '../ui/skeleton'

type Props = {
  workspaces: WorkspaceItem[]
  loading: boolean
  view: BrowserViewMode
  workspaceHref: (id: string) => string
}

function FolderCardGrid({
  ws,
  href,
}: {
  ws: WorkspaceItem
  href: string
}) {
  return (
    <Link
      to={href}
      className="group flex flex-col gap-2 rounded-xl bg-white p-4 text-left transition-colors hover:bg-neutral-50"
    >
      <div className="flex aspect-square w-full items-center justify-center rounded-md bg-neutral-100">
        <HiOutlineFolder className="size-12 text-neutral-500 transition-colors group-hover:text-neutral-800" aria-hidden />
      </div>
      <div className="flex w-full flex-col gap-0.5 overflow-hidden">
        <Text
          size="2"
          className="w-full truncate text-left font-medium text-neutral-900 transition-all duration-200 group-hover:font-semibold"
        >
          {ws.name}
        </Text>
        <Text size="1" className="text-neutral-500">
          {formatRelativeTime(ws.updatedAt)}
        </Text>
      </div>
    </Link>
  )
}

function FolderRowList({ ws, href }: { ws: WorkspaceItem; href: string }) {
  return (
    <Link
      to={href}
      className="group grid w-full items-center rounded-lg bg-white px-0 py-3 transition-colors hover:bg-neutral-50"
      style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <HiOutlineFolder className="size-8 shrink-0 text-neutral-500 group-hover:text-neutral-800" aria-hidden />
        <Text
          size="2"
          className="min-w-0 truncate font-medium text-neutral-900 transition-all duration-200 group-hover:font-semibold"
        >
          {ws.name}
        </Text>
      </div>
      <Text size="1" className="text-neutral-400">
        —
      </Text>
      <Text
        size="1"
        className="justify-self-end text-right text-neutral-500 transition-all duration-200 group-hover:font-bold"
      >
        {formatRelativeTime(ws.updatedAt)}
      </Text>
    </Link>
  )
}

export function WorkspaceFolderBrowser({ workspaces, loading, view, workspaceHref }: Props) {
  if (loading) {
    return view === 'grid' ? (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl bg-white p-4">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <div
          className="grid items-center px-0 pb-1"
          style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-14 justify-self-end" />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="grid items-center rounded-lg bg-white py-3"
            style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 w-12 justify-self-end" />
          </div>
        ))}
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <Text size="2" className="text-neutral-500">
        No workspaces yet. Create one to organize files.
      </Text>
    )
  }

  if (view === 'grid') {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {workspaces.map((w) => (
          <FolderCardGrid key={w.id} ws={w} href={workspaceHref(w.id)} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid items-center px-0 pb-1"
        style={{ gridTemplateColumns: FILE_LIST_GRID_TEMPLATE, gap: '1rem' }}
      >
        <span className="text-left text-xs font-medium text-neutral-400">Name</span>
        <span className="text-left text-xs font-medium text-neutral-400"> </span>
        <span className="justify-self-end text-right text-xs font-medium text-neutral-400">
          Updated
        </span>
      </div>
      {workspaces.map((w) => (
        <FolderRowList key={w.id} ws={w} href={workspaceHref(w.id)} />
      ))}
    </div>
  )
}
