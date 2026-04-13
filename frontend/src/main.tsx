import { Theme } from '@radix-ui/themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'
import { router } from './router'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme accentColor="gray" grayColor="gray" radius="small" appearance="light">
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </Theme>
  </StrictMode>,
)
