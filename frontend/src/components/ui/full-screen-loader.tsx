import { HiOutlineArrowPath } from 'react-icons/hi2'
import { RiLoader4Line } from 'react-icons/ri'
export function FullScreenLoader() {
  return (
    <div
      className="absolute inset-0 z-[200] flex items-center justify-center bg-white/10 backdrop-blur-sm backdrop-saturate-150"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <RiLoader4Line
        className="size-11 shrink-0 animate-spin text-neutral-900 motion-reduce:animate-none"
        aria-hidden
      />
      <span className="sr-only">Loading</span>
    </div>
  )
}
