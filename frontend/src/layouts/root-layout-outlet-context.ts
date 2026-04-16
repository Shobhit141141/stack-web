import type { ReactNode } from 'react'

/** Passed to `<Outlet context={...} />` from `RootLayout` for pages that extend the top bar. */
export type RootLayoutOutletContext = {
  setTopBarTrailing: (node: ReactNode | null) => void
}
