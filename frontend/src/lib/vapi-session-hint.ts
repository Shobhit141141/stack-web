// extra system line for live calls — dashboard prompts often say "file contents" only, so models refuse to call the tool for "list file names". this nudges tool use without replacing the whole assistant config.

const STACK_FILE_TOOL_SESSION_HINT =
  'Stack session hint: Any question about which files the user has, file names, uploads, or what is in their workspace is in scope. You must invoke the file-search server tool for those requests and answer only from tool results. Preserve the user intent in tool arguments: keep important keywords, keep workspace constraints, and do not rewrite to generic short queries. If the user says "my workspace", keep that scope and use workspace context from metadata when available. For download/copy/delete/move requests, call stackFileAction directly and do not call apiCalls for those commands. For move, you may pass workspaceName or workspaceId, but if the user did not name a destination, call stackFileAction with action="move" and no workspaceId/workspaceName so the app can show the user a workspace chooser. "Remove from workspace" / "unassign" means pass workspaceId=null — the file stays, only its workspace link is cleared; never treat this as a delete. If the user asks to move a file into a new workspace that does not exist yet (e.g. "move X to a new workspace called Y"), call stackFileAction with action="move", fileId/fileName, and newWorkspaceName=<heard name> — do NOT set confirmNewWorkspace on the first call. The tool will return a confirmation prompt; speak it, then wait for the user to say yes or re-spell the name. Only after the user affirms, call stackFileAction again with the same fileId and newWorkspaceName plus confirmNewWorkspace=true to actually create + move. If the user re-spells the name, use the corrected name and ask for confirmation once more before setting confirmNewWorkspace=true. Do not refuse, and do not tell the user to open the app or check a file list manually instead of using the tool. Responses may end with a machine block between <<<STACK_META>>> and <<<END_STACK_META>>>; never read that block or anything inside it aloud—it is for the app UI only.'

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
