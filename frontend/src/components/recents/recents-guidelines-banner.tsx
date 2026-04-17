// Testing: visit /__stack/guidelines-preview while signed in. On real home, delete
// RECENTS_GUIDELINES_DISMISSED_KEY from localStorage to show the banner again.
import { Text } from '@radix-ui/themes'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HiOutlineArrowUpTray,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClock,
  HiOutlineFolder,
  HiOutlineLink,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { routeMap } from '../../lib/routes'
import { useUploadStore } from '../../store/upload-store'

export const RECENTS_GUIDELINES_DISMISSED_KEY = 'stack:recents-guidelines-dismissed'

type RecentsGuidelinesBannerProps = {
  /** when true (preview route): ignore localStorage; dismiss only hides until "Show again" */
  previewMode?: boolean
}

type FeatureCardProps = {
  icon: ReactNode
  title: string
  children: ReactNode
  footer?: ReactNode
}

// fixed-height tile: same footprint for every card; body scrolls if copy is long
function FeatureCard({ icon, title, children, footer }: FeatureCardProps) {
  return (
    <div className="flex h-[168px] w-full min-w-0 flex-col rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md sm:h-[172px]">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white [&>svg]:size-3.5">
          {icon}
        </div>
        <h3 className="min-w-0 truncate text-[11px] font-bold leading-tight tracking-tight text-neutral-900">
          {title}
        </h3>
      </div>
      <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto text-[10px] leading-snug text-neutral-600 [scrollbar-width:thin]">
        {children}
      </div>
      <div className="mt-1.5 flex h-[30px] shrink-0 items-end border-t border-neutral-100 pt-1.5">
        {footer ?? <span className="block h-[22px] w-full" aria-hidden />}
      </div>
    </div>
  )
}

// one-time welcome + how-to for new users on home (recents); persists dismiss in localStorage
export function RecentsGuidelinesBanner({ previewMode = false }: RecentsGuidelinesBannerProps) {
  const [visible, setVisible] = useState(previewMode)
  const openUpload = useUploadStore((s) => s.open)

  useEffect(() => {
    if (previewMode) {
      setVisible(true)
      return
    }
    try {
      setVisible(localStorage.getItem(RECENTS_GUIDELINES_DISMISSED_KEY) !== '1')
    } catch {
      setVisible(true)
    }
  }, [previewMode])

  const dismiss = useCallback(() => {
    if (!previewMode) {
      try {
        localStorage.setItem(RECENTS_GUIDELINES_DISMISSED_KEY, '1')
      } catch {
        // ignore quota / private mode
      }
    }
    setVisible(false)
  }, [previewMode])

  if (!visible) {
    if (!previewMode) return null
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/80 px-4 py-3 text-sm text-neutral-600">
        <span>Banner hidden in preview.</span>{' '}
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="font-medium text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-700"
        >
          Show again
        </button>
      </div>
    )
  }

  const btnPrimary =
    'w-full rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-neutral-800'
  const btnGhost =
    'w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-900 hover:bg-neutral-50'

  return (
    <section
      className="relative shrink-0 rounded-xl border border-neutral-200 bg-linear-to-br from-neutral-50 via-white to-neutral-100 p-3 pr-10 shadow-sm sm:p-4 sm:pr-11"
      aria-labelledby="recents-guidelines-title"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/90 hover:text-neutral-900"
        aria-label="Dismiss guidelines"
      >
        <HiOutlineXMark className="size-4" />
      </button>
      <div className="pr-4">
        <Text id="recents-guidelines-title" as="p" size="4" weight="bold" className="text-neutral-900">
          How to use Stack
        </Text>
        <Text as="p" size="1" color="gray" className="mt-0.5 leading-snug">
          {previewMode
            ? 'Preview—dismiss here does not affect the real Recents banner.'
            : 'Quick tour — × or Got it to close.'}
        </Text>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 min-[900px]:grid-cols-5 min-[900px]:gap-2.5">
        <FeatureCard
          icon={<HiOutlineArrowUpTray aria-hidden />}
          title="Upload"
          footer={
            <button type="button" onClick={() => openUpload()} className={btnPrimary}>
              Open Upload
            </button>
          }
        >
          <p>
            Sidebar <span className="font-medium text-neutral-800">Upload</span>. PDF/DOCX, max 10
            files × 5 MB. Set workspace in the panel.
          </p>
        </FeatureCard>

        <FeatureCard
          icon={<HiOutlineLink aria-hidden />}
          title="URL import"
          footer={
            <button type="button" onClick={() => openUpload()} className={btnGhost}>
              Upload → URL
            </button>
          }
        >
          <p>
            Open Upload → <span className="font-medium text-neutral-800">Import from URL</span>.
            Paste <span className="font-mono text-neutral-800">https://…</span>, pick workspace,
            import.
          </p>
        </FeatureCard>

        <FeatureCard icon={<HiOutlineFolder aria-hidden />} title="Workspaces">
          <p>
            <Link
              to={routeMap.files}
              className="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-1 hover:decoration-neutral-600"
            >
              Files
            </Link>{' '}
            — folders scope chat/search. Move files into the right workspace.
          </p>
        </FeatureCard>

        <FeatureCard icon={<HiOutlineClock aria-hidden />} title="Recents">
          <p>Home: last opened files. Open one to resume without browsing everything.</p>
        </FeatureCard>

        <FeatureCard icon={<HiOutlineChatBubbleLeftRight aria-hidden />} title="Chat @">
          <p>
            In a workspace, side chat: type{' '}
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-0.5 font-mono text-[9px] text-neutral-900">
              @
            </kbd>{' '}
            to tag files for the model.
          </p>
        </FeatureCard>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200/80 pt-2.5">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          Got it
        </button>
        <Text as="span" size="1" color="gray" className="text-[11px] leading-snug">
          Global: paste <span className="font-mono text-neutral-700">https://</span> anywhere to
          import.
        </Text>
      </div>
    </section>
  )
}
