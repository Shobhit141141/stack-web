// extra system line for live calls — dashboard prompts often say "file contents" only, so models refuse to call the tool for "list file names". this nudges tool use without replacing the whole assistant config.

const STACK_FILE_TOOL_SESSION_HINT =
  'Stack session hint: Any question about which files the user has, file names, uploads, or what is in their workspace is in scope. You must invoke the file-search server tool with a short query (for example "list all file names" or "what files are in my workspace"). Answer only from tool results for those facts. Do not refuse, and do not tell the user to open the app or check a file list manually instead of using the tool.'

type VapiSend = { send: (message: unknown) => void }

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
