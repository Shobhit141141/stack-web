import { Avatar, Box, Button, Flex, Text } from '@radix-ui/themes'
import type { MeProfile } from '../auth/AuthContext'
import { useAuth } from '../auth/AuthContext'

function profileHeadline(p: MeProfile): string {
  const name = p.displayName?.trim()
  if (name) return name
  if (p.userName) return p.userName
  return p.email
}

function profileSubline(p: MeProfile, headline: string): string | null {
  if (p.email && p.email !== headline) return p.email
  if (p.userName && p.userName !== headline) return `@${p.userName}`
  return null
}

function profileInitials(p: MeProfile): string {
  const from = p.displayName?.trim() || p.email || p.userName || '?'
  const parts = from.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase()
  }
  return from.slice(0, 2).toUpperCase()
}

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

  if (!profile) {
    return (
      <Text size="2" color="gray">
        Loading profile…
      </Text>
    )
  }

  const headline = profileHeadline(profile)
  const subline = profileSubline(profile, headline)

  return (
    <Flex
      direction="column"
      align="center"
      gap="5"
      pt="2"
      className="text-center"
    >
      <Avatar
        size="4"
        radius="full"
        fallback={profileInitials(profile)}
        src={profile.avatarUrl ?? undefined}
        color="gray"
      />
      <Box>
        <Text as="p" size="6" weight="medium" highContrast mb="1">
          {headline}
        </Text>
        {subline ? (
          <Text as="p" size="2" color="gray">
            {subline}
          </Text>
        ) : null}
      </Box>
      {error ? (
        <Text as="p" size="2" color="gray">
          {error}
        </Text>
      ) : null}
    </Flex>
  )
}
