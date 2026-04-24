import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { HiOutlineMicrophone, HiOutlineXMark } from 'react-icons/hi2'
import { useLocation } from 'react-router-dom'
import { useVapi } from '../hooks/use-vapi'
import { fetchWorkspaces, type WorkspaceItem } from '../services/workspace-service'
import { VoiceSessionOverlay } from './voice/voice-session-overlay'

function workspaceIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/workspaces\/([^/]+)$/)
  return m?.[1]
}

export function VoiceButton() {
  const { pathname } = useLocation()
  const workspaceId = workspaceIdFromPath(pathname)
  const {
    status,
    transcript,
    assistantMessage,
    transcriptLive,
    assistantLive,
    assistantTokenLive,
    turns,
    referredFiles,
    lastConnectError,
    clearLastConnectError,
    configured,
    voiceOverlayOpen,
    toggle,
    stop,
    downloadReferredFile,
    copyReferredFile,
    deleteReferredFile,
    moveReferredFile,
    renameReferredFile,
  } = useVapi({ workspaceId })

  if (!configured) return null

  const isActive = status === 'active'
  const isConnecting = status === 'connecting'
  const isError = status === 'error'
  const showOverlay = voiceOverlayOpen

  const [overlayWorkspaces, setOverlayWorkspaces] = useState<WorkspaceItem[]>([])
  useEffect(() => {
    if (!showOverlay) return
    let cancelled = false
    void fetchWorkspaces()
      .then((list) => {
        if (!cancelled) setOverlayWorkspaces(list)
      })
      .catch(() => {
        if (!cancelled) setOverlayWorkspaces([])
      })
    return () => {
      cancelled = true
    }
  }, [showOverlay])

  const userText = (transcriptLive || transcript).trim()
  const assistantText = (
    assistantLive ||
    assistantTokenLive ||
    assistantMessage
  ).trim()
  const assistantStreaming = Boolean(
    assistantLive || assistantTokenLive,
  )

  return (
    <>
      <AnimatePresence>
        {showOverlay ? (
          <VoiceSessionOverlay
            key="voice-overlay"
            status={status}
            userText={userText}
            assistantText={assistantText}
            assistantStreaming={assistantStreaming}
            turns={turns}
            referredFiles={referredFiles}
            workspaces={overlayWorkspaces}
            onClose={stop}
            onDownloadFile={downloadReferredFile}
            onCopyFileLink={copyReferredFile}
            onDeleteFile={deleteReferredFile}
            onMoveFile={moveReferredFile}
            onRenameFile={renameReferredFile}
          />
        ) : null}
      </AnimatePresence>

      {!showOverlay ? (
        <div className="fixed bottom-4 right-4 z-80 flex max-w-sm flex-col items-end gap-2 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] sm:bottom-6 sm:right-6">
          {lastConnectError ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-left shadow-lg"
            >
              <p className="flex-1 text-xs text-red-800">{lastConnectError}</p>
              <button
                type="button"
                onClick={clearLastConnectError}
                className="shrink-0 rounded-md p-0.5 text-red-600 hover:bg-red-50"
                aria-label="Dismiss"
              >
                <HiOutlineXMark className="size-4" />
              </button>
            </motion.div>
          ) : null}
          <motion.button
            type="button"
            onClick={() => {
              clearLastConnectError()
              toggle()
            }}
            disabled={false}
            whileTap={{ scale: 0.92 }}
            className={`relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-lg transition-colors ${
              isActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : isError ? 'bg-red-100 text-red-600'
                  : isConnecting
                    ? 'bg-neutral-200 text-neutral-500'
                    : 'bg-neutral-900 text-white hover:bg-neutral-800'
            }`}
            aria-label="Start voice chat"
            title="Ask your files with voice"
          >
            <HiOutlineMicrophone className="size-6" />
            {isConnecting && (
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-neutral-500" />
            )}
          </motion.button>
        </div>
      ) : null}
    </>
  )
}
