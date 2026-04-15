import { AnimatePresence, motion } from 'motion/react'
import { HiOutlineMicrophone } from 'react-icons/hi2'
import { useVapi } from '../hooks/use-vapi'

export function VoiceButton() {
  const { status, transcript, assistantMessage, configured, toggle } = useVapi()

  if (!configured) return null

  const isActive = status === 'active'
  const isConnecting = status === 'connecting'
  const isError = status === 'error'

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {/* Transcript / response bubble */}
      <AnimatePresence>
        {(transcript || assistantMessage) && isActive && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-72 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
          >
            {transcript && (
              <div className="mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  You
                </span>
                <p className="mt-0.5 text-sm text-neutral-900">{transcript}</p>
              </div>
            )}
            {assistantMessage && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Answer
                </span>
                <p className="mt-0.5 text-sm text-neutral-700">{assistantMessage}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic button */}
      <motion.button
        type="button"
        onClick={toggle}
        disabled={isConnecting}
        whileTap={{ scale: 0.92 }}
        className={`relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-lg transition-colors ${
          isActive
            ? 'bg-red-600 text-white hover:bg-red-700'
            : isError
              ? 'bg-red-100 text-red-600'
              : isConnecting
                ? 'bg-neutral-200 text-neutral-500'
                : 'bg-neutral-900 text-white hover:bg-neutral-800'
        }`}
        aria-label={isActive ? 'Stop voice chat' : 'Start voice chat'}
        title={isActive ? 'Stop voice chat' : 'Ask your files with voice'}
      >
        <HiOutlineMicrophone className="size-6" />
        {/* Pulse ring when active */}
        {isActive && (
          <span className="absolute inset-0 animate-ping rounded-full bg-red-600 opacity-20" />
        )}
        {/* Connecting spinner */}
        {isConnecting && (
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-neutral-500" />
        )}
      </motion.button>
    </div>
  )
}
