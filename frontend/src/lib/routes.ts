/** segments for routes nested under `/` (RootLayout outlet) */
export const appRouteSegment = {
  profile: 'profile',
  recents: 'recents',
  timeline: 'timeline',
  files: 'files',
  trash: 'trash',
  workspaces: 'workspaces',
  chats: 'chats',
} as const

/** full paths for router, Link, and redirects */
export const routeMap = {
  home: '/',
  login: '/login',
  profile: `/${appRouteSegment.profile}`,
  recents: `/${appRouteSegment.recents}`,
  timeline: `/${appRouteSegment.timeline}`,
  files: `/${appRouteSegment.files}`,
  chats: `/${appRouteSegment.chats}`,
  trash: `/${appRouteSegment.trash}`,
  workspace: (workspaceId: string) =>
    `/${appRouteSegment.workspaces}/${workspaceId}`,
  /** activity timeline filtered to one workspace (for chat history, uploads, searches in that ws) */
  timelineWorkspace: (workspaceId: string) =>
    `/${appRouteSegment.timeline}?workspaceId=${encodeURIComponent(workspaceId)}`,
} as const

export type AppRoutePath = Exclude<
  (typeof routeMap)[keyof typeof routeMap],
  (...args: string[]) => string
>
