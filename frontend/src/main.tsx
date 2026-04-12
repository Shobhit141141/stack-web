import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme accentColor="violet" grayColor="sand" radius="medium">
      <RouterProvider router={router} />
    </Theme>
  </StrictMode>,
)
