import { Box, Flex } from '@radix-ui/themes'
import { Toaster } from 'react-hot-toast'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { AppSidebar } from '../components/AppSidebar'
import { AppTopBar } from '../components/AppTopBar'
import { GlobalLinkPaste } from '../components/GlobalLinkPaste'
import { PdfViewerModal } from '../components/PdfViewerModal'
import { UploadModal } from '../components/UploadModal'
import { VoiceButton } from '../components/VoiceButton'
import { FullScreenLoader } from '../components/ui/full-screen-loader'
import type { RootLayoutOutletContext } from './root-layout-outlet-context'

export function RootLayout() {
  const { session, profile, ready, error, configError } = useAuth()
  const location = useLocation()
  const [topBarTrailing, setTopBarTrailing] = useState<ReactNode>(null)

  useEffect(() => {
    setTopBarTrailing(null)
  }, [location.pathname, location.search])

  const outletContext = useMemo<RootLayoutOutletContext>(
    () => ({ setTopBarTrailing }),
    [],
  )

  const authBootstrapping = !ready
  const profilePending = Boolean(
    ready && session && !profile && !error,
  )
  const showFullLoader = authBootstrapping || profilePending
  const showAppChrome = Boolean(ready && session && !configError)

  return (
    <Box className="relative flex h-svh flex-col overflow-hidden bg-white">
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'font-sans text-sm',
          style: {
            background: '#171717',
            color: '#fafafa',
            border: '1px solid #404040',
          },
        }}
      />
      <PdfViewerModal />
      <UploadModal />
      <VoiceButton />
      {showFullLoader ? <FullScreenLoader /> : null}
      {showFullLoader ? null : showAppChrome ? (
        <Flex className="h-svh w-full overflow-hidden">
          <GlobalLinkPaste />
          <AppSidebar />
          <Box className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AppTopBar trailing={topBarTrailing} />
            <Box className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3 lg:px-6">
              <Outlet context={outletContext} />
            </Box>
          </Box>
        </Flex>
      ) : (
        <Box className="mx-auto flex min-h-svh w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
          <Outlet />
        </Box>
      )}
    </Box>
  )
}
