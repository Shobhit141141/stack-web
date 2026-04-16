import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchActivity,
  type ActivityItem,
  type ActivityTypeName,
} from '../../services/activity-service'
import { routeMap } from '../../lib/routes'
import {
  formatActivityRelativeTime,
  getActivityTitleLine,
  parseActivityMetadata,
} from '../../utils/activity-display'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function activityCardHref(item: ActivityItem): string {
  const meta = parseActivityMetadata(item)
  const wid =
    typeof meta.workspaceId === 'string' && isUuid(meta.workspaceId)
      ? meta.workspaceId
      : undefined
  if (wid) return routeMap.timelineWorkspace(wid)
  return routeMap.timeline
}

function TypeChip({ type }: { type: ActivityTypeName }) {
  const label = type === 'chat' ? 'Chat' : type === 'search' ? 'Search' : 'Upload'
  const base =
    'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider'
  if (type === 'chat') {
    return <span className={`${base} border-neutral-900 bg-neutral-900 text-white`}>{label}</span>
  }
  if (type === 'search') {
    return (
      <span className={`${base} border-neutral-900 bg-white text-neutral-900`}>{label}</span>
    )
  }
  return (
    <span className={`${base} border-neutral-400 bg-neutral-50 text-neutral-800`}>{label}</span>
  )
}

function CardSkeleton() {
  return (
    <div
      className="flex min-w-[220px] max-w-[260px] shrink-0 animate-pulse flex-col gap-2 rounded-xl border-2 border-neutral-200 bg-neutral-50 p-3"
      aria-hidden
    >
      <div className="flex justify-between gap-2">
        <div className="h-5 w-16 rounded-full bg-neutral-200" />
        <div className="h-3 w-12 rounded bg-neutral-200" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-neutral-200" />
        <div className="h-3 w-[85%] rounded bg-neutral-200" />
      </div>
    </div>
  )
}

// top 10 activity rows (chat, search, upload) in a horizontal b/w card strip
export function RecentTasksStrip() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchActivity({ limit: 10 })
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .catch(() => {
        if (!cancelled) {
          setItems([])
          setError('Could not load activity')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="flex flex-col gap-2" aria-labelledby="recent-tasks-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="recent-tasks-heading" className="text-lg font-bold tracking-tight text-neutral-900">
            Recent activity
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Chats, searches, and uploads — open the timeline for full history.
          </p>
        </div>
        <Link
          to={routeMap.timeline}
          className="shrink-0 text-xs font-medium text-neutral-700 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
        >
          View all
        </Link>
      </div>

      <div
        className={[
          'flex gap-3 overflow-x-auto overflow-y-hidden pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none]',
          '[&::-webkit-scrollbar]:hidden snap-x snap-mandatory',
        ].join(' ')}
        role="list"
        aria-label="Recent tasks"
      >
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : error ? (
          <p className="text-sm text-neutral-500" role="status">
            {error}
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
            No activity yet — upload a file or start a chat to see it here.
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              to={activityCardHref(item)}
              role="listitem"
              className="snap-start flex min-w-[220px] max-w-[280px] shrink-0 flex-col gap-2 rounded-xl border-2 border-neutral-900 bg-white p-3 shadow-[2px_2px_0_0_rgb(23,23,23)] transition-transform hover:-translate-y-0.5 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between gap-2">
                <TypeChip type={item.type} />
                <time
                  dateTime={item.createdAt}
                  className="shrink-0 text-[11px] font-medium tabular-nums text-neutral-500"
                >
                  {formatActivityRelativeTime(item.createdAt)}
                </time>
              </div>
              <p className="line-clamp-3 text-left text-sm font-medium leading-snug text-neutral-900">
                {getActivityTitleLine(item)}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  )
}
