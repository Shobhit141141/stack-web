import { Avatar, Box, Button, Flex } from '@radix-ui/themes'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { AppSidebar } from '../components/AppSidebar'
import { PdfViewerModal } from '../components/PdfViewerModal'
import { FullScreenLoader } from '../components/ui/full-screen-loader'
import { routeMap } from '../lib/routes'
import type { MeProfile } from '../types/auth'

function profileInitials(p: MeProfile): string {
  const from = p.displayName?.trim() || p.email || p.userName || '?'
  const parts = from.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase()
  }
  return from.slice(0, 2).toUpperCase()
}

export function RootLayout() {
  const { session, profile, signOut, ready, error, configError } = useAuth()

  const authBootstrapping = !ready
  const profilePending = Boolean(
    ready && session && !profile && !error,
  )
  const showFullLoader = authBootstrapping || profilePending
  const showAppChrome = Boolean(ready && session && !configError)

  return (
    <Box className="relative flex min-h-svh flex-col bg-white">
      <PdfViewerModal />
      {showFullLoader ? <FullScreenLoader /> : null}
      {showFullLoader ? null : showAppChrome ? (
        <Flex className="min-h-svh w-full">
          <AppSidebar />
          <Box className="flex min-h-svh min-w-0 flex-1 flex-col">
            <Flex
              align="center"
              justify="end"
              px="4"
              py="3"
              gap="3"
              className="shrink-0 border-b border-neutral-200 bg-white"
            >
              {profile ? (
                <Link
                  to={routeMap.profile}
                  className="rounded-full outline-none ring-neutral-900 focus-visible:ring-2"
                >
                  <Avatar
                    size="2"
                    radius="full"
                    fallback={profileInitials(profile)}
                    src={profile.avatarUrl ?? undefined}
                    referrerPolicy="no-referrer"
                    color="gray"
                    title={profile.displayName ?? profile.email}
                  />
                </Link>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="1"
                color="gray"
                highContrast
                onClick={() => void signOut()}
                className="cursor-pointer text-neutral-700"
              >
                Sign out
              </Button>
            </Flex>
            <Box className="flex-1 overflow-y-auto px-6 py-8">
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
