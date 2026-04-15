import { useCallback, useEffect, useRef, useState } from 'react'
import VapiModule from '@vapi-ai/web'

// CJS default export compat — Vite may or may not unwrap it
const Vapi = ('default' in VapiModule ? (VapiModule as any).default : VapiModule) as typeof VapiModule
import { getSupabase } from '../lib/supabase'
import { sendStackFileToolSessionHint } from '../lib/vapi-session-hint'

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string | undefined

export type VapiStatus = 'idle' | 'connecting' | 'active' | 'error'

export function useVapi() {
  const [status, setStatus] = useState<VapiStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [assistantMessage, setAssistantMessage] = useState('')
  const vapiRef = useRef<Vapi | null>(null)

  const configured = Boolean(VAPI_PUBLIC_KEY && VAPI_ASSISTANT_ID)

  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) return

    const vapi = new Vapi(VAPI_PUBLIC_KEY)

    vapi.on('call-start', () => {
      setStatus('active')
      setTranscript('')
      setAssistantMessage('')
      sendStackFileToolSessionHint(vapi)
    })

    vapi.on('call-end', () => {
      setStatus('idle')
    })

    vapi.on('error', () => {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    })

    vapi.on('message', (msg: any) => {
      if (msg.type === 'transcript') {
        if (msg.role === 'user' && msg.transcriptType === 'final') {
          setTranscript(msg.transcript)
        }
        if (msg.role === 'assistant' && msg.transcriptType === 'final') {
          setAssistantMessage(msg.transcript)
        }
      }
    })

    vapiRef.current = vapi

    return () => {
      vapi.stop()
      vapiRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    const vapi = vapiRef.current
    if (!vapi || !VAPI_ASSISTANT_ID) return

    setStatus('connecting')

    // get userId to pass as metadata so the webhook can identify the user
    let userId: string | undefined
    const supabase = getSupabase()
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      userId = session?.user?.id
    }

    try {
      await vapi.start(VAPI_ASSISTANT_ID, {
        metadata: { userId },
      })
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [])

  const stop = useCallback(() => {
    vapiRef.current?.stop()
    setStatus('idle')
  }, [])

  const toggle = useCallback(() => {
    if (status === 'active') {
      stop()
    } else if (status === 'idle') {
      start()
    }
  }, [status, start, stop])

  return { status, transcript, assistantMessage, configured, start, stop, toggle }
}
