import { useCallback, useEffect, useRef, useState } from 'react'
import VapiModule from '@vapi-ai/web'
import { getSupabase } from '../lib/supabase'
import { sendStackFileToolSessionHint } from '../lib/vapi-session-hint'

// CJS default export compat — Vite may or may not unwrap it
const Vapi = (
  'default' in VapiModule ? (VapiModule as { default: typeof VapiModule }).default : VapiModule
) as typeof VapiModule

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string | undefined

export type VapiTextChatStatus = 'idle' | 'connecting' | 'connected' | 'error'

export type VapiChatLine = { id: string; role: 'user' | 'assistant'; text: string }

// turns Vapi / Daily error payloads into readable text (never "[object Object]")
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

// text chat over Vapi web call; passes userId (+ optional workspaceId) via assistantOverrides.metadata so tool webhooks receive them
export function useVapiTextChat(options: { workspaceId?: string }) {
  const workspaceId = options.workspaceId
  const [status, setStatus] = useState<VapiTextChatStatus>('idle')
  const [lines, setLines] = useState<VapiChatLine[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const vapiRef = useRef<InstanceType<typeof Vapi> | null>(null)

  const configured = Boolean(VAPI_PUBLIC_KEY && VAPI_ASSISTANT_ID)

  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) return

    const vapi = new Vapi(VAPI_PUBLIC_KEY)

    vapi.on('call-start', () => {
      setStatus('connected')
      setLastError(null)
      try {
        vapi.setMuted(true)
      } catch {
        // mic optional for typed-only chat
      }
      sendStackFileToolSessionHint(vapi)
    })

    vapi.on('call-end', () => {
      setStatus('idle')
    })

    vapi.on('error', (e: unknown) => {
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
      void vapi.stop()
      vapiRef.current = null
    }
  }, [])

  const connect = useCallback(async () => {
    const vapi = vapiRef.current
    if (!vapi || !VAPI_ASSISTANT_ID) return

    setStatus('connecting')
    setLastError(null)

    let userId: string | undefined
    const supabase = getSupabase()
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      userId = session?.user?.id
    }

    if (!userId) {
      setStatus('error')
      setLastError('Sign in required — userId is sent to Vapi for file search.')
      setTimeout(() => setStatus('idle'), 4000)
      return
    }

    try {
      await vapi.start(VAPI_ASSISTANT_ID, {
        metadata: {
          userId,
          ...(workspaceId ? { workspaceId } : {}),
        },
      })
    } catch (e) {
      setStatus('error')
      setLastError(formatVapiError(e))
      setTimeout(() => setStatus('idle'), 4000)
    }
  }, [workspaceId])

  const disconnect = useCallback(() => {
    void vapiRef.current?.stop()
    setStatus('idle')
  }, [])

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
    connect,
    disconnect,
    sendText,
    clearChat,
  }
}
