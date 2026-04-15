import { useCallback, useEffect, useRef, useState } from 'react'
import VapiModule from '@vapi-ai/web'

// CJS default export compat — Vite may or may not unwrap it
const Vapi = ('default' in VapiModule ? (VapiModule as any).default : VapiModule) as typeof VapiModule
import { getSupabase } from '../lib/supabase'
import { sendStackFileToolSessionHint } from '../lib/vapi-session-hint'
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

export function useVapi() {
  const [status, setStatus] = useState<VapiStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [assistantMessage, setAssistantMessage] = useState('')
  const [transcriptLive, setTranscriptLive] = useState('')
  const [assistantLive, setAssistantLive] = useState('')
  const [assistantTokenLive, setAssistantTokenLive] = useState('')
  const [turns, setTurns] = useState<VoiceTurn[]>([])
  const [connectStage, setConnectStage] = useState('')
  const [connectSlow, setConnectSlow] = useState(false)
  const [lastConnectError, setLastConnectError] = useState<string | null>(null)

  const vapiRef = useRef<InstanceType<typeof Vapi> | null>(null)
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
            setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: text.trim() }])
          }
        }
      }

      if (msg.role === 'assistant') {
        if (msg.transcriptType === 'partial') {
          assistantTokenAccRef.current = ''
          setAssistantTokenLive('')
          setAssistantLive(typeof msg.transcript === 'string' ? msg.transcript : '')
        }
        if (msg.transcriptType === 'final') {
          const text = typeof msg.transcript === 'string' ? msg.transcript : ''
          assistantTokenAccRef.current = ''
          setAssistantTokenLive('')
          setAssistantLive('')
          setAssistantMessage(text)
          if (text.trim()) {
            setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: text.trim() }])
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
  }, [VAPI_PUBLIC_KEY, clearConnectTimers])

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
    const supabase = getSupabase()
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      userId = session?.user?.id
    }

    const runStart = async () =>
      vapi.start(
        VAPI_ASSISTANT_ID,
        { metadata: { userId } },
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
  }, [clearConnectTimers])

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
    connectStage,
    connectSlow,
    lastConnectError,
    clearLastConnectError,
    configured,
    start,
    pause,
    stop,
    toggle,
  }
}
