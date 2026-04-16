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
        <Flex
          direction="column"
          align="center"
          gap="3"
          className="w-full"
          aria-label="Stack — context over storage"
        >
          <Flex align="center" justify="center" gap="1" wrap="nowrap" className="min-w-0">
            <img
              src="/icons/cloud.svg"
              alt=""
              className="h-14 w-14 shrink-0 sm:h-[4.25rem] sm:w-[4.25rem]"
              width={56}
              height={56}
              aria-hidden
            />
            <Text
              as="p"
              weight="bold"
              className="text-4xl leading-none tracking-tight text-neutral-900 sm:text-5xl uppercase font-[500]"
            >
              stack
            </Text>
          </Flex>
          <Text
            as="p"
            size="3"
            weight="medium"
            className="w-full text-center uppercase text-neutral-600"
          >
            context over storage
          </Text>
        </Flex>
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
