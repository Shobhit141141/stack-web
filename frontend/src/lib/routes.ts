/** segments for routes nested under `/` (RootLayout outlet) */
export const appRouteSegment = {
  profile: 'profile',
  recents: 'recents',
  timeline: 'timeline',
  files: 'files',
  trash: 'trash',
  workspaces: 'workspaces',
} as const

/** full paths for router, Link, and redirects */
export const routeMap = {
  home: '/',
  login: '/login',
  profile: `/${appRouteSegment.profile}`,
  /** app home: recents UI is served at `/` (same as `home`) */
  recents: '/',
  timeline: `/${appRouteSegment.timeline}`,
  files: `/${appRouteSegment.files}`,
  trash: `/${appRouteSegment.trash}`,
  workspace: (workspaceId: string) =>
    `/${appRouteSegment.workspaces}/${workspaceId}`,
  /** activity timeline filtered to one workspace (uploads, searches in that ws) */
  timelineWorkspace: (workspaceId: string) =>
    `/${appRouteSegment.timeline}?workspaceId=${encodeURIComponent(workspaceId)}`,
  /** dev: always show recents guidelines UI; does not persist dismiss to localStorage */
  stackGuidelinesPreview: '/__stack/guidelines-preview',
} as const

export type AppRoutePath = Exclude<
  (typeof routeMap)[keyof typeof routeMap],
  (...args: string[]) => string
>
