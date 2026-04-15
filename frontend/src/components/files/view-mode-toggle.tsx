import { HiOutlineSquares2X2, HiOutlineListBullet } from 'react-icons/hi2'
import type { BrowserViewMode } from '../../hooks/use-browser-view-mode'

type Props = {
  view: BrowserViewMode
  onChange: (mode: BrowserViewMode) => void
}

export function ViewModeToggle({ view, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors ${
          view === 'grid'
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
        aria-label="Grid view"
      >
        <HiOutlineSquares2X2 className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors ${
          view === 'list'
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
        aria-label="List view"
      >
        <HiOutlineListBullet className="size-4" />
      </button>
    </div>
  )
}
