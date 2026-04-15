import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useVapiTextChat } from '../hooks/use-vapi-text-chat'
import { fetchWorkspaces, type WorkspaceItem } from '../services/workspace-service'

// minimal Vapi text chat: starts a web call with metadata (userId, optional workspaceId) for server tools
export function ChatsPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [input, setInput] = useState('')
  const [loadingWs, setLoadingWs] = useState(true)

  const effectiveWorkspaceId = workspaceId || undefined

  const {
    configured,
    status,
    lines,
    lastError,
    connect,
    disconnect,
    sendText,
    clearChat,
  } = useVapiTextChat({ workspaceId: effectiveWorkspaceId })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchWorkspaces()
        if (!cancelled) setWorkspaces(list)
      } catch {
        if (!cancelled) toast.error('Could not load workspaces')
      } finally {
        if (!cancelled) setLoadingWs(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'idle':
        return 'Disconnected'
      case 'connecting':
        return 'Connecting…'
      case 'connected':
        return 'Connected'
      case 'error':
        return 'Error'
      default:
        return status
    }
  }, [status])

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!sendText(input)) {
        if (status !== 'connected') {
          toast.error('Connect to Vapi first')
        }
        return
      }
      setInput('')
    },
    [input, sendText, status],
  )

  return (
    <Flex direction="column" className="mx-auto h-full max-w-2xl gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Vapi chat
        </h1>
        <Text as="p" size="2" color="gray" className="mt-1 max-w-xl leading-relaxed">
          Start a session to send text to your Vapi assistant. Your Supabase{' '}
          <span className="font-medium text-neutral-700">userId</span> and optional{' '}
          <span className="font-medium text-neutral-700">workspace</span> are passed in{' '}
          <span className="font-medium text-neutral-700">metadata</span> so file-search tools can run on the server.
        </Text>
      </div>

      {!configured ? (
        <Text size="2" color="amber">
          Set <code className="rounded bg-neutral-100 px-1">VITE_VAPI_PUBLIC_KEY</code> and{' '}
          <code className="rounded bg-neutral-100 px-1">VITE_VAPI_ASSISTANT_ID</code> in{' '}
          <code className="rounded bg-neutral-100 px-1">.env</code>.
        </Text>
      ) : null}

      <Flex align="center" gap="3" wrap="wrap">
        <Text size="2" weight="medium" color="gray">
          Status: {statusLabel}
        </Text>
        {status === 'connected' ? (
          <Button type="button" size="2" variant="soft" color="gray" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            size="2"
            disabled={!configured || status === 'connecting'}
            onClick={() => void connect()}
          >
            Connect
          </Button>
        )}
        <Button type="button" size="2" variant="outline" color="gray" onClick={() => clearChat()}>
          Clear messages
        </Button>
      </Flex>

      {lastError ? (
        <Text size="2" color="red">
          {lastError}
        </Text>
      ) : null}

      <label className="flex flex-col gap-1">
        <Text size="2" weight="medium" color="gray">
          Workspace scope (optional)
        </Text>
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          disabled={loadingWs || status === 'connected'}
          className="max-w-md rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 disabled:opacity-60"
        >
          <option value="">All files (no workspace filter)</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        {status === 'connected' ? (
          <Text size="1" color="gray">
            Disconnect to change workspace — metadata is set when the call starts.
          </Text>
        ) : null}
      </label>

      <Box className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
        <div className="min-h-[240px] flex-1 space-y-3 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <Text size="2" color="gray">
              No messages yet. Connect, then type below. The mic stays muted for text-only use.
            </Text>
          ) : (
            lines.map((line) => (
              <div
                key={line.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  line.role === 'user'
                    ? 'ml-auto bg-neutral-900 text-white'
                    : 'mr-auto border border-neutral-200 bg-white text-neutral-900'
                }`}
              >
                {line.text}
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className="flex shrink-0 gap-2 border-t border-neutral-200 bg-white p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={status === 'connected' ? 'Message the assistant…' : 'Connect first…'}
            disabled={status !== 'connected'}
            rows={2}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 disabled:opacity-60"
          />
          <Button
            type="submit"
            size="2"
            disabled={status !== 'connected' || !input.trim()}
            className="h-fit shrink-0 self-start"
          >
            Send
          </Button>
        </form>
      </Box>
    </Flex>
  )
}
