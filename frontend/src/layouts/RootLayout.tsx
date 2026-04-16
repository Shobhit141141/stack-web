import { Box, Flex } from '@radix-ui/themes'
import { Toaster } from 'react-hot-toast'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { AppSidebar } from '../components/AppSidebar'
import { GlobalLinkPaste } from '../components/GlobalLinkPaste'
import { SearchBar } from '../components/SearchBar'
import { PdfViewerModal } from '../components/PdfViewerModal'
import { UploadModal } from '../components/UploadModal'
import { VoiceButton } from '../components/VoiceButton'
import { FullScreenLoader } from '../components/ui/full-screen-loader'

export function RootLayout() {
  const { session, profile, ready, error, configError } = useAuth()

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
            <Flex
              align="center"
              px="4"
              py="3"
              gap="3"
              className="min-w-0 shrink-0 border-b border-neutral-200 bg-white"
            >
              <div className="min-w-0 flex-1">
                <SearchBar />
              </div>
            </Flex>
            <Box className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-8">
              <Outlet />
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
