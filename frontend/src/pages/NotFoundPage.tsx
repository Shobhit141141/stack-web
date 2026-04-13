import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { useNavigate } from 'react-router-dom'

// friendly 404 for unknown paths; input: none; output: minimal not-found screen
export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Box className="flex min-h-svh flex-col items-center justify-center bg-white px-6">
      <Flex direction="column" gap="4" align="center" className="max-w-sm text-center">
        <Text size="5" weight="medium" className="tracking-tight">
          Page not found
        </Text>
        <Text size="2" color="gray" className="leading-relaxed">
          The link may be wrong or the page was removed.
        </Text>
        <Button
          type="button"
          size="2"
          variant="soft"
          color="gray"
          highContrast
          className="cursor-pointer"
          onClick={() => navigate('/', { replace: true })}
        >
          Go home
        </Button>
      </Flex>
    </Box>
  )
}
