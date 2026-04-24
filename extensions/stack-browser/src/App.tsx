import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Select,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes"
import { useCallback, useEffect, useState } from "react"
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
      <Box p="4">
        <Text size="2" color="gray">
          Loading…
        </Text>
      </Box>
    )
  }

  if (error && !userEmail && error.includes("Missing")) {
    return (
      <Box p="4" style={{ maxWidth: 360 }}>
        <Heading size="4" mb="2">
          Stack extension
        </Heading>
        <Text size="2" color="red">
          {error}
        </Text>
        <Text size="1" color="gray" mt="2" style={{ display: "block" }}>
          Copy <code>.env.example</code> to <code>.env</code>, set Supabase + API URLs, then{" "}
          <code>npm run build</code>.
        </Text>
      </Box>
    )
  }

  return (
    <Box p="3" style={{ width: 340 }}>
      <Flex align="center" justify="between" mb="2">
        <Heading size="4">Stack</Heading>
        {userEmail ? (
          <Button size="1" variant="soft" color="gray" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        ) : null}
      </Flex>

      {!userEmail ? (
        <Card>
          <Text size="2" color="gray" mb="3" style={{ display: "block" }}>
            Sign in with the same Google account you use in Stack.
          </Text>
          <Button disabled={authBusy} onClick={() => void onGoogle()} style={{ width: "100%" }}>
            {authBusy ? "Opening…" : "Continue with Google"}
          </Button>
        </Card>
      ) : (
        <>
          <Text size="1" color="gray" mb="3" style={{ display: "block" }}>
            {userEmail}
          </Text>

          <Text size="2" weight="medium" mb="1">
            Workspace
          </Text>
          <Select.Root
            value={selectedWs}
            onValueChange={setSelectedWs}
            disabled={listBusy}
          >
            <Select.Trigger placeholder="Choose workspace" />
            <Select.Content position="popper">
              <Select.Item value={WS_NONE}>Unassigned</Select.Item>
              {workspaces.map((w) => (
                <Select.Item key={w.id} value={w.id}>
                  {w.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          <Separator my="3" size="4" />

          <Text size="2" weight="medium" mb="1">
            New workspace
          </Text>
          <Flex gap="2">
            <TextField.Root
              placeholder="Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button disabled={createBusy || !createName.trim()} onClick={() => void onCreateWorkspace()}>
              Create
            </Button>
          </Flex>

          <Separator my="3" size="4" />

          <Text size="2" color="gray" mb="2" style={{ display: "block", lineHeight: 1.4 }}>
            Saves the <strong>current tab</strong> as a PDF (browser print) and uploads it to the
            workspace above.
          </Text>
          <Button
            disabled={importBusy}
            onClick={() => void onImportPage()}
            style={{ width: "100%" }}
          >
            {importBusy ? "Printing & uploading…" : "Import this page as PDF"}
          </Button>
        </>
      )}

      {message ? (
        <Text size="1" color="green" mt="2" style={{ display: "block" }}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text size="1" color="red" mt="2" style={{ display: "block" }}>
          {error}
        </Text>
      ) : null}
    </Box>
  )
}
