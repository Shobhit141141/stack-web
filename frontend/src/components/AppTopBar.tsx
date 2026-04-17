import type { ReactNode } from 'react'
import { AppBreadcrumb } from './AppBreadcrumb'
import { SearchBar } from './SearchBar'

type Props = {
  /** e.g. workspace ⋮ menu — set from pages via outlet context */
  trailing?: ReactNode
}

export function AppTopBar({ trailing }: Props) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-neutral-200 bg-white px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
        <AppBreadcrumb />
        {trailing ? (
          <div className="flex shrink-0 items-center sm:pt-0.5">{trailing}</div>
        ) : null}
      </div>
      <div className="w-full shrink-0 lg:max-w-[min(100%,26rem)] xl:max-w-[min(100%,36rem)]">
        <SearchBar />
      </div>
    </div>
  )
}
