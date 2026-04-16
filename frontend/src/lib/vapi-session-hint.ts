// extra system line for live calls — dashboard prompts often say "file contents" only, so models refuse to call the tool for "list file names". this nudges tool use without replacing the whole assistant config.

const STACK_FILE_TOOL_SESSION_HINT =
  'Stack session hint: Any question about which files the user has, file names, uploads, or what is in their workspace is in scope. You must invoke the file-search server tool for those requests and answer only from tool results. Preserve the user intent in tool arguments: keep important keywords, keep workspace constraints, and do not rewrite to generic short queries. If the user says "my workspace", keep that scope and use workspace context from metadata when available. Do not refuse, and do not tell the user to open the app or check a file list manually instead of using the tool. When the user asks to download, delete, or move a file, call the stackFileAction tool with action download, delete, or move and fileName or fileId when known. Responses may end with a machine block between <<<STACK_META>>> and <<<END_STACK_META>>>; never read that block or anything inside it aloud—it is for the app UI only.'

// narrow message shape so Vapi.send (union param) is assignable here (contravariance)
type StackFileToolSessionHintMessage = {
  type: 'add-message'
  message: { role: 'system'; content: string }
  triggerResponseEnabled: boolean
}

type VapiSend = { send: (message: StackFileToolSessionHintMessage) => void }

// call once per call-start; triggerResponseEnabled false so the model does not speak immediately
export function sendStackFileToolSessionHint(vapi: VapiSend): void {
  try {
    vapi.send({
      type: 'add-message',
      message: { role: 'system', content: STACK_FILE_TOOL_SESSION_HINT },
      triggerResponseEnabled: false,
    })
  } catch {
    // ignore
  }
}
