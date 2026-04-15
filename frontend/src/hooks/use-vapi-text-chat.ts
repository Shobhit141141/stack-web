import { useCallback, useEffect, useRef, useState } from 'react'
import VapiModule from '@vapi-ai/web'
import { getSupabase } from '../lib/supabase'
import { sendStackFileToolSessionHint } from '../lib/vapi-session-hint'
import {
  formatVapiConnectStage,
  VAPI_CONNECT_SLOW_HINT_MS,
  VAPI_CONNECT_TIMEOUT_MS,
  VAPI_WEB_CALL_START_OPTIONS,
} from '../lib/vapi-connect-settings'

const Vapi = (
  'default' in VapiModule ? (VapiModule as { default: typeof VapiModule }).default : VapiModule
) as typeof VapiModule

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string | undefined

export type VapiTextChatStatus = 'idle' | 'connecting' | 'connected' | 'error'

export type VapiChatLine = { id: string; role: 'user' | 'assistant'; text: string }

function formatVapiError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e == null) return 'Unknown error'

  if (typeof e === 'object') {
    const o = e as Record<string, unknown>

    const nested = o.error
    if (nested instanceof Error) return nested.message
    if (typeof nested === 'string') return nested
    if (nested && typeof nested === 'object') {
      const ne = nested as Record<string, unknown>
      if (typeof ne.message === 'string') return ne.message
      if (typeof ne.errorMsg === 'string') return ne.errorMsg
      if (typeof ne.error === 'string') return ne.error
    }

    if (typeof o.message === 'string') return o.message
    if (typeof o.errorMsg === 'string') return o.errorMsg

    try {
      const s = JSON.stringify(o)
      return s.length > 500 ? `${s.slice(0, 500)}…` : s
    } catch {
      return 'Something went wrong starting the call'
    }
  }

  return String(e)
}

export function useVapiTextChat(options: { workspaceId?: string }) {
  const workspaceId = options.workspaceId
  const [status, setStatus] = useState<VapiTextChatStatus>('idle')
  const [lines, setLines] = useState<VapiChatLine[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [connectStage, setConnectStage] = useState('')
  const [connectSlow, setConnectSlow] = useState(false)

  const vapiRef = useRef<InstanceType<typeof Vapi> | null>(null)
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

  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) return

    const vapi = new Vapi(VAPI_PUBLIC_KEY)

    vapi.on('call-start', () => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setStatus('connected')
      setLastError(null)
      try {
        vapi.setMuted(true)
      } catch {
        // mic optional for typed-only chat
      }
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
    })

    vapi.on('error', (e: unknown) => {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setStatus('error')
      setLastError(formatVapiError(e))
      setTimeout(() => setStatus('idle'), 4000)
    })

    vapi.on('message', (msg: { type?: string; role?: string; transcriptType?: string; transcript?: string }) => {
      if (msg?.type === 'transcript' && msg.transcriptType === 'final') {
        if (msg.role === 'assistant' && typeof msg.transcript === 'string') {
          const text = msg.transcript.trim()
          if (!text) return
          setLines((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', text },
          ])
        }
      }
    })

    vapiRef.current = vapi

    return () => {
      clearConnectTimers()
      void vapi.stop()
      vapiRef.current = null
    }
  }, [VAPI_PUBLIC_KEY, clearConnectTimers])

  const connect = useCallback(async () => {
    const vapi = vapiRef.current
    if (!vapi || !VAPI_ASSISTANT_ID) return

    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    setLastError(null)
    setStatus('connecting')

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
      setLastError('Connection timed out. Tap Connect again or check mic / network.')
    }, VAPI_CONNECT_TIMEOUT_MS)

    let userId: string | undefined
    const supabase = getSupabase()
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      userId = session?.user?.id
    }

    if (!userId) {
      clearConnectTimers()
      setConnectSlow(false)
      setConnectStage('')
      setStatus('error')
      setLastError('Sign in required — userId is sent to Vapi for file search.')
      setTimeout(() => setStatus('idle'), 4000)
      return
    }

    const meta = {
      userId,
      ...(workspaceId ? { workspaceId } : {}),
    }

    const runStart = async () =>
      vapi.start(
        VAPI_ASSISTANT_ID,
        { metadata: meta },
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
      } catch (e2) {
        clearConnectTimers()
        setConnectSlow(false)
        setConnectStage('')
        setStatus('error')
        setLastError(formatVapiError(e2))
        setTimeout(() => setStatus('idle'), 4000)
      }
    }
  }, [workspaceId, clearConnectTimers])

  const disconnect = useCallback(() => {
    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    void vapiRef.current?.stop()
    setStatus('idle')
  }, [clearConnectTimers])

  const sendText = useCallback(
    (text: string) => {
      const vapi = vapiRef.current
      const trimmed = text.trim()
      if (!vapi || !trimmed || status !== 'connected') return false

      setLines((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text: trimmed },
      ])

      vapi.send({
        type: 'add-message',
        message: { role: 'user', content: trimmed },
        triggerResponseEnabled: true,
      })
      return true
    },
    [status],
  )

  const clearChat = useCallback(() => {
    setLines([])
  }, [])

  return {
    configured,
    status,
    lines,
    lastError,
    connectStage,
    connectSlow,
    connect,
    disconnect,
    sendText,
    clearChat,
  }
}
