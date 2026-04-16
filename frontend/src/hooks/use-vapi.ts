import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import toast from 'react-hot-toast'
import VapiModule from '@vapi-ai/web'

// CJS default export compat — Vite may or may not unwrap it
const Vapi = ('default' in VapiModule ? (VapiModule as any).default : VapiModule) as typeof VapiModule
import { getSupabase } from '../lib/supabase'
import {
  processAssistantVoiceText,
  stripStackMetaFromTranscript,
} from '../lib/stack-voice-meta'
import { sendStackFileToolSessionHint } from '../lib/vapi-session-hint'
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
) {
  if (typeof text !== 'string' || !text.trim()) return
  const { meta } = processAssistantVoiceText(text)
  console.log(`[voice] ${label} parsed meta:`, meta)
  console.log(`[voice] ${label} sources count:`, meta?.sources?.length ?? 0)
  if (meta?.sources?.length) {
    setReferredFiles(meta.sources)
    console.log(`[voice] referredFiles set from ${label}:`, meta.sources)
  }
}

function removeDeletedFileFromRefs(
  text: unknown,
  setReferredFiles: Dispatch<SetStateAction<VoiceReferredFile[]>>,
) {
  if (typeof text !== 'string') return
  const m = text.match(/^Deleted\s+(.+)\.$/i)
  if (!m?.[1]) return
  const deletedName = m[1].trim().toLowerCase()
  setReferredFiles((prev) => prev.filter((f) => f.fileName.toLowerCase() !== deletedName))
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

  const vapiRef = useRef<InstanceType<typeof Vapi> | null>(null)
  const referredFilesRef = useRef<VoiceReferredFile[]>([])

  useEffect(() => {
    referredFilesRef.current = referredFiles
  }, [referredFiles])

  const assistantTokenAccRef = useRef('')
  const sessionAliveRef = useRef(false)
  const connectTimersRef = useRef<{
    slow?: ReturnType<typeof setTimeout>
    hard?: ReturnType<typeof setTimeout>
  }>({})

  const configured = Boolean(VAPI_PUBLIC_KEY && VAPI_ASSISTANT_ID)

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
      toast.success(`Deleted ${fileName}`)
      setReferredFiles((prev) => prev.filter((x) => x.fileId !== fileId))
    } catch {
      toast.error('Could not delete')
    }
  }, [])

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

  const runVoiceFileCommand = useCallback(
    async (utterance: string) => {
      const u = utterance.toLowerCase()
      const files = referredFilesRef.current
      if (files.length === 0) return
      const wantsDl = /\b(download|save)\b/.test(u)
      const wantsCopy = /\b(copy|clipboard)\b/.test(u)
      const wantsDel = /\b(delete|remove|trash)\b/.test(u)
      if (!wantsDl && !wantsCopy && !wantsDel) return

      let file = files[0]!
      if (files.length > 1) {
        const found = files.find((f) =>
          u.includes(f.fileName.toLowerCase()),
        )
        if (!found) {
          toast.error('Say which file name from the list below.')
          return
        }
        file = found
      }

      if (wantsDl) {
        await downloadReferredFile(file.fileId)
        return
      }
      if (wantsCopy) {
        await copyReferredFile(file.fileId)
        return
      }
      if (wantsDel) {
        await deleteReferredFile(file.fileId, file.fileName)
        return
      }
    },
    [copyReferredFile, deleteReferredFile, downloadReferredFile],
  )

  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) return

    const vapi = new Vapi(VAPI_PUBLIC_KEY)

    vapi.on('call-start', () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setLastConnectError(null)
      setStatus('active')
      setTranscript('')
      setAssistantMessage('')
      setTranscriptLive('')
      setAssistantLive('')
      assistantTokenAccRef.current = ''
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
    })

    vapi.on('error', () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    })

    vapi.on('message', (msg: any) => {
      console.log('[voice] raw vapi message', msg)

      // Vapi may deliver tool results separately from assistant transcript.
      // Parse STACK_META from tool_call_result so referenced files always reach UI.
      if (msg?.role === 'tool_call_result' && typeof msg.result === 'string') {
        applyStackMetaFromText(msg.result, setReferredFiles, 'tool_call_result')
        removeDeletedFileFromRefs(msg.result, setReferredFiles)
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
            applyStackMetaFromText(o.result, setReferredFiles, 'conversation-update.tool_call_result')
            removeDeletedFileFromRefs(o.result, setReferredFiles)
            continue
          }
          // OpenAI-style tool message shape
          if (o.role === 'tool') {
            applyStackMetaFromText(o.content, setReferredFiles, 'conversation-update.tool')
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
            void runVoiceFileCommand(trimmed)
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
            if (meta?.clientAction?.type === 'openUrl' && meta.clientAction.url) {
              window.open(meta.clientAction.url, '_blank', 'noopener,noreferrer')
            }
          }
        }
      }
    })

    vapiRef.current = vapi

    return () => {
      clearConnectTimers()
      vapi.stop()
      vapiRef.current = null
    }
  }, [VAPI_PUBLIC_KEY, clearConnectTimers, runVoiceFileCommand])

  const start = useCallback(async () => {
    const vapi = vapiRef.current
    if (!vapi || !VAPI_ASSISTANT_ID) return

    // if session is still alive, just resume (unmute + show overlay)
    if (sessionAliveRef.current) {
      try { vapi.setMuted(false) } catch { /* ignore */ }
      setStatus('active')
      return
    }

    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    setLastConnectError(null)
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

    let userId: string | undefined
    let accessToken: string | undefined
    const supabase = getSupabase()
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
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
        clearConnectTimers()
        setConnectSlow(false)
        setConnectStage('')
        setStatus('error')
        setLastConnectError('Could not start voice. Check mic permission and network, then try again.')
        setTimeout(() => setStatus('idle'), 4000)
      }
    }
  }, [workspaceId, clearConnectTimers])

  // pause: mute mic + hide overlay but keep the Daily room alive
  const pause = useCallback(() => {
    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    const vapi = vapiRef.current
    if (vapi && sessionAliveRef.current) {
      try { vapi.setMuted(true) } catch { /* ignore */ }
    }
    assistantTokenAccRef.current = ''
    setAssistantTokenLive('')
    setStatus('idle')
  }, [clearConnectTimers])

  // hard stop: tear down the session completely
  const stop = useCallback(() => {
    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    vapiRef.current?.stop()
    sessionAliveRef.current = false
    assistantTokenAccRef.current = ''
    setAssistantTokenLive('')
    setReferredFiles([])
    setStatus('idle')
  }, [clearConnectTimers])

  const toggle = useCallback(() => {
    if (status === 'active') {
      pause()
    } else if (status === 'idle' || status === 'error') {
      void start()
    }
  }, [status, start, pause])

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
    start,
    pause,
    stop,
    toggle,
    downloadReferredFile,
    copyReferredFile,
    deleteReferredFile,
  }
}
