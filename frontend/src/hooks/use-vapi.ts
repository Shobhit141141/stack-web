import {
  useCallback,
  useEffect,
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
import { emitFilesUpdated, type FilesUpdatedDetail } from '../lib/file-sync-events'
import { deleteFile, downloadFileBlob } from '../services/file-service'
import {
  assignFileToWorkspace,
  createWorkspace,
  fetchWorkspaces,
} from '../services/workspace-service'
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
  /** file's current workspace (null = unassigned). used to hide it from move targets. */
  workspaceId?: string | null
}

export type VoicePendingMove = {
  fileId: string
  fileName: string
  workspaces: Array<{ id: string; name: string }>
}

export type VoicePendingNewWorkspace = {
  fileId: string
  fileName: string
  proposedName: string
}

function dedupeSourcesToReferredFiles(
  sources: NonNullable<StackVoiceMeta['sources']>,
): VoiceReferredFile[] {
  const seen = new Set<string>()
  const out: VoiceReferredFile[] = []
  for (const s of sources) {
    if (!s?.fileId || seen.has(s.fileId)) continue
    seen.add(s.fileId)
    out.push({
      fileId: s.fileId,
      fileName: s.fileName,
      workspaceId: s.workspaceId ?? null,
    })
  }
  return out
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
    setReferredFiles(dedupeSourcesToReferredFiles(meta.sources))
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
  const [pendingMove, setPendingMove] = useState<VoicePendingMove | null>(null)
  const [pendingNewWorkspace, setPendingNewWorkspace] =
    useState<VoicePendingNewWorkspace | null>(null)
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

  const moveReferredFile = useCallback(
    async (
      fileId: string,
      fileName: string,
      targetWorkspaceId: string | null,
      successMessage?: string,
    ) => {
      try {
        await assignFileToWorkspace(fileId, targetWorkspaceId)
        const detail: FilesUpdatedDetail = {
          global: true,
          optimistic: {
            patchFiles: [{ id: fileId, workspaceId: targetWorkspaceId }],
          },
        }
        emitFilesUpdated(detail)
        toast.success(
          successMessage ??
            (targetWorkspaceId === null
              ? `${fileName} is now unassigned`
              : 'File moved'),
        )
        setPendingMove((prev) => (prev?.fileId === fileId ? null : prev))
        setReferredFiles((prev) =>
          prev.map((f) =>
            f.fileId === fileId ? { ...f, workspaceId: targetWorkspaceId } : f,
          ),
        )
        handledClientActionKeysRef.current.delete(`chooseWorkspace:${fileId}`)
      } catch {
        toast.error('Could not move file')
      }
    },
    [],
  )

  const dismissPendingMove = useCallback(() => {
    setPendingMove((prev) => {
      if (prev) {
        handledClientActionKeysRef.current.delete(`chooseWorkspace:${prev.fileId}`)
      }
      return null
    })
  }, [])

  const confirmPendingNewWorkspace = useCallback(
    async (overrideName?: string) => {
      const p = pendingNewWorkspace
      if (!p) return
      const name = (overrideName ?? p.proposedName).trim()
      if (!name) {
        toast.error('Workspace name is required')
        return
      }
      try {
        const list = await fetchWorkspaces()
        const existing = list.find(
          (w) => w.name.toLowerCase() === name.toLowerCase(),
        )
        const ws = existing ?? (await createWorkspace(name))
        await assignFileToWorkspace(p.fileId, ws.id)
        emitFilesUpdated({
          global: true,
          optimistic: {
            patchFiles: [{ id: p.fileId, workspaceId: ws.id }],
          },
        })
        setReferredFiles((prev) =>
          prev.map((f) =>
            f.fileId === p.fileId ? { ...f, workspaceId: ws.id } : f,
          ),
        )
        toast.success(
          existing
            ? `Moved ${p.fileName} to ${ws.name}`
            : `Created ${ws.name} and moved ${p.fileName}`,
        )
        setPendingNewWorkspace(null)
        // clear dedup entries for any proposedName under this file
        const prefix = `confirmNewWorkspace:${p.fileId}:`
        for (const k of Array.from(handledClientActionKeysRef.current)) {
          if (k.startsWith(prefix)) handledClientActionKeysRef.current.delete(k)
        }
      } catch {
        toast.error('Could not create workspace')
      }
    },
    [pendingNewWorkspace],
  )

  const dismissPendingNewWorkspace = useCallback(() => {
    setPendingNewWorkspace((prev) => {
      if (prev) {
        const prefix = `confirmNewWorkspace:${prev.fileId}:`
        for (const k of Array.from(handledClientActionKeysRef.current)) {
          if (k.startsWith(prefix)) handledClientActionKeysRef.current.delete(k)
        }
      }
      return null
    })
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
        setPendingMove(null)
        setPendingNewWorkspace(null)

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

  const ensureVapiReady = useCallback(async () => {
    if (!VAPI_PUBLIC_KEY) {
      throw new Error('Missing VAPI public key')
    }
    if (vapiRef.current) {
      return vapiRef.current
    }
    if (vapiInitPromiseRef.current) {
      await vapiInitPromiseRef.current
      if (vapiRef.current) return vapiRef.current
      throw new Error('Vapi SDK initialized but instance missing')
    }

    const init = (async () => {
      const VapiCtor = await loadVapiSdkClass()
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
      setPendingMove(null)
      setPendingNewWorkspace(null)
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
      setPendingMove(null)
      setPendingNewWorkspace(null)
      setTurns([])
      setReferredFiles([])
      setTranscript('')
      setAssistantMessage('')
      setTranscriptLive('')
      setAssistantLive('')
      handledClientActionKeysRef.current.clear()
      handledDeleteToastKeysRef.current.clear()
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
          return
        }
        if (clientAction.type === 'fileWorkspaceChanged' && clientAction.fileId) {
          const w = clientAction.workspaceId ?? 'null'
          const key = `fileWorkspaceChanged:${clientAction.fileId}:${w}`
          if (handledClientActionKeysRef.current.has(key)) return
          handledClientActionKeysRef.current.add(key)
          setReferredFiles((prev) =>
            prev.map((f) =>
              f.fileId === clientAction.fileId
                ? {
                    ...f,
                    fileName: clientAction.fileName ?? f.fileName,
                    workspaceId: clientAction.workspaceId ?? null,
                  }
                : f,
            ),
          )
          const detail: FilesUpdatedDetail = {
            global: true,
            optimistic: {
              patchFiles: [
                {
                  id: clientAction.fileId,
                  workspaceId: clientAction.workspaceId ?? null,
                },
              ],
            },
          }
          emitFilesUpdated(detail)
          return
        }
        if (
          clientAction.type === 'chooseWorkspace' &&
          clientAction.fileId &&
          clientAction.fileName &&
          Array.isArray(clientAction.workspaces)
        ) {
          const key = `chooseWorkspace:${clientAction.fileId}`
          if (handledClientActionKeysRef.current.has(key)) return
          handledClientActionKeysRef.current.add(key)
          setPendingMove({
            fileId: clientAction.fileId,
            fileName: clientAction.fileName,
            workspaces: clientAction.workspaces.filter(
              (w): w is { id: string; name: string } =>
                !!w && typeof w.id === 'string' && typeof w.name === 'string',
            ),
          })
          return
        }
        if (
          clientAction.type === 'confirmNewWorkspace' &&
          clientAction.fileId &&
          clientAction.fileName &&
          clientAction.proposedName
        ) {
          // include proposedName so a re-spelling by the user surfaces a fresh panel
          const key = `confirmNewWorkspace:${clientAction.fileId}:${clientAction.proposedName.toLowerCase()}`
          if (handledClientActionKeysRef.current.has(key)) return
          handledClientActionKeysRef.current.add(key)
          setPendingNewWorkspace({
            fileId: clientAction.fileId,
            fileName: clientAction.fileName,
            proposedName: clientAction.proposedName,
          })
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
              setReferredFiles(dedupeSourcesToReferredFiles(meta.sources))
              console.log('[voice] referredFiles set:', meta.sources)
            }
            runMetaClientAction(meta)
          }
        }
      }
      })

      vapiRef.current = vapi
      return vapi
    })()

    vapiInitPromiseRef.current = init
    try {
      await init
      if (vapiRef.current) return vapiRef.current
      throw new Error('Vapi instance not available after init')
    } finally {
      // keep resolved promise for reuse; clear only on failure
      if (!vapiRef.current) {
        vapiInitPromiseRef.current = null
      }
    }
  }, [clearConnectTimers, downloadReferredFile, workspaceId])

  useEffect(() => {
    return () => {
      clearConnectTimers()
      const vapi = vapiRef.current
      if (vapi) {
        try {
          void vapi.stop()
        } catch {
          // ignore
        }
      }
      vapiRef.current = null
      vapiInitPromiseRef.current = null
      sessionAliveRef.current = false
    }
  }, [clearConnectTimers])

  const start = useCallback(async () => {
    try {
      await ensureVapiReady()
    } catch (e) {
      console.error('[voice] mic/sdk init failed', e)
      setLastConnectError(
        'Voice failed to initialize. Check your network and try again.',
      )
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

  // hard stop: tear down the session completely and wipe transient UI state so a re-open starts clean
  const stop = useCallback(() => {
    clearConnectTimers()
    setConnectSlow(false)
    setConnectStage('')
    void vapiRef.current?.stop()
    sessionAliveRef.current = false
    assistantTokenAccRef.current = ''
    setAssistantTokenLive('')
    setReferredFiles([])
    setPendingMove(null)
    setPendingNewWorkspace(null)
    setTurns([])
    setTranscript('')
    setAssistantMessage('')
    setTranscriptLive('')
    setAssistantLive('')
    handledClientActionKeysRef.current.clear()
    handledDeleteToastKeysRef.current.clear()
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
    pendingMove,
    pendingNewWorkspace,
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
    moveReferredFile,
    dismissPendingMove,
    confirmPendingNewWorkspace,
    dismissPendingNewWorkspace,
  }
}
