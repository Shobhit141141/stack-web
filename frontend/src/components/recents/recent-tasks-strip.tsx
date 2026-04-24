import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
} from '../../services/activity-service'
import { routeMap } from '../../lib/routes'
import {
  formatActivityRelativeTime,
  parseActivityMetadata,
} from '../../utils/activity-display'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

type ToneKey = 'sky' | 'violet' | 'emerald'

const TONE: Record<
  ToneKey,
  { tile: string; icon: string; ring: string; label: string }
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
  search: {
    label: 'Search',
    verb: 'Searched',
    tone: 'sky',
    Icon: HiOutlineMagnifyingGlass,
  },
  chat: {
    label: 'Chat',
    verb: 'Asked',
    tone: 'violet',
    Icon: HiOutlineChatBubbleLeftEllipsis,
  },
  upload: {
    label: 'Upload',
    verb: 'Uploaded',
    tone: 'emerald',
    Icon: HiOutlineArrowUpTray,
  },
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

function cardObject(item: ActivityItem): string | null {
  const meta = parseActivityMetadata(item)
  if (item.type === 'upload') {
    const name = typeof meta.fileName === 'string' ? meta.fileName.trim() : ''
    return name || null
  }
  const q = typeof meta.query === 'string' ? meta.query.trim() : ''
  return q || null
}

function CardSkeleton() {
  return (
    <div
      className="flex min-w-[240px] max-w-[280px] shrink-0 animate-pulse flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3"
      aria-hidden
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-neutral-200" />
          <div className="h-4 w-14 rounded-full bg-neutral-200" />
        </div>
        <div className="h-3 w-10 rounded bg-neutral-200" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 w-[70%] rounded bg-neutral-200" />
      </div>
    </div>
  )
}

// top 10 activity rows (chat, search, upload) in a horizontal card strip
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
    <section className="flex flex-col gap-3" aria-labelledby="recent-tasks-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="recent-tasks-heading"
            className="text-lg font-semibold tracking-tight text-neutral-900"
          >
            Recent activity
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Chats, searches, and uploads — open the timeline for full history.
          </p>
        </div>
        <Link
          to={routeMap.timeline}
          className="shrink-0 text-xs font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900"
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
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
            No activity yet — upload a file or start a chat to see it here.
          </div>
        ) : (
          items.map((item) => {
            const presenter = TYPE_PRESENTERS[item.type]
            const tone = TONE[presenter.tone]
            const Icon = presenter.Icon
            const object = cardObject(item)
            return (
              <Link
                key={item.id}
                to={activityCardHref(item)}
                role="listitem"
                className="group/card snap-start flex min-w-[240px] max-w-[280px] shrink-0 flex-col gap-2.5 rounded-xl border border-neutral-200 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${tone.tile} ${tone.ring}`}
                      aria-hidden
                    >
                      <Icon className={`size-4 ${tone.icon}`} />
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone.tile} ${tone.label}`}
                    >
                      {presenter.label}
                    </span>
                  </div>
                  <time
                    dateTime={item.createdAt}
                    className="shrink-0 text-[11px] font-medium tabular-nums text-neutral-400"
                    title={new Date(item.createdAt).toLocaleString()}
                  >
                    {formatActivityRelativeTime(item.createdAt)}
                  </time>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="shrink-0 text-xs text-neutral-400">
                    {presenter.verb}
                  </span>
                  {object ? (
                    <span
                      className="min-w-0 truncate rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px] text-neutral-800 group-hover/card:bg-neutral-200/70"
                      title={object}
                    >
                      {object}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-500">—</span>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </div>
    </section>
  )
}
