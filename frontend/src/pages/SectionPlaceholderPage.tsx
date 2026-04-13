import { Flex, Text } from '@radix-ui/themes'

// temporary shell for new sections until real ui exists; input: title string; output: centered heading + hint
export function SectionPlaceholderPage({ title }: { title: string }) {
  return (
    <Flex direction="column" align="center" gap="3" pt="2" className="text-center">
      <Text as="p" size="6" weight="medium" highContrast>
        {title}
      </Text>
      <Text as="p" size="2" color="gray">
        Coming soon.
      </Text>
    </Flex>
  )
}
