import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function RootLayout() {
  const { session, signOut, ready } = useAuth()

  return (
    <Box className="min-h-svh bg-white">
      <Flex
        align="center"
        justify="between"
        px="6"
        py="4"
        className="border-b border-gray-12"
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
            className="cursor-pointer uppercase tracking-widest"
          >
            Sign out
          </Button>
        ) : null}
      </Flex>
      <Box className="mx-auto max-w-md px-6 py-16">
        <Outlet />
      </Box>
    </Box>
  )
}
