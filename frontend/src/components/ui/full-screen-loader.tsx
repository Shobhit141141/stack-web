import { LoadingSpinner } from './loading-spinner'

export function FullScreenLoader() {
  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-white">
      <LoadingSpinner className="size-8 border-gray-6 border-t-gray-11" />
    </div>
  )
}
