import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { useAuth } from '../auth/AuthContext'

export function HomePage() {
  const {
    ready,
    configError,
    session,
    profile,
    signInWithGoogle,
    error,
  } = useAuth()

  if (!ready) {
    return (
      <Text size="2" color="gray">
        Loading…
      </Text>
    )
  }

  if (configError) {
    return (
      <Text size="2" color="gray" className="leading-relaxed">
        {configError}
      </Text>
    )
  }

  if (!session) {
    return (
      <Flex direction="column" gap="6" align="stretch">
        <Text size="2" color="gray" className="leading-relaxed">
          Sign in with Google. Use the same Supabase project as your API; add
          this origin to Supabase Authentication redirect URLs.
        </Text>
        <Button
          type="button"
          size="3"
          variant="solid"
          color="gray"
          highContrast
          className="w-full cursor-pointer"
          onClick={() => void signInWithGoogle()}
        >
          Continue with Google
        </Button>
        {error ? (
          <Text size="2" color="gray">
            {error}
          </Text>
        ) : null}
      </Flex>
    )
  }

  return (
    <Flex direction="column" gap="8" align="stretch">
      <Box className="space-y-1 border-b border-gray-6 pb-8">
        <Text size="1" color="gray" className="uppercase tracking-widest">
          Signed in
        </Text>
        <Text size="5" weight="medium" highContrast>
          {profile?.displayName ?? profile?.userName ?? profile?.email ?? '—'}
        </Text>
        {profile?.email ? (
          <Text size="2" color="gray">
            {profile.email}
          </Text>
        ) : null}
      </Box>
      {error ? (
        <Text size="2" color="gray">
          {error}
        </Text>
      ) : null}
    </Flex>
  )
}
