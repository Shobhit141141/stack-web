import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { appRouteSegment, routeMap } from '../lib/routes'
import { fetchWorkspaces, type WorkspaceItem } from '../services/workspace-service'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function AppBreadcrumb() {
  const { pathname } = useLocation()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()

  const workspaceIdParam = params.workspaceId?.trim() ?? ''
  const timelineWs = searchParams.get('workspaceId')?.trim() ?? ''

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])

  const needsWorkspaceList =
    (pathname.startsWith(`/${appRouteSegment.workspaces}/`) &&
      isUuid(workspaceIdParam)) ||
    (pathname.startsWith(`/${appRouteSegment.timeline}`) &&
      timelineWs.length > 0 &&
      isUuid(timelineWs))

  useEffect(() => {
    if (!needsWorkspaceList) {
      setWorkspaces([])
      return
    }
    let cancelled = false
    void fetchWorkspaces()
      .then((list) => {
        if (!cancelled) setWorkspaces(list)
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([])
      })
    return () => {
      cancelled = true
    }
  }, [needsWorkspaceList, workspaceIdParam, timelineWs, pathname])

  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.name] as const)),
    [workspaces],
  )

  const { crumbs, detail } = useMemo(() => {
    const sub =
      profile?.displayName?.trim() ||
      (profile?.userName ? `@${profile.userName}` : null) ||
      profile?.email ||
      null

    if (pathname === '/' || pathname === '') {
      return {
        crumbs: [{ label: 'Recents', to: routeMap.home, emphasize: true }],
        detail: sub ? `Signed in · ${sub}` : 'Last opened files',
      }
    }

    if (pathname.startsWith(`/${appRouteSegment.profile}`)) {
      return {
        crumbs: [
          { label: 'Recents', to: routeMap.home },
          { label: 'Profile', emphasize: true },
        ],
        detail: 'Account & identity',
      }
    }

    if (pathname.startsWith(`/${appRouteSegment.timeline}`)) {
      const wsId = timelineWs && isUuid(timelineWs) ? timelineWs : null
      const wsName = wsId ? workspaceNameById.get(wsId) : undefined
      return {
        crumbs: [
          { label: 'Recents', to: routeMap.home },
          { label: 'Timeline', emphasize: !wsName },
          ...(wsName
            ? [{ label: wsName, emphasize: true }]
            : wsId
              ? [{ label: 'Workspace', emphasize: true }]
              : []),
        ],
        detail: wsName
          ? `Activity filtered · ${wsName}`
          : 'Uploads and searches',
      }
    }

    if (pathname.startsWith(`/${appRouteSegment.files}`)) {
      return {
        crumbs: [
          { label: 'Recents', to: routeMap.home },
          { label: 'Files', emphasize: true },
        ],
        detail: 'Workspaces, uploads, and library',
      }
    }

    if (
      pathname.startsWith(`/${appRouteSegment.workspaces}/`) &&
      isUuid(workspaceIdParam)
    ) {
      const nm = workspaceNameById.get(workspaceIdParam)
      return {
        crumbs: [
          { label: 'Files', to: routeMap.files },
          { label: nm ?? 'Workspace', emphasize: true },
        ],
        detail: nm
          ? `Chat + file list · ${nm}`
          : 'Workspace · loading name…',
      }
    }

    if (pathname.startsWith(`/${appRouteSegment.trash}`)) {
      return {
        crumbs: [
          { label: 'Recents', to: routeMap.home },
          { label: 'Trash', emphasize: true },
        ],
        detail: 'Deleted items',
      }
    }

    return {
      crumbs: [{ label: 'Recents', to: routeMap.home, emphasize: true }],
      detail: pathname,
    }
  }, [pathname, profile, workspaceIdParam, timelineWs, workspaceNameById])

  return (
    <div className="min-w-0 flex-1">
      <nav
        className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-neutral-500"
        aria-label="Breadcrumb"
      >
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-x-1.5">
            {i > 0 ? <span aria-hidden className="text-neutral-300">/</span> : null}
            {c.to ? (
              <Link to={c.to} className="shrink-0 hover:text-neutral-900">
                {c.label}
              </Link>
            ) : (
              <span
                className={
                  c.emphasize
                    ? 'truncate font-semibold text-neutral-900'
                    : 'truncate text-neutral-600'
                }
                title={c.label}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      {detail ? (
        <p className="mt-0.5 truncate text-xs text-neutral-400" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  )
}
