import { createBrowserRouter, Outlet } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { RouteErrorFallback } from './components/RouteErrorFallback'
import { RootLayout } from './layouts/RootLayout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: <RootLayout />,
        children: [
          {
            index: true,
            element: (
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            ),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
