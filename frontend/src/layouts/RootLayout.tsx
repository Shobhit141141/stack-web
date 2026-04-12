import { Box, Button, Flex, Heading, Separator, Text } from '@radix-ui/themes'
import { Link, Outlet, NavLink } from 'react-router-dom'
import { FiHome, FiInfo } from 'react-icons/fi'

export function RootLayout() {
  return (
    <Box className="min-h-svh">
      <Flex
        align="center"
        justify="between"
        px="4"
        py="3"
        className="border-b border-gray-6 bg-gray-1"
      >
        <Heading size="5" weight="bold">
          Stack
        </Heading>
        <Flex gap="2" align="center">
          <Button asChild variant="soft" size="2">
            <NavLink
              to="/"
              className={({ isActive }) => (isActive ? 'font-semibold' : '')}
            >
              <Flex align="center" gap="2">
                <FiHome aria-hidden />
                Home
              </Flex>
            </NavLink>
          </Button>
          <Button asChild variant="soft" size="2">
            <NavLink
              to="/about"
              className={({ isActive }) => (isActive ? 'font-semibold' : '')}
            >
              <Flex align="center" gap="2">
                <FiInfo aria-hidden />
                About
              </Flex>
            </NavLink>
          </Button>
        </Flex>
      </Flex>
      <Box p="6" className="max-w-3xl mx-auto">
        <Outlet />
      </Box>
      <Separator size="4" my="6" />
      <Text size="1" color="gray" align="center" as="p" mb="4">
        <Link to="/" className="text-gray-11 underline">
          Home
        </Link>
      </Text>
    </Box>
  )
}
