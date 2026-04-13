import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { routeMap } from '../lib/routes'

// shows route/load errors with a clear message; input: none (reads useRouteError); output: fallback ui
export function RouteErrorFallback() {
  const error = useRouteError()
  const navigate = useNavigate()

  let heading = 'Something went wrong'
  let detail = 'An unexpected error occurred.'

  if (isRouteErrorResponse(error)) {
    heading = `${error.status} ${error.statusText}`
    if (error.status === 404) {
      detail = 'This page does not exist or was moved.'
    } else if (typeof error.data === 'string' && error.data) {
      detail = error.data
    }
  } else if (error instanceof Error) {
    detail = error.message
  }

  return (
    <Box className="flex min-h-svh flex-col items-center justify-center bg-white px-6">
      <Flex direction="column" gap="4" align="center" className="max-w-sm text-center">
        <Text size="5" weight="medium" className="tracking-tight">
          {heading}
        </Text>
        <Text size="2" color="gray" className="leading-relaxed">
          {detail}
        </Text>
        <Button
          type="button"
          size="2"
          variant="soft"
          color="gray"
          highContrast
          className="cursor-pointer"
          onClick={() => navigate(routeMap.home, { replace: true })}
        >
          Go home
        </Button>
      </Flex>
    </Box>
  )
}
