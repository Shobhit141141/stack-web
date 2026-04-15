import { useCallback, useEffect, useRef } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { useAuth } from '../auth/useAuth'
import { importFileFromUrl } from '../services/url-ingest-service'
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

/** skips inputs and app regions that should keep normal paste behavior */
function shouldIgnorePasteForLinkImport(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false
  if (target.closest('[data-no-link-import]')) return true
  const el = target as HTMLElement
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

/** returns normalized http(s) URL or null */
function normalizePastedUrl(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, '')
  if (t.length < 12 || t.length > 2048) return null
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

export function HomePage() {
  const { profile, error } = useAuth()
  const importingRef = useRef(false)

  const onPaste = useCallback((e: ClipboardEvent) => {
    if (importingRef.current) return
    if (shouldIgnorePasteForLinkImport(e.target)) return

    const text = e.clipboardData?.getData('text/plain')
    if (!text) return

    const url = normalizePastedUrl(text)
    if (!url) return

    e.preventDefault()
    e.stopPropagation()

    importingRef.current = true
    const promise = importFileFromUrl(url)
    toast.promise(promise, {
      loading: 'Importing from link…',
      success: (r) => `Saved “${r.fileName}”`,
      error: (err) =>
        err instanceof Error ? err.message : 'Could not import from this link',
    })
    void promise.finally(() => {
      importingRef.current = false
    })
  }, [])

  useEffect(() => {
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [onPaste])

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
        anywhere on this page (outside search) to fetch and save it as a file — progress
        shows in the corner.
      </Text>

      {error ? (
        <Text as="p" size="2" color="gray">
          {error}
        </Text>
      ) : null}
    </Flex>
  )
}
