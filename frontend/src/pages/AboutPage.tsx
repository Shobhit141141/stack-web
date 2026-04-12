import { Box, Heading, Text } from '@radix-ui/themes'
import { FaGithub } from 'react-icons/fa'

export function AboutPage() {
  return (
    <Box>
      <Heading size="7" mb="2">
        About
      </Heading>
      <Text color="gray" mb="4" as="p">
        Example route. React Icons:
      </Text>
      <FaGithub size={32} aria-label="GitHub" />
    </Box>
  )
}
