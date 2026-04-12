import { Box, Button, Code, Flex, Heading, Text } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import { MdOutlineCloudDownload } from 'react-icons/md'
import { apiFetchOk } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

export function HomePage() {
  const { count, inc, lastFetchStatus, setLastFetchStatus } = useAppStore()
  const [loading, setLoading] = useState(false)

  const tryFetch = useCallback(async () => {
    setLoading(true)
    setLastFetchStatus(null)
    try {
      const res = await apiFetchOk(
        'https://jsonplaceholder.typicode.com/posts/1',
      )
      const data = (await res.json()) as { title?: string }
      setLastFetchStatus(`OK — ${data.title?.slice(0, 60) ?? 'no title'}…`)
    } catch (e) {
      setLastFetchStatus(
        e instanceof Error ? e.message : 'Request failed',
      )
    } finally {
      setLoading(false)
    }
  }, [setLastFetchStatus])

  return (
    <Box>
      <Heading size="7" mb="2">
        Home
      </Heading>
      <Text color="gray" mb="6" as="p">
        Vite + React + TypeScript + Tailwind + Radix Themes + React Router +
        Zustand + <Code>apiFetch</Code>.
      </Text>

      <Flex direction="column" gap="4" align="start">
        <Box>
          <Text weight="bold" mb="2" as="p">
            Zustand
          </Text>
          <Flex gap="3" align="center">
            <Button onClick={inc} variant='classic'>Count: {count}</Button>
          </Flex>
        </Box>

        <Box>
          <Text weight="bold" mb="2" as="p">
            Fetch helper
          </Text>
          <Button onClick={() => void tryFetch()} disabled={loading}>
            <Flex align="center" gap="2">
              <MdOutlineCloudDownload size={18} aria-hidden />
              {loading ? 'Loading…' : 'GET sample JSON (public API)'}
            </Flex>
          </Button>
          {lastFetchStatus ? (
            <Text size="2" mt="2" color="gray" as="p">
              {lastFetchStatus}
            </Text>
          ) : null}
        </Box>
      </Flex>
    </Box>
  )
}
