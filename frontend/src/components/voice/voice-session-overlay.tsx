import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { HiOutlineMicrophone, HiOutlineXMark } from 'react-icons/hi2'
import type { VapiStatus, VoiceTurn } from '../../hooks/use-vapi'

type Props = {
  status: VapiStatus
  userText: string
  assistantText: string
  assistantStreaming: boolean
  turns: VoiceTurn[]
  connectStage: string
  connectSlow: boolean
  onEnd: () => void
}

// full-screen voice session: blurred backdrop, morphing gradient blob, glass transcript (no per-chunk remount — text updates in place for streaming)
export function VoiceSessionOverlay({
  status,
  userText,
  assistantText,
  assistantStreaming,
  turns,
  connectStage,
  connectSlow,
  onEnd,
}: Props) {
  const isConnecting = status === 'connecting'
  const scrollRef = useRef<HTMLDivElement>(null)

  // auto-scroll when new turns arrive or live text updates
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, userText, assistantText])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Voice session"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-70"
    >
      <div className="absolute inset-0 bg-neutral-950/50 backdrop-blur-2xl backdrop-saturate-150" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-1/2 top-[32%] h-[min(85vw,440px)] w-[min(85vw,440px)] -translate-x-1/2 -translate-y-1/2 bg-linear-to-br from-sky-400/75 via-indigo-500/80 to-fuchsia-500/75 opacity-90"
          animate={{
            borderRadius: [
              '42% 58% 62% 38% / 48% 42% 58% 52%',
              '58% 42% 38% 62% / 52% 58% 42% 48%',
              '38% 62% 48% 52% / 42% 48% 58% 52%',
              '42% 58% 62% 38% / 48% 42% 58% 52%',
            ],
            rotate: [0, 6, -4, 2, 0],
            scale: [1, 1.06, 0.98, 1.04, 1],
          }}
          transition={{
            duration: isConnecting ? 5 : 14,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ filter: 'blur(48px)' }}
        />
        <motion.div
          className="absolute left-1/2 top-[32%] h-[min(55vw,280px)] w-[min(55vw,280px)] -translate-x-1/2 -translate-y-1/2 bg-linear-to-tr from-white/40 via-violet-200/50 to-transparent"
          animate={{
            borderRadius: [
              '50% 50% 50% 50%',
              '55% 45% 48% 52%',
              '48% 52% 55% 45%',
              '50% 50% 50% 50%',
            ],
            rotate: [0, -10, 8, 0],
            scale: [1, 1.12, 1.08, 1],
          }}
          transition={{
            duration: isConnecting ? 3.5 : 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ filter: 'blur(28px)' }}
        />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full border border-white/25 bg-white/10 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-md"
          animate={{
            scale: isConnecting ? [1, 1.08, 1] : [1, 1.03, 1],
            boxShadow: isConnecting
              ? [
                  '0 0 40px rgba(139,92,246,0.25)',
                  '0 0 72px rgba(139,92,246,0.45)',
                  '0 0 40px rgba(139,92,246,0.25)',
                ]
              : [
                  '0 0 50px rgba(139,92,246,0.3)',
                  '0 0 70px rgba(236,72,153,0.25)',
                  '0 0 50px rgba(139,92,246,0.3)',
                ],
          }}
          transition={{ duration: isConnecting ? 1.2 : 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <HiOutlineMicrophone className="size-10 text-white/90" aria-hidden />
        </motion.div>
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-4 pb-8 pt-4 md:px-8">
        <div className="w-full max-w-lg rounded-[1.75rem] border border-white/20 bg-linear-to-b from-white/14 to-white/5 px-5 py-5 shadow-[0_25px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:px-7 md:py-6">
          {isConnecting ? (
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium tracking-wide text-white/90">
                Connecting…
              </p>
              {connectStage ? (
                <p className="text-xs text-white/65">{connectStage}</p>
              ) : null}
              {connectSlow ? (
                <p className="text-xs leading-snug text-amber-200/90">
                  Still waiting — allow microphone access if prompted, or check VPN / network.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Scrollable conversation history */}
          <div ref={scrollRef} className="mt-2 max-h-[40vh] space-y-3 overflow-y-auto pr-1">
            {turns.length === 0 && !isConnecting && !userText.trim() && !assistantText.trim() && (
              <p className="text-center text-sm text-white/55">
                Speak or wait for the assistant…
              </p>
            )}

            {turns.map((turn) => (
              <div key={turn.id}>
                <p className={`mb-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                  turn.role === 'user' ? 'text-amber-200/90' : 'text-violet-200/90'
                }`}>
                  {turn.role === 'user' ? 'You' : 'Stack'}
                </p>
                <p className="text-[15px] leading-relaxed text-white/90">
                  {turn.text}
                </p>
              </div>
            ))}

            {/* Live partial — current user speech */}
            {userText.trim() && !turns.some((t) => t.text === userText.trim()) ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/90">
                  You
                </p>
                <p className="text-[15px] leading-relaxed text-white/95">
                  {userText}
                </p>
              </div>
            ) : null}

            {/* Assistant thinking/speaking indicator — dots while streaming, no partial text */}
            {assistantStreaming ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200/90">
                  Stack
                </p>
                <span className="inline-flex items-center gap-1.5 py-1">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="h-2 w-2 rounded-full bg-violet-300 motion-safe:animate-bounce"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onEnd}
          className="flex items-center gap-2 rounded-full border border-white/25 bg-white/95 px-6 py-3 text-sm font-semibold text-neutral-900 shadow-lg transition hover:bg-white"
        >
          <HiOutlineXMark className="size-4" aria-hidden />
          {isConnecting ? 'Cancel' : 'End voice'}
        </button>
      </div>
    </motion.div>
  )
}
