import { Text } from '@radix-ui/themes'
import { Link } from 'react-router-dom'
import { RecentsGuidelinesBanner } from '../components/recents/recents-guidelines-banner'
import { routeMap } from '../lib/routes'

// dummy route to preview onboarding copy without touching localStorage dismissal on home
export function RecentsGuidelinesPreviewPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <Text size="5" weight="bold" className="text-neutral-900">
          Guidelines preview
        </Text>
        <Text size="2" color="gray" className="mt-1 block max-w-2xl leading-relaxed">
          Dev-only path: same banner as home, but dismiss here does{' '}
          <span className="font-medium text-neutral-800">not</span> save to localStorage—so your
          real Recents page is unchanged.{' '}
          <Link
            to={routeMap.home}
            className="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-600"
          >
            Back to Recents
          </Link>
          .
        </Text>
      </div>
      <RecentsGuidelinesBanner previewMode />
    </div>
  )
}
