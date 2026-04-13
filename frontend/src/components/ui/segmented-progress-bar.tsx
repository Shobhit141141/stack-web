type SegmentedProgressBarProps = {
  /** 0–100: share of segments drawn filled (black), e.g. used storage when remainder is “left” */
  filledPercent: number
  /** number of vertical bars; fewer when space is tight */
  segmentCount?: number
  'aria-label'?: string
}

// retro segmented meter: bordered tray, vertical bars, black = filled, light gray = empty; input: filledPercent 0–100; output: progressbar
export function SegmentedProgressBar({
  filledPercent,
  segmentCount = 24,
  'aria-label': ariaLabel = 'Progress',
}: SegmentedProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, filledPercent))
  const filledCount = Math.round((segmentCount * clamped) / 100)

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className="flex h-6 w-full gap-0.5 border-2 border-neutral-900 bg-white p-1"
    >
      {Array.from({ length: segmentCount }, (_, i) => (
        <div
          key={i}
          className={`min-w-0 min-h-0 flex-1 self-stretch ${
            i < filledCount ? 'bg-neutral-900' : 'bg-neutral-200'
          }`}
        />
      ))}
    </div>
  )
}
