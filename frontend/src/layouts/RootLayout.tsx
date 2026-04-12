import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function RootLayout() {
  const { session, signOut, ready } = useAuth()

  return (
    <Box className="flex min-h-svh flex-col bg-white">
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
        ) : null}
      </Flex>
      <Box className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
        <Outlet />
      </Box>
    </Box>
  )
}
