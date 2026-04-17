import { Button, Dialog, Select, Theme } from '@radix-ui/themes'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { emitFilesUpdated } from '../lib/file-sync-events'
import { importFileFromUrl } from '../services/url-ingest-service'
import { useLinkImportWorkspaceStore } from '../store/link-import-workspace-store'
import { fetchWorkspaces } from '../services/workspace-service'
import type { WorkspaceItem } from '../services/workspace-service'

/** Radix Select requires a non-empty item value; maps to `null` workspace id */
const WORKSPACE_SELECT_NONE = '__stack_no_workspace__'

/** returns normalized http(s) URL or null */
function normalizePastedUrl(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, '')
  if (t.length < 12 || t.length > 2048) return null
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

// skips only zones that need native paste (modals, sidebar, embeds)
function shouldSkipGlobalLinkPaste(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false
  if (target.closest('[data-no-link-import]')) return true
  const el = target as HTMLElement
  if (el.isContentEditable) return true
  return false
}

function truncateUrl(url: string, max = 72): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

export function GlobalLinkPaste() {
  const importingRef = useRef(false)
  const dialogBlockingRef = useRef(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [themeLayerEl, setThemeLayerEl] = useState<HTMLDivElement | null>(null)

  const setLinkImportWorkspaceId = useLinkImportWorkspaceStore(
    (s) => s.setLinkImportWorkspaceId,
  )

  const closeDialog = useCallback(() => {
    dialogBlockingRef.current = false
    setDialogOpen(false)
    setPendingUrl(null)
  }, [])

  const loadWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true)
    try {
      const list = await fetchWorkspaces()
      setWorkspaces(list)
    } catch {
      toast.error('Could not load workspaces')
      setWorkspaces([])
    } finally {
      setWorkspacesLoading(false)
    }
  }, [])

  const runImport = useCallback((url: string, workspaceId: string | undefined) => {
    importingRef.current = true
    const promise = importFileFromUrl(url, undefined, workspaceId)
    toast.promise(promise, {
      loading: 'Importing from link…',
      success: (r) => `Saved “${r.fileName}”`,
      error: (err) =>
        err instanceof Error ? err.message : 'Could not import from this link',
    })
    void promise
      .then(() => {
        emitFilesUpdated({ workspaceId: workspaceId ?? null })
      })
      .finally(() => {
        importingRef.current = false
      })
    return promise
  }, [])

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      if (importingRef.current) return
      if (dialogBlockingRef.current) return
      if (shouldSkipGlobalLinkPaste(e.target)) return

      const text = e.clipboardData?.getData('text/plain')
      if (!text) return

      const url = normalizePastedUrl(text)
      if (!url) return

      const storedWorkspaceId = useLinkImportWorkspaceStore.getState().linkImportWorkspaceId

      e.preventDefault()
      e.stopPropagation()

      if (storedWorkspaceId) {
        void runImport(url, storedWorkspaceId)
        return
      }

      dialogBlockingRef.current = true
      setSelectedWorkspaceId(null)
      setPendingUrl(url)
      setDialogOpen(true)
      void loadWorkspaces()
    },
    [loadWorkspaces, runImport],
  )

  useEffect(() => {
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [onPaste])

  const onConfirmImport = useCallback(() => {
    if (!pendingUrl) return
    const url = pendingUrl
    const ws = selectedWorkspaceId ?? undefined
    setLinkImportWorkspaceId(selectedWorkspaceId)
    closeDialog()
    void runImport(url, ws)
  }, [pendingUrl, selectedWorkspaceId, setLinkImportWorkspaceId, closeDialog, runImport])

  return (
    <Theme accentColor="gray" grayColor="gray" radius="small" appearance="light">
      <Dialog.Root
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) closeDialog()
          }}
        >
          <Dialog.Content
            size="2"
            style={{ maxWidth: 440 }}
            className="z-[2147483000]"
            data-no-link-import
          >
            <div ref={setThemeLayerEl}>
              <Dialog.Title>Import pasted link</Dialog.Title>
              <Dialog.Description size="2" color="gray" mb="3">
                {pendingUrl ? (
                  <>
                    Choose a workspace for this file.{' '}
                    <span className="mt-1 block break-all font-mono text-[11px] text-neutral-700">
                      {truncateUrl(pendingUrl)}
                    </span>
                  </>
                ) : null}
              </Dialog.Description>

              <div className="mb-4 flex flex-col gap-2">
                <span className="text-xs font-medium text-neutral-600">Workspace</span>
                <Select.Root
                  size="2"
                  value={selectedWorkspaceId ?? WORKSPACE_SELECT_NONE}
                  onValueChange={(v) => {
                    setSelectedWorkspaceId(v === WORKSPACE_SELECT_NONE ? null : v)
                  }}
                  disabled={workspacesLoading}
                >
                  <Select.Trigger
                    placeholder="Choose workspace"
                    variant="surface"
                    color="gray"
                    radius="medium"
                    className="w-full min-h-11 justify-between gap-2 px-3 py-2.5 text-left text-sm font-normal"
                    aria-label="Workspace for link import"
                  />
                  <Select.Content
                    position="popper"
                    sideOffset={6}
                    container={themeLayerEl ?? undefined}
                    className="z-[2147483010] max-h-64 overflow-y-auto"
                  >
                    <Select.Item value={WORKSPACE_SELECT_NONE}>No workspace</Select.Item>
                    {workspaces.map((w) => (
                      <Select.Item key={w.id} value={w.id}>
                        {w.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </div>

              <div className="flex justify-end gap-2">
                <Dialog.Close>
                  <Button type="button" variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  variant="solid"
                  color="gray"
                  highContrast
                  disabled={!pendingUrl || workspacesLoading}
                  onClick={onConfirmImport}
                >
                  Import
                </Button>
              </div>
            </div>
          </Dialog.Content>
      </Dialog.Root>
    </Theme>
  )
}
