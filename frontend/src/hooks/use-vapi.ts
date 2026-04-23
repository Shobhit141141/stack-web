import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import toast from 'react-hot-toast'
import { loadVapiSdkClass } from '../lib/vapi-prefetch'
import { getSupabase } from '../lib/supabase'
import {
  processAssistantVoiceText,
  stripStackMetaFromTranscript,
  type StackVoiceMeta,
} from '../lib/stack-voice-meta'
import { sendStackFileToolSessionHint } from '../lib/vapi-session-hint'
import { emitFilesUpdated } from '../lib/file-sync-events'
import { deleteFile, downloadFileBlob } from '../services/file-service'
import {
  formatVapiConnectStage,
  VAPI_CONNECT_SLOW_HINT_MS,
  VAPI_CONNECT_TIMEOUT_MS,
  VAPI_WEB_CALL_START_OPTIONS,
} from '../lib/vapi-connect-settings'

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string | undefined

export type VapiStatus = 'idle' | 'connecting' | 'active' | 'error'

export type VoiceTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export type VoiceReferredFile = {
  fileId: string
  fileName: string
}

function applyStackMetaFromText(
  text: unknown,
  setReferredFiles: Dispatch<SetStateAction<VoiceReferredFile[]>>,
  label: string,
): StackVoiceMeta | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const { meta } = processAssistantVoiceText(text)
  console.log(`[voice] ${label} parsed meta:`, meta)
  console.log(`[voice] ${label} sources count:`, meta?.sources?.length ?? 0)
  if (meta?.sources?.length) {
    setReferredFiles(meta.sources)
    console.log(`[voice] referredFiles set from ${label}:`, meta.sources)
  }
  return meta
}

function removeDeletedFileFromRefs(
  text: unknown,
  setReferredFiles: Dispatch<SetStateAction<VoiceReferredFile[]>>,
): string | null {
  if (typeof text !== 'string') return null
  const m = text.match(/^Deleted\s+(.+)\.$/i)
  if (!m?.[1]) return null
  const deletedName = m[1].trim().toLowerCase()
  setReferredFiles((prev) => prev.filter((f) => f.fileName.toLowerCase() !== deletedName))
  return m[1].trim()
}

function extractModelOutputChunk(
  output: unknown,
): { mode: 'append' | 'replace'; text: string } | null {
  if (output == null) return null
  if (typeof output === 'string' && output.length > 0) {
    return { mode: 'replace', text: output }
  }
  if (typeof output !== 'object') return null
  const o = output as Record<string, unknown>

  const choices = o.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const c0 = choices[0] as Record<string, unknown>
    const delta = c0.delta as Record<string, unknown> | undefined
    if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
      return { mode: 'append', text: delta.content }
    }
  }

  if (typeof o.delta === 'object' && o.delta !== null) {
    const d = o.delta as Record<string, unknown>
    if (typeof d.content === 'string' && d.content.length > 0) {
      return { mode: 'append', text: d.content }
    }
  }

  if (typeof o.token === 'string' && o.token.length > 0) {
    return { mode: 'append', text: o.token }
  }
  if (typeof o.content === 'string' && o.content.length > 0) {
    return { mode: 'append', text: o.content }
  }
  if (typeof o.text === 'string' && o.text.length > 0) {
    return { mode: 'replace', text: o.text }
  }
  if (typeof o.output === 'string' && o.output.length > 0) {
    return { mode: 'append', text: o.output }
  }

  return null
}

function isTranscriptMessage(msg: { type?: string }): boolean {
  const t = msg.type
  return t === 'transcript' || (typeof t === 'string' && t.startsWith('transcript'))
}

// opens system mic prompt early when allowed (no-op if api missing)
async function primeMicrophonePermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  for (const t of stream.getTracks()) t.stop()
}

export function useVapi(options?: { workspaceId?: string }) {
  const workspaceId = options?.workspaceId
  const [status, setStatus] = useState<VapiStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [assistantMessage, setAssistantMessage] = useState('')
  const [transcriptLive, setTranscriptLive] = useState('')
  const [assistantLive, setAssistantLive] = useState('')
  const [assistantTokenLive, setAssistantTokenLive] = useState('')
  const [turns, setTurns] = useState<VoiceTurn[]>([])
  const [referredFiles, setReferredFiles] = useState<VoiceReferredFile[]>([])
  const [connectStage, setConnectStage] = useState('')
  const [connectSlow, setConnectSlow] = useState(false)
  const [lastConnectError, setLastConnectError] = useState<string | null>(null)
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false)
  const voiceOverlayOpenRef = useRef(false)

  const vapiRef = useRef<{
    start: (...args: unknown[]) => Promise<void>
    stop: () => Promise<void> | void
    setMuted: (muted: boolean) => void
    send: (message: unknown) => void
    on: (event: string, handler: (...args: unknown[]) => void) => void
  } | null>(null)
  const vapiInitPromiseRef = useRef<Promise<unknown> | null>(null)

  const assistantTokenAccRef = useRef('')
  const sessionAliveRef = useRef(false)
  const handledClientActionKeysRef = useRef<Set<string>>(new Set())
  const handledDeleteToastKeysRef = useRef<Set<string>>(new Set())
  const connectTimersRef = useRef<{
    slow?: ReturnType<typeof setTimeout>
    hard?: ReturnType<typeof setTimeout>
  }>({})
  const establishPromiseRef = useRef<Promise<void> | null>(null)

  const configured = Boolean(VAPI_PUBLIC_KEY && VAPI_ASSISTANT_ID)

  useEffect(() => {
    voiceOverlayOpenRef.current = voiceOverlayOpen
  }, [voiceOverlayOpen])

  const clearConnectTimers = useCallback(() => {
    const t = connectTimersRef.current
    if (t.slow) clearTimeout(t.slow)
    if (t.hard) clearTimeout(t.hard)
    connectTimersRef.current = {}
  }, [])

  const clearLastConnectError = useCallback(() => {
    setLastConnectError(null)
  }, [])

  const downloadReferredFile = useCallback(async (fileId: string) => {
    try {
      const { blob, fileName } = await downloadFileBlob(fileId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName ?? 'file'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Download started')
    } catch {
      toast.error('Could not download')
    }
  }, [])

  const deleteReferredFile = useCallback(async (fileId: string, fileName: string) => {
    try {
      await deleteFile(fileId)
      emitFilesUpdated({ workspaceId: workspaceId ?? null })
      toast.success(`Deleted ${fileName}`)
      setReferredFiles((prev) => prev.filter((x) => x.fileId !== fileId))
    } catch {
      toast.error('Could not delete')
    }
  }, [workspaceId])

  const copyReferredFile = useCallback(async (fileId: string) => {
    try {
      const { blob } = await downloadFileBlob(fileId)
      const url = URL.createObjectURL(blob)
      await navigator.clipboard.writeText(url)
      toast.success('Copied file link')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('Could not copy link')
    }
  }, [])

  // full vapi.start + retries; deduped; used by background warm and by start()
  const establishVapiSession = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background === true
    if (sessionAliveRef.current) return
    if (establishPromiseRef.current) {
      await establishPromiseRef.current
      return
    }

    const vapi = vapiRef.current
    if (!vapi || !VAPI_ASSISTANT_ID) return

    const run = (async () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setLastConnectError(null)
      if (!background) {
        setStatus('connecting')
        setTurns([])
        setReferredFiles([])

        connectTimersRef.current.slow = setTimeout(
          () => setConnectSlow(true),
          VAPI_CONNECT_SLOW_HINT_MS,
        )
        connectTimersRef.current.hard = setTimeout(() => {
          clearConnectTimers()
          setConnectSlow(false)
          setConnectStage('')
          void vapi.stop()
          setStatus('idle')
          setLastConnectError('Connection timed out. Tap the mic to try again.')
        }, VAPI_CONNECT_TIMEOUT_MS)
      }

      let userId: string | undefined
      let accessToken: string | undefined
      const supabase = getSupabase()
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        userId = session?.user?.id
        accessToken = session?.access_token
      }

      const runStart = async () =>
        vapi.start(
          VAPI_ASSISTANT_ID,
          {
            metadata: {
              ...(userId ? { userId } : {}),
              ...(workspaceId ? { workspaceId } : {}),
              ...(accessToken ? { accessToken } : {}),
            },
          },
          undefined,
          undefined,
          undefined,
          { ...VAPI_WEB_CALL_START_OPTIONS },
        )

      try {
        await runStart()
      } catch {
        try {
          await vapi.stop()
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 700))
        try {
          await runStart()
        } catch {
          if (!background) {
            clearConnectTimers()
            setConnectSlow(false)
            setConnectStage('')
            setStatus('error')
            setLastConnectError(
              'Could not start voice. Check mic permission and network, then try again.',
            )
            setTimeout(() => setStatus('idle'), 4000)
          }
        }
      }
    })()

    establishPromiseRef.current = run
    try {
      await run
    } finally {
      establishPromiseRef.current = null
    }
  }, [workspaceId, clearConnectTimers])

  // mic prompt + join daily room in background so first tap is mostly unmute + ui
  useEffect(() => {
    if (!configured) return
    let cancelled = false

    void primeMicrophonePermission().catch(() => {
      if (!cancelled) {
        toast.error(
          'Voice needs microphone access. Allow the prompt or enable the mic for this site in browser settings.',
        )
      }
    })

    void (async () => {
      try {
        await vapiInitPromiseRef.current
      } catch {
        return
      }
      if (cancelled) return
      try {
        await establishVapiSession({ background: true })
      } catch (e) {
        console.error('[voice] background session failed', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [configured, workspaceId, establishVapiSession])

  useLayoutEffect(() => {
    if (!VAPI_PUBLIC_KEY) return
    let cancelled = false
    let instanceWeOwn: (typeof vapiRef)['current'] = null

    const init = (async () => {
      const VapiCtor = await loadVapiSdkClass()
      if (cancelled) return
      const vapi = new VapiCtor(VAPI_PUBLIC_KEY)

      vapi.on('call-start', () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setLastConnectError(null)
      if (!voiceOverlayOpenRef.current) {
        try {
          vapi.setMuted(true)
        } catch {
          // ignore
        }
        setStatus('idle')
      } else {
        setStatus('active')
      }
      setTranscript('')
      setAssistantMessage('')
      setTranscriptLive('')
      setAssistantLive('')
      assistantTokenAccRef.current = ''
      handledClientActionKeysRef.current.clear()
      handledDeleteToastKeysRef.current.clear()
      setAssistantTokenLive('')
      sessionAliveRef.current = true
      setReferredFiles([])
      sendStackFileToolSessionHint(vapi)
      })

      vapi.on('call-start-progress', (e: { stage?: string; status?: string }) => {
      if (e?.status === 'started' && typeof e.stage === 'string') {
        setConnectStage(formatVapiConnectStage(e.stage))
      }
      })

      vapi.on('call-end', () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setStatus('idle')
      assistantTokenAccRef.current = ''
      setAssistantTokenLive('')
      sessionAliveRef.current = false
      setVoiceOverlayOpen(false)
      })

      vapi.on('error', () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
      })

      vapi.on('message', (msg: any) => {
      if (!voiceOverlayOpenRef.current) return
      console.log('[voice] raw vapi message', msg)

      const runMetaClientAction = (meta: StackVoiceMeta | null) => {
        const clientAction = meta?.clientAction
        if (!clientAction) return
        if (clientAction.type === 'downloadFile' && clientAction.fileId) {
          const key = `downloadFile:${clientAction.fileId}`
          if (handledClientActionKeysRef.current.has(key)) return
          handledClientActionKeysRef.current.add(key)
          void downloadReferredFile(clientAction.fileId)
          return
        }
        if (clientAction.type === 'openUrl' && clientAction.url) {
          const key = `openUrl:${clientAction.url}`
          if (handledClientActionKeysRef.current.has(key)) return
          handledClientActionKeysRef.current.add(key)
          window.open(clientAction.url, '_blank', 'noopener,noreferrer')
          return
        }
        if (clientAction.type === 'copyText' && clientAction.text) {
          const textToCopy = clientAction.text
          const fileNameForToast = clientAction.fileName
          const key = `copyText:${textToCopy}`
          if (handledClientActionKeysRef.current.has(key)) return
          handledClientActionKeysRef.current.add(key)
          void navigator.clipboard
            .writeText(textToCopy)
            .then(() =>
              toast.success(
                `Copied link${fileNameForToast ? ` for ${fileNameForToast}` : ''}`,
              ),
            )
            .catch(() => toast.error('Could not copy link'))
        }
      }

      // Vapi may deliver tool results separately from assistant transcript.
      // Parse STACK_META from tool_call_result so referenced files always reach UI.
      if (msg?.role === 'tool_call_result' && typeof msg.result === 'string') {
        const meta = applyStackMetaFromText(msg.result, setReferredFiles, 'tool_call_result')
        runMetaClientAction(meta)
        const deletedName = removeDeletedFileFromRefs(msg.result, setReferredFiles)
        if (deletedName) {
          const key = deletedName.toLowerCase()
          if (!handledDeleteToastKeysRef.current.has(key)) {
            handledDeleteToastKeysRef.current.add(key)
            toast.success(`Deleted ${deletedName}`)
          }
          // sync file list, workspace UI, and storage summary across the app
          emitFilesUpdated({ workspaceId: workspaceId ?? null })
        }
      }

      // Some Vapi transports emit finalized tool outputs in conversation-update payloads.
      if (msg?.type === 'conversation-update') {
        const candidates: unknown[] = []
        if (Array.isArray(msg.messages)) candidates.push(...msg.messages)
        if (Array.isArray(msg.conversation)) candidates.push(...msg.conversation)
        for (const item of candidates) {
          if (!item || typeof item !== 'object') continue
          const o = item as Record<string, unknown>
          if (o.role === 'tool_call_result') {
            const meta = applyStackMetaFromText(o.result, setReferredFiles, 'conversation-update.tool_call_result')
            runMetaClientAction(meta)
            const deletedName = removeDeletedFileFromRefs(o.result, setReferredFiles)
            if (deletedName) {
              const key = deletedName.toLowerCase()
              if (!handledDeleteToastKeysRef.current.has(key)) {
                handledDeleteToastKeysRef.current.add(key)
                toast.success(`Deleted ${deletedName}`)
              }
              // sync file list, workspace UI, and storage summary
              emitFilesUpdated({ workspaceId: workspaceId ?? null })
            }
            continue
          }
          // OpenAI-style tool message shape
          if (o.role === 'tool') {
            const meta = applyStackMetaFromText(o.content, setReferredFiles, 'conversation-update.tool')
            runMetaClientAction(meta)
          }
        }
      }

      if (msg?.type === 'model-output' && msg.output != null) {
        const chunk = extractModelOutputChunk(msg.output)
        if (chunk) {
          if (chunk.mode === 'replace') {
            assistantTokenAccRef.current = chunk.text
          } else {
            assistantTokenAccRef.current += chunk.text
          }
          setAssistantTokenLive(assistantTokenAccRef.current)
        }
        return
      }

      if (!isTranscriptMessage(msg)) return

      if (msg.role === 'user') {
        if (msg.transcriptType === 'partial') {
          setTranscriptLive(typeof msg.transcript === 'string' ? msg.transcript : '')
        }
        if (msg.transcriptType === 'final') {
          const text = typeof msg.transcript === 'string' ? msg.transcript : ''
          assistantTokenAccRef.current = ''
          setAssistantTokenLive('')
          setTranscriptLive('')
          setAssistantLive('')
          setTranscript(text)
          if (text.trim()) {
            const trimmed = text.trim()
            setTurns((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: 'user', text: trimmed },
            ])
          }
        }
      }

      if (msg.role === 'assistant') {
        if (msg.transcriptType === 'partial') {
          assistantTokenAccRef.current = ''
          setAssistantTokenLive('')
          const raw = typeof msg.transcript === 'string' ? msg.transcript : ''
          setAssistantLive(stripStackMetaFromTranscript(raw))
        }
        if (msg.transcriptType === 'final') {
          const text = typeof msg.transcript === 'string' ? msg.transcript : ''
          assistantTokenAccRef.current = ''
          setAssistantTokenLive('')
          setAssistantLive('')
          setAssistantMessage(text)
          if (text.trim()) {
            const { displayText, meta } = processAssistantVoiceText(text.trim())
            console.log('[voice] assistant final raw:', text)
            console.log('[voice] parsed stack meta:', meta)
            console.log('[voice] sources count:', meta?.sources?.length ?? 0)
            setTurns((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: 'assistant', text: displayText },
            ])
            if (meta?.sources?.length) {
              setReferredFiles(meta.sources)
              console.log('[voice] referredFiles set:', meta.sources)
            }
            runMetaClientAction(meta)
          }
        }
      }
      })

      if (cancelled) {
        try {
          void vapi.stop()
        } catch {
          // ignore
        }
        return
      }
      instanceWeOwn = vapi
      vapiRef.current = vapi
    })()

    vapiInitPromiseRef.current = init

    return () => {
      cancelled = true
      clearConnectTimers()
      void init.finally(() => {
        const owned = instanceWeOwn
        if (owned && vapiRef.current === owned) {
          try {
            void owned.stop()
          } catch {
            // ignore
          }
          vapiRef.current = null
        }
      })
    }
  }, [VAPI_PUBLIC_KEY, clearConnectTimers, downloadReferredFile])

  const start = useCallback(async () => {
    try {
      await vapiInitPromiseRef.current
    } catch (e) {
      console.error('[voice] sdk init failed', e)
      setLastConnectError('Voice failed to load. Check your network and refresh.')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
      return
    }
    const vapi = vapiRef.current
    if (!VAPI_ASSISTANT_ID) return
    if (!vapi) {
      console.warn('[voice] vapiRef empty after init — possible StrictMode race; retry')
      toast.error('Voice is still starting. Tap again in a moment.')
      return
    }

    if (sessionAliveRef.current) {
      try {
        vapi.setMuted(false)
      } catch {
        /* ignore */
      }
      setStatus('active')
      return
    }

    await establishVapiSession({ background: false })
  }, [establishVapiSession])

  // pause: mute mic + hide overlay but keep the Daily room alive
  const pause = useCallback(() => {
    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    const vapi = vapiRef.current
    if (vapi && sessionAliveRef.current) {
      try {
        vapi.setMuted(true)
      } catch {
        /* ignore */
      }
    }
    assistantTokenAccRef.current = ''
    setAssistantTokenLive('')
    setStatus('idle')
    setVoiceOverlayOpen(false)
  }, [clearConnectTimers])

  // hard stop: tear down the session completely
  const stop = useCallback(() => {
    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    void vapiRef.current?.stop()
    sessionAliveRef.current = false
    assistantTokenAccRef.current = ''
    setAssistantTokenLive('')
    setReferredFiles([])
    setStatus('idle')
    setVoiceOverlayOpen(false)
  }, [clearConnectTimers])

  const toggle = useCallback(() => {
    if (voiceOverlayOpen && status === 'active') {
      pause()
      return
    }
    setVoiceOverlayOpen(true)
    void start()
  }, [voiceOverlayOpen, status, start, pause])

  return {
    status,
    transcript,
    assistantMessage,
    transcriptLive,
    assistantLive,
    assistantTokenLive,
    turns,
    referredFiles,
    connectStage,
    connectSlow,
    lastConnectError,
    clearLastConnectError,
    configured,
    voiceOverlayOpen,
    setVoiceOverlayOpen,
    start,
    pause,
    stop,
    toggle,
    downloadReferredFile,
    copyReferredFile,
    deleteReferredFile,
  }
}
