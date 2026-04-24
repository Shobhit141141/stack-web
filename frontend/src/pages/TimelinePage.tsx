import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import type { IconType } from 'react-icons'
import {
  HiOutlineArrowUpTray,
  HiOutlineChatBubbleLeftEllipsis,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2'
import {
  fetchActivity,
  type ActivityItem,
  type ActivityTypeName,
} from '../services/activity-service'
import {
  formatActivityRelativeTime,
  parseActivityMetadata,
} from '../utils/activity-display'
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

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function bucketLabelForDate(date: Date, now = new Date()): string {
  const s = startOfLocalDay(date)
  const n = startOfLocalDay(now)
  const diffDays = Math.round((n - s) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays >= 2 && diffDays < 7) return 'This week'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function groupActivityByBucket(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const map = new Map<string, ActivityItem[]>()
  for (const item of items) {
    const label = bucketLabelForDate(new Date(item.createdAt))
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(item)
  }
  const groups = [...map.entries()].map(([label, bucketItems]) => ({ label, items: bucketItems }))
  groups.sort((a, b) => {
    const ta = Math.max(...a.items.map((i) => new Date(i.createdAt).getTime()))
    const tb = Math.max(...b.items.map((i) => new Date(i.createdAt).getTime()))
    return tb - ta
  })
  return groups
}

function dedupeKey(item: ActivityItem): string {
  const meta = parseActivityMetadata(item)
  if (item.type === 'upload') {
    const name = typeof meta.fileName === 'string' ? meta.fileName.trim() : ''
    return `upload:${name}`
  }
  if (item.type === 'search') {
    const q = typeof meta.query === 'string' ? meta.query.trim() : ''
    return `search:${q}`
  }
  const q = typeof meta.query === 'string' ? meta.query.trim() : ''
  return `chat:${q}`
}

type TimelineRun =
  | { kind: 'single'; item: ActivityItem }
  | { kind: 'cluster'; items: ActivityItem[] }

function aggregateConsecutiveRuns(items: ActivityItem[]): TimelineRun[] {
  if (!items.length) return []
  const runs: TimelineRun[] = []
  let i = 0
  while (i < items.length) {
    const key = dedupeKey(items[i]!)
    let j = i + 1
    while (j < items.length && dedupeKey(items[j]!) === key) j++
    const slice = items.slice(i, j)
    if (slice.length === 1) runs.push({ kind: 'single', item: slice[0]! })
    else runs.push({ kind: 'cluster', items: slice })
    i = j
  }
  return runs
}

type ToneKey = 'sky' | 'violet' | 'emerald'

const TONE: Record<
  ToneKey,
  {
    tile: string
    icon: string
    ring: string
    label: string
  }
> = {
  sky: {
    tile: 'bg-sky-50',
    icon: 'text-sky-700',
    ring: 'ring-sky-200',
    label: 'text-sky-700',
  },
  violet: {
    tile: 'bg-violet-50',
    icon: 'text-violet-700',
    ring: 'ring-violet-200',
    label: 'text-violet-700',
  },
  emerald: {
    tile: 'bg-emerald-50',
    icon: 'text-emerald-700',
    ring: 'ring-emerald-200',
    label: 'text-emerald-700',
  },
}

const TYPE_PRESENTERS: Record<
  ActivityTypeName,
  { label: string; verb: string; tone: ToneKey; Icon: IconType }
> = {
  search: { label: 'Search', verb: 'Searched', tone: 'sky', Icon: HiOutlineMagnifyingGlass },
  chat: { label: 'Chat', verb: 'Asked', tone: 'violet', Icon: HiOutlineChatBubbleLeftEllipsis },
  upload: { label: 'Upload', verb: 'Uploaded', tone: 'emerald', Icon: HiOutlineArrowUpTray },
}

function representativeItem(run: TimelineRun): ActivityItem {
  return run.kind === 'single' ? run.item : run.items[0]!
}

function newestCreatedAt(run: TimelineRun): string {
  return representativeItem(run).createdAt
}

function runRowKey(run: TimelineRun, index: number): string {
  if (run.kind === 'single') return run.item.id
  return `${run.items[0]!.id}-run-${run.items.length}-${index}`
}

function detailFromItem(item: ActivityItem): { verb: string; object: string | null } {
  const meta = parseActivityMetadata(item)
  const presenter = TYPE_PRESENTERS[item.type]
  if (item.type === 'upload') {
    const name = typeof meta.fileName === 'string' ? meta.fileName.trim() : ''
    return { verb: presenter.verb, object: name || null }
  }
  const q = typeof meta.query === 'string' ? meta.query.trim() : ''
  return { verb: presenter.verb, object: q || null }
}

function TimelineSkeleton() {
  return (
    <div className="relative w-full" aria-busy="true" aria-label="Loading timeline">
      <Skeleton className="mb-4 h-3 w-16 rounded" />
      <ul className="relative m-0 list-none space-y-2 p-0 before:pointer-events-none before:absolute before:left-5 before:top-4 before:bottom-4 before:w-px before:-translate-x-1/2 before:bg-neutral-200/80 before:content-['']">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="relative z-1 flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 rounded-md px-3 py-2">
              <div className="flex items-start justify-between gap-4">
                <Skeleton className="h-4 max-w-md flex-1 rounded" />
                <Skeleton className="h-3 w-14 shrink-0 rounded" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RowActionsMenu({ item }: { item: ActivityItem }) {
  const closeRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const el = closeRef.current
      if (!el?.open) return
      if (e.target instanceof Node && !el.contains(e.target)) el.open = false
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const meta = parseActivityMetadata(item)
  const wid =
    typeof meta.workspaceId === 'string' && isUuid(meta.workspaceId)
      ? meta.workspaceId
      : undefined
  const fileId = typeof meta.fileId === 'string' && isUuid(meta.fileId) ? meta.fileId : undefined

  const openHref = wid ? routeMap.workspace(wid) : routeMap.files
  const openLabel = wid ? 'Open workspace' : 'Open files'

  return (
    <details
      ref={closeRef}
      className="relative shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 [[open]]:opacity-100"
    >
      <summary
        aria-label="Actions"
        className="flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-neutral-400 outline-none marker:hidden hover:bg-neutral-100 hover:text-neutral-700 [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden className="text-lg leading-none">
          ⋯
        </span>
      </summary>
      <div
        className="absolute right-0 top-full z-20 mt-1 min-w-38 rounded-lg border border-neutral-200/90 bg-white py-1 shadow-md"
        role="menu"
      >
        <Link
          to={openHref}
          role="menuitem"
          className="block px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
          onClick={() => {
            if (closeRef.current) closeRef.current.open = false
          }}
        >
          {openLabel}
        </Link>
        {wid ? (
          <Link
            to={routeMap.timelineWorkspace(wid)}
            role="menuitem"
            className="block px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
            onClick={() => {
              if (closeRef.current) closeRef.current.open = false
            }}
          >
            Workspace timeline
          </Link>
        ) : null}
        {item.type === 'upload' && fileId ? (
          <Link
            to={routeMap.files}
            role="menuitem"
            className="block px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
            onClick={() => {
              if (closeRef.current) closeRef.current.open = false
            }}
          >
            View in files
          </Link>
        ) : null}
        <button
          type="button"
          role="menuitem"
          disabled
          title="Not available yet"
          className="block w-full cursor-not-allowed px-3 py-1.5 text-left text-sm text-neutral-400"
        >
          Re-run
        </button>
        <button
          type="button"
          role="menuitem"
          disabled
          title="Not available yet"
          className="block w-full cursor-not-allowed px-3 py-1.5 text-left text-sm text-neutral-400"
        >
          Delete
        </button>
      </div>
    </details>
  )
}

function ActivityFeedRow({
  run,
  workspaceNameById,
  onWorkspaceClick,
}: {
  run: TimelineRun
  workspaceNameById: Map<string, string>
  onWorkspaceClick: (id: string) => void
}) {
  const item = representativeItem(run)
  const { Icon, tone, label } = TYPE_PRESENTERS[item.type]
  const toneCls = TONE[tone]
  const { verb, object } = detailFromItem(item)
  const absTime = new Date(newestCreatedAt(run)).toLocaleString()
  const clusterCount = run.kind === 'cluster' ? run.items.length : 0

  const meta = parseActivityMetadata(item)
  const wid =
    typeof meta.workspaceId === 'string' && isUuid(meta.workspaceId)
      ? meta.workspaceId
      : undefined
  const workspaceName = wid ? workspaceNameById.get(wid) : undefined

  const hoverTitle =
    run.kind === 'cluster'
      ? `${object ?? label} · ${clusterCount} times\n${run.items
          .map((i) => new Date(i.createdAt).toLocaleString())
          .join('\n')}`
      : absTime

  return (
    <li className="group/row relative z-1 flex items-start gap-3 py-0.5">
      <div
        className={`relative z-1 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${toneCls.tile} ${toneCls.ring}`}
        title={label}
        aria-hidden
      >
        <Icon className={`size-4 ${toneCls.icon}`} />
      </div>

      <div className="min-w-0 flex-1 rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${toneCls.tile} ${toneCls.label}`}
              >
                {label}
              </span>
              <span className="shrink-0 text-xs text-neutral-400">{verb}</span>
              {object ? (
                <span
                  className="min-w-0 truncate rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px] text-neutral-800"
                  title={object}
                >
                  {object}
                </span>
              ) : (
                <span className="text-xs text-neutral-500">—</span>
              )}
              {clusterCount > 1 ? (
                <span
                  className="shrink-0 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
                  title={`${clusterCount} consecutive occurrences`}
                >
                  ×{clusterCount}
                </span>
              ) : null}
            </div>
            {workspaceName ? (
              <button
                type="button"
                onClick={() => wid && onWorkspaceClick(wid)}
                className="inline-flex w-fit items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800"
                title="Filter this workspace"
              >
                <span
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rounded-full bg-neutral-300"
                />
                <span className="truncate">{workspaceName}</span>
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <time
              dateTime={newestCreatedAt(run)}
              title={hoverTitle}
              className="whitespace-nowrap pt-0.5 text-xs font-normal tabular-nums text-neutral-400"
            >
              {formatActivityRelativeTime(newestCreatedAt(run))}
            </time>
            <RowActionsMenu item={item} />
          </div>
        </div>
      </div>
    </li>
  )
}

const FILTERS: Array<{ key: 'all' | ActivityTypeName; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'chat', label: 'Chats' },
  { key: 'search', label: 'Searches' },
  { key: 'upload', label: 'Uploads' },
]

export function TimelinePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const workspaceIdParam = readWorkspaceId(searchParams.get('workspaceId'))

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [items, setItems] = useState<ActivityItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ActivityTypeName>('all')

  const workspaceNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const w of workspaces) m.set(w.id, w.name)
    return m
  }, [workspaces])

  const workspaceLabel = useMemo(() => {
    if (!workspaceIdParam) return null
    return workspaceNameById.get(workspaceIdParam) ?? 'Workspace'
  }, [workspaceIdParam, workspaceNameById])

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((it) => it.type === filter)
  }, [items, filter])

  const grouped = useMemo(() => groupActivityByBucket(filteredItems), [filteredItems])

  const typeCounts = useMemo(() => {
    const c = { chat: 0, search: 0, upload: 0 } as Record<ActivityTypeName, number>
    for (const it of items) c[it.type] = (c[it.type] ?? 0) + 1
    return c
  }, [items])

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
          limit: 40,
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

  function setWorkspaceFilter(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('workspaceId', id)
      return next
    })
  }

  const invalidWorkspaceParam =
    searchParams.get('workspaceId') != null &&
    searchParams.get('workspaceId') !== '' &&
    workspaceIdParam === undefined

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto px-4 py-6 pr-4 sm:px-6 sm:py-8 sm:pr-8">
      <div className="w-full max-w-3xl">
        <header className="mb-6 flex flex-col gap-1 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Timeline</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              A quiet feed of what you searched, asked, and uploaded.
            </p>
          </div>
          {workspaceIdParam ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700">
                <span className="size-1.5 rounded-full bg-neutral-400" aria-hidden />
                {workspaceLabel}
              </span>
              <button
                type="button"
                onClick={() => clearWorkspaceFilter()}
                className="text-xs text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900"
              >
                Clear
              </button>
            </div>
          ) : null}
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key
            const count =
              f.key === 'all' ? items.length : typeCounts[f.key as ActivityTypeName] ?? 0
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100',
                ].join(' ')}
              >
                {f.label}
                <span
                  className={[
                    'rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums',
                    active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {invalidWorkspaceParam ? (
          <p className="mb-6 text-sm text-red-700" role="alert">
            Invalid workspace in URL.
          </p>
        ) : null}

        {loading ? (
          <TimelineSkeleton />
        ) : error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-10 text-center">
            <p className="text-sm font-medium text-neutral-800">
              {filter === 'all'
                ? workspaceIdParam
                  ? 'Nothing here yet for this workspace.'
                  : 'Nothing here yet.'
                : 'No activity matches this filter.'}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Your searches, chats, and uploads will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map((group) => {
              const runs = aggregateConsecutiveRuns(group.items)
              return (
                <section key={group.label} className="relative">
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    {group.label}
                  </h2>
                  <ul className="relative m-0 list-none space-y-1 p-0 before:pointer-events-none before:absolute before:left-[18px] before:top-5 before:bottom-5 before:w-px before:bg-neutral-200/80 before:content-['']">
                    {runs.map((run, idx) => (
                      <ActivityFeedRow
                        key={runRowKey(run, idx)}
                        run={run}
                        workspaceNameById={workspaceNameById}
                        onWorkspaceClick={setWorkspaceFilter}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}

        {nextCursor ? (
          <div className="mt-8 flex items-center gap-2">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage(nextCursor, true)}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <LoadingSpinner className="size-4 border-neutral-300 border-t-neutral-600" />
                  Loading…
                </>
              ) : (
                'Load more'
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
