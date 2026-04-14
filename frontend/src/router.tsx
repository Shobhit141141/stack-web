import type { ReactNode } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { RouteErrorFallback } from './components/RouteErrorFallback'
import { appRouteSegment, routeMap } from './lib/routes'
import { RootLayout } from './layouts/RootLayout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RecentsPage } from './pages/RecentsPage'
import { SectionPlaceholderPage } from './pages/SectionPlaceholderPage'

const authed = (node: ReactNode) => <RequireAuth>{node}</RequireAuth>

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: routeMap.login, element: <LoginPage /> },
      {
        path: routeMap.home,
        element: <RootLayout />,
        children: [
          { index: true, element: authed(<HomePage />) },
          {
            path: appRouteSegment.profile,
            element: authed(<SectionPlaceholderPage title="Profile" />),
          },
          {
            path: appRouteSegment.recents,
            element: authed(<RecentsPage />),
          },
          {
            path: appRouteSegment.timeline,
            element: authed(<SectionPlaceholderPage title="Timeline" />),
          },
          {
            path: appRouteSegment.files,
            element: authed(<SectionPlaceholderPage title="Files" />),
          },
          {
            path: appRouteSegment.trash,
            element: authed(<SectionPlaceholderPage title="Trash" />),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
