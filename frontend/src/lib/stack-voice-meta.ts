// matches backend vapi-stack-meta markers (<<<STACK_META>>> ... <<<END_STACK_META>>>)

export type StackVoiceMeta = {
  sources?: Array<{ fileId: string; fileName: string }>
  clientAction?: {
    type:
      | 'openUrl'
      | 'copyText'
      | 'downloadFile'
      | 'fileWorkspaceChanged'
      | 'fileRenamed'
    url?: string
    text?: string
    fileId?: string
    fileName?: string
    previousWorkspaceId?: string | null
    workspaceId?: string | null
    name?: string
    previousName?: string
  }
}

const STACK_META_BLOCK =
  /\n\n<<<STACK_META>>>\n([\s\S]*?)\n<<<END_STACK_META>>>/

export function stripStackMetaFromTranscript(text: string): string {
  return text.replace(STACK_META_BLOCK, '').trim()
}

export function extractStackMetaFromTranscript(
  text: string,
): StackVoiceMeta | null {
  const m = text.match(STACK_META_BLOCK)
  if (!m?.[1]) return null
  try {
    const raw = m[1].trim()
    const pad = (4 - (raw.length % 4)) % 4
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as StackVoiceMeta
  } catch {
    return null
  }
}

export function processAssistantVoiceText(raw: string): {
  displayText: string
  meta: StackVoiceMeta | null
} {
  const meta = extractStackMetaFromTranscript(raw)
  return {
    displayText: stripStackMetaFromTranscript(raw),
    meta,
  }
}
