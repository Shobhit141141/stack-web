export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-6 shrink-0 animate-spin rounded-full border-2 border-gray-6 border-t-gray-11 ${className}`}
    />
  )
}
