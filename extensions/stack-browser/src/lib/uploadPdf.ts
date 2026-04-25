import { apiBase } from "./config"
import { getSupabase } from "./supabase"

export async function uploadPdfToWorkspace(
  blob: Blob,
  fileName: string,
  workspaceId: string | null,
): Promise<void> {
  const supabase = getSupabase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error("Not signed in")

  const q =
    workspaceId && workspaceId.length > 0
      ? `?workspaceId=${encodeURIComponent(workspaceId)}`
      : ""
  const url = `${apiBase()}/files${q}`

  const fd = new FormData()
  fd.append("file", blob, fileName)

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: fd,
  })
  if (!res.ok) {
    let message = ""
    try {
      const data = (await res.json()) as { error?: string; detail?: string }
      message = data.error || data.detail || ""
    } catch {
      message = await res.text().catch(() => "")
    }
    const clean = message.trim().slice(0, 240)
    throw new Error(clean ? `${res.status}: ${clean}` : `${res.status}: Upload failed`)
  }
}
