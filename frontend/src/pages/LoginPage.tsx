import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { routeMap } from '../lib/routes'
import { FullScreenLoader } from '../components/ui/full-screen-loader'

export function LoginPage() {
  const { ready, configError, session, signInWithGoogle, error } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (ready && !configError && session) {
      navigate(routeMap.home, { replace: true })
    }
  }, [ready, configError, session, navigate])

  if (!ready) {
    return (
      <Box className="relative min-h-svh bg-white">
        <FullScreenLoader />
      </Box>
    )
  }

  if (configError) {
    return (
      <Box className="flex min-h-svh items-center justify-center bg-white px-6">
        <Text size="2" color="gray" className="max-w-sm leading-relaxed">
          {configError}
        </Text>
      </Box>
    )
  }

  return (
    <Box className="flex min-h-svh flex-col items-center justify-center bg-white px-6">
      <Flex direction="column" gap="6" align="stretch" className="w-full max-w-sm">
        <Text size="2" color="gray" className="leading-relaxed">
          Sign in with Google. Use the same Supabase project as your API; add this
          origin to Supabase Authentication redirect URLs.
        </Text>
        <Button
          type="button"
          size="3"
          variant="solid"
          color="gray"
          highContrast
          className="w-full cursor-pointer gap-2"
          onClick={() => void signInWithGoogle()}
        >
          <img
            src="/icons/google.svg"
            alt=""
            className="h-5 w-5 shrink-0"
            width={20}
            height={20}
          />
          Continue with Google
        </Button>
        {error ? (
          <Text size="2" color="gray">
            {error}
          </Text>
        ) : null}
      </Flex>
    </Box>
  )
}
