import { Box, Flex, Text } from '@radix-ui/themes'
import { useAuth } from '../auth/useAuth'
import type { MeProfile } from '../types/auth'

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

export function HomePage() {
  const { profile, error } = useAuth()

  if (!profile) {
    if (error) {
      return (
        <Flex align="center" justify="center" className="min-h-[30vh] w-full px-2">
          <Text size="2" color="gray" className="max-w-sm text-center">
            {error}
          </Text>
        </Flex>
      )
    }
    return null
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

      <Text
        as="p"
        size="2"
        color="gray"
        className="max-w-md leading-relaxed"
      >
        Paste an{' '}
        <span className="font-medium text-neutral-700">https://</span> link
        almost anywhere in the app to import it as a file (progress in the corner).
        Choose a workspace on the Files page or in the upload panel so imports land
        in the right place.
      </Text>

      {error ? (
        <Text as="p" size="2" color="gray">
          {error}
        </Text>
      ) : null}
    </Flex>
  )
}
