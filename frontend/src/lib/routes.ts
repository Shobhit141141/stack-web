/** segments for routes nested under `/` (RootLayout outlet) */
export const appRouteSegment = {
  profile: 'profile',
  recents: 'recents',
  timeline: 'timeline',
  files: 'files',
  trash: 'trash',
} as const

/** full paths for router, Link, and redirects */
export const routeMap = {
  home: '/',
  login: '/login',
  profile: `/${appRouteSegment.profile}`,
  recents: `/${appRouteSegment.recents}`,
  timeline: `/${appRouteSegment.timeline}`,
  files: `/${appRouteSegment.files}`,
  trash: `/${appRouteSegment.trash}`,
} as const

export type AppRoutePath = (typeof routeMap)[keyof typeof routeMap]
