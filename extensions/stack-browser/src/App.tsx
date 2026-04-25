import { Select } from "@radix-ui/themes"
import { useCallback, useEffect, useState } from "react"
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowRightOnRectangle,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
} from "react-icons/hi2"
import { getSupabase } from "./lib/supabase"
import { signInWithGoogle } from "./lib/googleSignIn"
import {
  createWorkspace,
  fetchWorkspaces,
  type WorkspaceItem,
} from "./lib/workspaces"
import { printActiveTabToPdfBlob } from "./lib/printTabToPdf"
import { uploadPdfToWorkspace } from "./lib/uploadPdf"

const WS_NONE = "__stack_ws_none__"

export function App() {
  const [ready, setReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [selectedWs, setSelectedWs] = useState<string>(WS_NONE)
  const [listBusy, setListBusy] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    const supabase = getSupabase()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    setUserEmail(session?.user?.email ?? null)
  }, [])

  useEffect(() => {
    try {
      getSupabase()
      setReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Config error")
    }
  }, [])

  useEffect(() => {
    if (!ready || !userEmail) return
    let cancelled = false
    setListBusy(true)
    void fetchWorkspaces()
      .then((list) => {
        if (!cancelled) setWorkspaces(list)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load workspaces")
      })
      .finally(() => {
        if (!cancelled) setListBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [ready, userEmail])

  useEffect(() => {
    if (!ready) return
    void refreshSession()
    const supabase = getSupabase()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refreshSession()
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [ready, refreshSession])

  async function onGoogle() {
    setAuthBusy(true)
    setError(null)
    setMessage(null)
    try {
      await signInWithGoogle()
      setMessage("Signed in")
      await refreshSession()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed")
    } finally {
      setAuthBusy(false)
    }
  }

  async function onSignOut() {
    setAuthBusy(true)
    setError(null)
    await getSupabase().auth.signOut()
    setUserEmail(null)
    setWorkspaces([])
    setSelectedWs(WS_NONE)
    setAuthBusy(false)
  }

  async function onCreateWorkspace() {
    const name = createName.trim()
    if (!name) return
    setCreateBusy(true)
    setError(null)
    try {
      const ws = await createWorkspace(name)
      setWorkspaces((prev) => [ws, ...prev])
      setSelectedWs(ws.id)
      setCreateName("")
      setMessage(`Workspace “${ws.name}” created`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workspace")
    } finally {
      setCreateBusy(false)
    }
  }

  async function onImportPage() {
    setImportBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { blob, suggestedName } = await printActiveTabToPdfBlob()
      const wid = selectedWs === WS_NONE ? null : selectedWs
      await uploadPdfToWorkspace(blob, suggestedName, wid)
      setMessage(`Uploaded ${suggestedName}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed")
    } finally {
      setImportBusy(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-white px-5 py-6">
        <span className="text-sm text-neutral-500">Loading…</span>
      </div>
    )
  }

  if (error && !userEmail && error.includes("Missing")) {
    return (
      <div className="flex min-w-0 flex-col gap-2 bg-white px-5 py-5">
        <Brand size="sm" />
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <HiOutlineExclamationTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-xs leading-snug text-amber-900">{error}</p>
        </div>
        <p className="text-[11px] leading-snug text-neutral-500">
          Copy <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px]">.env.example</code>{" "}
          to <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px]">.env</code>, set
          Supabase + API URLs, then{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px]">npm run build</code>.
        </p>
      </div>
    )
  }

  if (!userEmail) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-5 bg-white px-5 py-6">
        <Brand size="lg" tagline />
        <p className="text-center text-sm leading-relaxed text-neutral-600">
          Sign in with the same Google account you use in Stack.
        </p>
        <button
          type="button"
          disabled={authBusy}
          onClick={() => void onGoogle()}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <img src="google.svg" alt="" className="size-4 shrink-0" aria-hidden />
          {authBusy ? "Opening…" : "Continue with Google"}
        </button>
        <StatusBanner message={message} error={error} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 bg-white px-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <Brand size="sm" />
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={authBusy}
          title="Sign out"
          aria-label="Sign out"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-60"
        >
          <HiOutlineArrowRightOnRectangle className="size-4" aria-hidden />
        </button>
      </header>

      <p className="-mt-2 truncate text-xs text-neutral-500">{userEmail}</p>

      <section className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-neutral-600">Workspace</label>
        <Select.Root value={selectedWs} onValueChange={setSelectedWs} disabled={listBusy}>
          <Select.Trigger
            placeholder="Choose workspace"
            variant="surface"
            color="gray"
            radius="medium"
            className="w-full min-h-10 justify-between gap-2 px-3 text-left text-sm font-normal"
          />
          <Select.Content position="popper" className="z-2147483010 max-h-64 overflow-y-auto">
            <Select.Item value={WS_NONE}>Unassigned</Select.Item>
            {workspaces.map((w) => (
              <Select.Item key={w.id} value={w.id}>
                {w.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </section>

      <section className="flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
        <label className="text-xs font-medium text-neutral-600" htmlFor="ws-new-name">
          New workspace
        </label>
        <div className="flex min-w-0 gap-2">
          <input
            id="ws-new-name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Name"
            maxLength={120}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none ring-neutral-900/10 transition-colors placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2"
          />
          <button
            type="button"
            disabled={createBusy || !createName.trim()}
            onClick={() => void onCreateWorkspace()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HiOutlinePlus className="size-3.5" aria-hidden />
            {createBusy ? "Creating…" : "Create"}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
        <label className="text-xs font-medium text-neutral-600">Import current page</label>
        <p className="text-xs leading-snug text-neutral-500">
          Saves the <span className="text-neutral-700">current tab</span> as a PDF and uploads it to the
          workspace above.
        </p>
        <button
          type="button"
          disabled={importBusy}
          onClick={() => void onImportPage()}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <HiOutlineArrowDownTray className="size-4" aria-hidden />
          {importBusy ? "Printing & uploading…" : "Import this page as PDF"}
        </button>
      </section>

      <StatusBanner message={message} error={error} />
    </div>
  )
}

function Brand({ size = "sm", tagline = false }: { size?: "sm" | "lg"; tagline?: boolean }) {
  if (size === "lg") {
    return (
      <div className="flex flex-col items-center gap-2" aria-label="Stack — context over storage">
        <div className="flex items-center justify-center gap-1">
          <img src="cloud.svg" alt="" className="size-12 shrink-0" aria-hidden />
          <span className="text-3xl font-medium uppercase leading-none tracking-tight text-neutral-900">
            stack
          </span>
        </div>
        {tagline ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            context over storage
          </span>
        ) : null}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <img src="cloud.svg" alt="" className="size-6 shrink-0" aria-hidden />
      <span className="text-lg font-medium uppercase leading-none tracking-tight text-neutral-900">
        stack
      </span>
    </div>
  )
}

function StatusBanner({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) return null
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <HiOutlineExclamationTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden />
        <span className="text-xs leading-snug text-red-900">{error}</span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <HiOutlineCheckCircle className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
      <span className="text-xs leading-snug text-emerald-900">{message}</span>
    </div>
  )
}
