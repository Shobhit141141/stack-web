import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

// merges adjacent rows with same type + same payload (e.g. repeated searches)
function dedupeKey(item: ActivityItem): string {
  const meta = parseMetadata(item)
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

const DOT: Record<ActivityTypeName, string> = {
  chat: 'bg-violet-500',
  search: 'bg-sky-500',
  upload: 'bg-emerald-500',
}

const ICON: Record<ActivityTypeName, string> = {
  chat: '💬',
  search: '🔍',
  upload: '⬆️',
}

function typographicQuote(s: string, max = 96): string {
  const t = s.trim()
  const ell = t.length > max
  const body = ell ? `${t.slice(0, max).trimEnd()}…` : t
  const safe = body.replace(/"/g, '″')
  return `“${safe}”`
}

function activityPrimaryLine(item: ActivityItem): string {
  const meta = parseMetadata(item)
  if (item.type === 'upload') {
    const name =
      typeof meta.fileName === 'string' && meta.fileName.trim()
        ? meta.fileName.trim()
        : 'a file'
    return `Uploaded ${name}`
  }
  if (item.type === 'search') {
    const q = typeof meta.query === 'string' ? meta.query.trim() : ''
    return q ? `Searched ${typographicQuote(q)}` : 'Searched'
  }
  const q = typeof meta.query === 'string' ? meta.query.trim() : ''
  return q ? `Asked ${typographicQuote(q)}` : 'Asked the assistant'
}

function representativeItem(run: TimelineRun): ActivityItem {
  return run.kind === 'single' ? run.item : run.items[0]!
}

function primaryLineForRun(run: TimelineRun): string {
  const base = activityPrimaryLine(representativeItem(run))
  if (run.kind === 'cluster') return `${base} (${run.items.length} times)`
  return base
}

function newestCreatedAt(run: TimelineRun): string {
  return representativeItem(run).createdAt
}

function runRowKey(run: TimelineRun, index: number): string {
  if (run.kind === 'single') return run.item.id
  return `${run.items[0]!.id}-run-${run.items.length}-${index}`
}

function TimelineSkeleton() {
  return (
    <div className="relative w-full max-w-2xl space-y-8" aria-busy="true" aria-label="Loading timeline">
      <Skeleton className="mb-4 h-3 w-16 rounded" />
      <ul className="relative m-0 list-none space-y-1 p-0 before:pointer-events-none before:absolute before:left-3 before:top-2 before:bottom-2 before:z-0 before:w-px before:-translate-x-1/2 before:bg-neutral-200/90 before:content-['']">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="relative z-1 flex items-start gap-0">
            <div className="flex w-6 shrink-0 justify-center pt-2">
              <Skeleton className="size-2 rounded-full" />
            </div>
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

  const meta = parseMetadata(item)
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

function ActivityFeedRow({ run }: { run: TimelineRun }) {
  const item = representativeItem(run)
  const absTime = new Date(newestCreatedAt(run)).toLocaleString()
  const dot = DOT[item.type]
  const icon = ICON[item.type]
  const titleText =
    run.kind === 'cluster'
      ? `${primaryLineForRun(run)}\n${run.items.map((i) => new Date(i.createdAt).toLocaleString()).join('\n')}`
      : primaryLineForRun(run)

  return (
    <li className="group/row relative z-1 flex items-start gap-0 py-0.5">
      <div className="relative z-1 flex w-6 shrink-0 justify-center pt-2">
        <div className="flex items-center gap-1">
          <span className="text-[12px] leading-none opacity-80" aria-hidden title={item.type}>
            {icon}
          </span>
          <span
            className={`size-2 shrink-0 rounded-full ring-2 ring-white ${dot}`}
            title={item.type}
            aria-hidden
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 rounded-md px-3 py-2 transition-colors hover:bg-neutral-100/50">
        <div className="flex items-start justify-between gap-3">
          <p
            className="min-w-0 flex-1 text-sm font-medium leading-snug text-neutral-900"
            title={titleText}
          >
            {primaryLineForRun(run)}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <time
              dateTime={newestCreatedAt(run)}
              title={absTime}
              className="whitespace-nowrap pt-0.5 text-xs font-normal tabular-nums text-neutral-400"
            >
              {formatRelativeShort(newestCreatedAt(run))}
            </time>
            <RowActionsMenu item={item} />
          </div>
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

  const grouped = useMemo(() => groupActivityByBucket(items), [items])

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

  const invalidWorkspaceParam =
    searchParams.get('workspaceId') != null &&
    searchParams.get('workspaceId') !== '' &&
    workspaceIdParam === undefined

  return (
    <div className="flex h-full w-full flex-col px-6 py-8 pr-8">
      <div className="w-full max-w-2xl">
        <header className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Timeline</h1>
            <p className="mt-0.5 text-sm text-neutral-500">A quiet feed of what changed.</p>
          </div>
          {workspaceIdParam ? (
            <p className="text-sm text-neutral-500">
              <span className="font-medium text-neutral-800">{workspaceLabel}</span>
              <span className="mx-1.5 text-neutral-300">·</span>
              <button
                type="button"
                onClick={() => clearWorkspaceFilter()}
                className="text-neutral-600 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900"
              >
                All activity
              </button>
            </p>
          ) : null}
        </header>

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
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {workspaceIdParam ? 'Nothing here yet for this workspace.' : 'Nothing here yet.'}
          </p>
        ) : (
          <div className="space-y-10">
            {grouped.map((group) => {
              const runs = aggregateConsecutiveRuns(group.items)
              return (
                <section key={group.label} className="relative">
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    {group.label}
                  </h2>
                  <ul className="relative m-0 list-none space-y-0 p-0 before:pointer-events-none before:absolute before:left-3 before:top-2 before:bottom-2 before:z-0 before:w-px before:-translate-x-1/2 before:bg-neutral-200/90 before:content-['']">
                    {runs.map((run, idx) => (
                      <ActivityFeedRow key={runRowKey(run, idx)} run={run} />
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
              className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
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
