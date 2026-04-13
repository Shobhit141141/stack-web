import { Avatar, Box, Button, Flex, Text } from '@radix-ui/themes'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { FullScreenLoader } from '../components/ui/full-screen-loader'
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
  const { session, profile, signOut, ready, error } = useAuth()

  const authBootstrapping = !ready
  const profilePending = Boolean(
    ready && session && !profile && !error,
  )
  const showFullLoader = authBootstrapping || profilePending

  return (
    <Box className="relative flex min-h-svh flex-col bg-white">
      {showFullLoader ? <FullScreenLoader /> : null}
      <Flex
        align="center"
        justify="between"
        px="6"
        py="4"
        className="shrink-0 border-b border-gray-6"
      >
        <Text size="2" weight="medium" className="tracking-tight">
          Stack
        </Text>
        {ready && session ? (
          <Flex align="center" gap="3">
            {profile ? (
              <Avatar
                size="2"
                radius="full"
                fallback={profileInitials(profile)}
                src={profile.avatarUrl ?? undefined}
                // google cdn often blocks images when referrer is sent; without this radix shows fallback initials
                referrerPolicy="no-referrer"
                color="gray"
                title={profile.displayName ?? profile.email}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="1"
              color="gray"
              highContrast
              onClick={() => void signOut()}
              className="cursor-pointer"
            >
              Sign out
            </Button>
          </Flex>
        ) : null}
      </Flex>
      <Box className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
        <Outlet />
      </Box>
    </Box>
  )
}
