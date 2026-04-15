import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import {
  fetchActivity,
  type ActivityItem,
  type ActivityTypeName,
} from '../services/activity-service'
import { fetchWorkspaces, type WorkspaceItem } from '../services/workspace-service'
import { routeMap } from '../lib/routes'
import { Skeleton } from '../components/ui/skeleton'
import { LoadingSpinner } from '../components/ui/loading-spinner'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function readWorkspaceId(raw: string | null): string | undefined {
  if (!raw || !raw.trim()) return undefined
  const w = raw.trim()
  return isUuid(w) ? w : undefined
}

function parseMetadata(item: ActivityItem): Record<string, unknown> {
  const m = item.metadata
  if (!m || typeof m !== 'object') return {}
  return m as Record<string, unknown>
}

function formatRelativeShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TYPE_STYLES: Record<
  ActivityTypeName,
  { stripe: string; chip: string; label: string }
> = {
  chat: {
    stripe: 'bg-violet-500',
    chip: 'border-violet-200/80 bg-violet-50 text-violet-950',
    label: 'Chat',
  },
  search: {
    stripe: 'bg-sky-500',
    chip: 'border-sky-200/80 bg-sky-50 text-sky-950',
    label: 'Search',
  },
  upload: {
    stripe: 'bg-emerald-500',
    chip: 'border-emerald-200/80 bg-emerald-50 text-emerald-950',
    label: 'Upload',
  },
}

function TimelineListSkeleton() {
  return (
    <div
      className="flex max-w-3xl flex-col gap-3"
      aria-busy="true"
      aria-label="Loading timeline"
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex overflow-hidden rounded-xl border border-neutral-200/90 bg-neutral-50/40 shadow-sm"
        >
          <div className="w-1 shrink-0 rounded-l-xl bg-neutral-200" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-14 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full max-w-sm rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityRow({
  item,
  workspaceIdParam,
  workspaceNameById,
}: {
  item: ActivityItem
  workspaceIdParam: string | undefined
  workspaceNameById: Map<string, string>
}) {
  const meta = parseMetadata(item)
  const styles = TYPE_STYLES[item.type]
  const wid =
    typeof meta.workspaceId === 'string' && isUuid(meta.workspaceId)
      ? meta.workspaceId
      : undefined
  const absTime = new Date(item.createdAt).toLocaleString()

  const fileName =
    item.type === 'upload' && typeof meta.fileName === 'string' ? meta.fileName.trim() : ''
  const searchQuery =
    item.type === 'search' && typeof meta.query === 'string' ? meta.query.trim() : ''

  return (
    <li className="flex overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm">
      <span
        className={`w-1 shrink-0 ${styles.stripe}`}
        aria-hidden
        title={styles.label}
      />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex max-w-full shrink-0 items-center truncate rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${styles.chip}`}
          >
            {styles.label}
          </span>
          <time
            dateTime={item.createdAt}
            title={absTime}
            className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-neutral-600"
          >
            {formatRelativeShort(item.createdAt)}
          </time>
          {wid && !workspaceIdParam ? (
            <Link
              to={`${routeMap.timeline}?workspaceId=${encodeURIComponent(wid)}`}
              title="Filter timeline to this workspace"
              className="inline-flex max-w-48 shrink-0 items-center truncate rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-950 hover:bg-amber-100/90"
            >
              {workspaceNameById.get(wid) ?? 'Workspace'}
            </Link>
          ) : null}
        </div>

        <div className="mt-3">
          {item.type === 'chat' ? (
            <span className="inline-flex rounded-full border border-neutral-200/90 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
              Assistant · prompt not shown
            </span>
          ) : null}
          {item.type === 'search' && searchQuery ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex shrink-0 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Query
              </span>
              <span
                className="inline-flex max-w-full min-w-0 rounded-full border border-sky-100 bg-sky-50/60 px-3 py-1.5 text-sm text-sky-950"
                title={searchQuery}
              >
                <span className="line-clamp-2 wrap-break-word">{searchQuery}</span>
              </span>
            </div>
          ) : null}
          {item.type === 'search' && !searchQuery ? (
            <p className="text-sm text-neutral-500">Semantic search</p>
          ) : null}
          {item.type === 'upload' && fileName ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex shrink-0 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                File
              </span>
              <span className="inline-flex max-w-full min-w-0 items-center truncate rounded-full border border-emerald-100 bg-emerald-50/60 px-3 py-1.5 text-sm font-medium text-emerald-950">
                {fileName}
              </span>
            </div>
          ) : null}
          {item.type === 'upload' && !fileName ? (
            <p className="text-sm text-neutral-500">File uploaded</p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function TimelinePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const workspaceIdParam = readWorkspaceId(searchParams.get('workspaceId'))

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [items, setItems] = useState<ActivityItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workspaceNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const w of workspaces) m.set(w.id, w.name)
    return m
  }, [workspaces])

  const workspaceLabel = useMemo(() => {
    if (!workspaceIdParam) return null
    return workspaceNameById.get(workspaceIdParam) ?? 'Workspace'
  }, [workspaceIdParam, workspaceNameById])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchWorkspaces()
        if (!cancelled) setWorkspaces(list)
      } catch {
        if (!cancelled) setWorkspaces([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetchActivity({
          limit: 30,
          cursor: cursor ?? undefined,
          workspaceId: workspaceIdParam,
        })
        setItems((prev) => (append ? [...prev, ...res.items] : res.items))
        setNextCursor(res.nextCursor)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load timeline'
        setError(msg)
        toast.error(msg)
        if (!append) setItems([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [workspaceIdParam],
  )

  useEffect(() => {
    void loadPage(null, false)
  }, [loadPage])

  function clearWorkspaceFilter() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('workspaceId')
      return next
    })
  }

  const invalidWorkspaceParam =
    searchParams.get('workspaceId') != null &&
    searchParams.get('workspaceId') !== '' &&
    workspaceIdParam === undefined

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 border-b border-neutral-200/80 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Text size="6" weight="bold" className="text-neutral-900">
            Timeline
          </Text>
          <Text size="2" color="gray" className="block max-w-xl leading-relaxed">
            Uploads, searches, and assistant turns. Chat entries never show your prompt on this
            screen.
          </Text>
        </div>
        {workspaceIdParam ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/90 bg-amber-50/90 pl-3 pr-1 py-1 text-xs font-medium text-amber-950">
              <span className="max-w-56 truncate" title={workspaceIdParam}>
                {workspaceLabel}
              </span>
              <button
                type="button"
                onClick={() => clearWorkspaceFilter()}
                className="rounded-full px-2 py-0.5 text-neutral-600 hover:bg-amber-100/80 hover:text-neutral-900"
                aria-label="Clear workspace filter"
              >
                ×
              </button>
            </span>
          </div>
        ) : null}
      </header>

      {invalidWorkspaceParam ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          Invalid <code className="rounded bg-red-100/80 px-1">workspaceId</code> in the URL. Remove
          it or open timeline from a workspace link.
        </div>
      ) : null}

      {loading ? (
        <TimelineListSkeleton />
      ) : error ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-6 py-12 text-center">
          <Text size="3" weight="medium" className="text-neutral-700">
            {workspaceIdParam ? 'No activity in this workspace yet' : 'No activity yet'}
          </Text>
          <Text size="2" color="gray" className="mt-2 block">
            {workspaceIdParam
              ? 'Upload files, search, or use chat here — events will show up when scoped to this workspace.'
              : 'Actions across your account will appear here.'}
          </Text>
        </div>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              workspaceIdParam={workspaceIdParam}
              workspaceNameById={workspaceNameById}
            />
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="flex max-w-3xl items-center gap-3 pt-1">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPage(nextCursor, true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <LoadingSpinner className="size-4 border-neutral-300 border-t-neutral-700" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </button>
        </div>
      ) : null}
    </div>
  )
}
