import { Popover, Select, Theme } from '@radix-ui/themes'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { HiOutlineFolderPlus, HiOutlineXMark } from 'react-icons/hi2'
import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import XHRUpload from '@uppy/xhr-upload'
import { useUploadStore } from '../store/upload-store'
import { useLinkImportWorkspaceStore } from '../store/link-import-workspace-store'
import { getSupabase } from '../lib/supabase'
import { createWorkspace, fetchWorkspaces } from '../services/workspace-service'
import type { WorkspaceItem } from '../services/workspace-service'
import { importFileFromUrl } from '../services/url-ingest-service'

import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import './upload-modal.css'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

function buildFilesEndpoint(workspaceId: string | null): string {
  const base = `${API_BASE}/files`
  if (workspaceId) {
    return `${base}?workspaceId=${encodeURIComponent(workspaceId)}`
  }
  return base
}

/** Radix Select requires a non-empty item value; maps to `null` workspace id */
const WORKSPACE_SELECT_NONE = '__stack_no_workspace__'

export function UploadModal() {
  const { isOpen, close } = useUploadStore()
  const setLinkImportWorkspaceId = useLinkImportWorkspaceStore(
    (s) => s.setLinkImportWorkspaceId,
  )
  const uppyMountRef = useRef<HTMLDivElement>(null)
  const uppyRef = useRef<Uppy | null>(null)
  const closeRef = useRef(close)
  closeRef.current = close

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [createName, setCreateName] = useState('')
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  /** Radix Select needs a `.radix-themes` ancestor; portal mounts on `body` otherwise */
  const [uploadThemeLayerEl, setUploadThemeLayerEl] = useState<HTMLDivElement | null>(null)

  const applyXhrOptions = useCallback(async (workspaceId: string | null) => {
    const uppy = uppyRef.current
    if (!uppy) return
    const supabase = getSupabase()
    const headers: Record<string, string> = {}
    if (supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }
    }
    uppy.getPlugin('XHRUpload')?.setOptions({
      endpoint: buildFilesEndpoint(workspaceId),
      headers,
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetchWorkspaces()
      .then((list) => {
        if (!cancelled) setWorkspaces(list)
      })
      .catch(() => {
        toast.error('Could not load workspaces')
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setCreateWorkspaceOpen(false)
      setCreateName('')
      setLinkUrl('')
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return
    const initial = useUploadStore.getState().defaultWorkspaceId
    setSelectedWorkspaceId(initial)
    setLinkImportWorkspaceId(initial)
    setLinkUrl('')
  }, [isOpen, setLinkImportWorkspaceId])

  useLayoutEffect(() => {
    if (!isOpen) {
      const existing = uppyRef.current
      if (existing) {
        existing.destroy()
        uppyRef.current = null
      }
      return
    }

    const mount = uppyMountRef.current
    if (!mount) return

    const initialWs = useUploadStore.getState().defaultWorkspaceId

    const uppy = new Uppy({
      restrictions: {
        maxFileSize: 10 * 1024 * 1024,
        allowedFileTypes: [
          '.pdf',
          '.docx',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      },
      autoProceed: false,
    })
      .use(XHRUpload, {
        endpoint: buildFilesEndpoint(initialWs),
        fieldName: 'file',
        formData: true,
        bundle: true,
      })
      .use(Dashboard, {
        inline: true,
        target: mount,
        width: '100%',
        height: 420,
        proudlyDisplayPoweredByUppy: false,
        note: 'PDF and Word files. Uploads use the workspace selected above.',
        theme: 'light',
      })

    uppy.on('complete', (result) => {
      const ok = result.successful?.length ?? 0
      const failed = result.failed?.length ?? 0
      if (ok > 0) {
        toast.success(ok === 1 ? '1 file uploaded' : `${ok} files uploaded`)
      }
      if (failed > 0) {
        toast.error(failed === 1 ? '1 file failed to upload' : `${failed} files failed`)
      }
      if (ok > 0 || failed === 0) {
        setTimeout(() => {
          uppy.clear()
          closeRef.current()
        }, 1200)
      }
    })

    uppy.on('upload-error', (_file, err) => {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as Error).message)
          : 'Upload failed'
      toast.error(msg)
    })

    uppyRef.current = uppy
    void applyXhrOptions(initialWs)

    return () => {
      uppy.destroy()
      uppyRef.current = null
    }
  }, [isOpen, applyXhrOptions])

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        uppyRef.current?.cancelAll()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  function handleRequestClose() {
    uppyRef.current?.cancelAll()
    closeRef.current()
  }

  function closeCreateWorkspacePopover() {
    setCreateWorkspaceOpen(false)
    setCreateName('')
  }

  async function handleWorkspaceChange(next: string | null) {
    setSelectedWorkspaceId(next)
    setLinkImportWorkspaceId(next)
    await applyXhrOptions(next)
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault()
    const name = createName.trim()
    if (!name) {
      toast.error('Enter a workspace name')
      return
    }
    setCreateBusy(true)
    try {
      const ws = await createWorkspace(name)
      setWorkspaces((prev) => [ws, ...prev])
      setCreateName('')
      setCreateWorkspaceOpen(false)
      toast.success(`Workspace “${ws.name}” created`)
      await handleWorkspaceChange(ws.id)
    } catch {
      toast.error('Could not create workspace')
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleImportFromUrl(e: React.FormEvent) {
    e.preventDefault()
    const url = linkUrl.trim()
    if (!url) {
      toast.error('Enter a URL')
      return
    }
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        toast.error('URL must start with http:// or https://')
        return
      }
    } catch {
      toast.error('Invalid URL')
      return
    }

    setUrlBusy(true)
    const ws = selectedWorkspaceId ?? undefined
    const promise = importFileFromUrl(url, undefined, ws)
    toast.promise(promise, {
      loading: 'Importing from link…',
      success: (r) => {
        setLinkUrl('')
        closeRef.current()
        return `Saved “${r.fileName}”`
      },
      error: (err) =>
        err instanceof Error ? err.message : 'Could not import from this link',
    })
    try {
      await promise
    } finally {
      setUrlBusy(false)
    }
  }

  return createPortal(
    isOpen ? (
      <Theme accentColor="gray" grayColor="gray" radius="small" appearance="light">
        <div
          ref={setUploadThemeLayerEl}
          className="pointer-events-auto fixed inset-0 z-[2147483000] flex items-center justify-center overflow-visible bg-neutral-950/50 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={handleRequestClose}
        >
        <div
          data-no-link-import
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
          className="flex max-h-[min(92vh,880px)] w-[min(100vw-2rem,46rem)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
            <h2 id="upload-modal-title" className="text-base font-semibold text-neutral-900">
              Upload
            </h2>
            <button
              type="button"
              onClick={handleRequestClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100"
              aria-label="Close upload"
            >
              <HiOutlineXMark className="size-5" aria-hidden />
            </button>
          </div>

          <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-medium text-neutral-600">Workspace</span>
                <div className="flex min-w-0 flex-row items-stretch gap-2">
                  <div className="min-w-0 flex-1">
                    <Select.Root
                      size="2"
                      value={selectedWorkspaceId ?? WORKSPACE_SELECT_NONE}
                      onValueChange={(v) => {
                        void handleWorkspaceChange(v === WORKSPACE_SELECT_NONE ? null : v)
                      }}
                    >
                      <Select.Trigger
                        placeholder="Choose workspace"
                        variant="surface"
                        color="gray"
                        radius="medium"
                        className="w-full min-h-11 justify-between gap-2 px-3 py-2.5 text-left text-sm font-normal"
                        aria-label="Workspace for uploads"
                      />
                      <Select.Content
                        position="popper"
                        sideOffset={6}
                        container={uploadThemeLayerEl ?? undefined}
                        className="hide-scrollbar z-[2147483010] max-h-64 overflow-y-auto"
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

                  <Popover.Root
                    open={createWorkspaceOpen}
                    onOpenChange={(open) => {
                      setCreateWorkspaceOpen(open)
                      if (!open) setCreateName('')
                    }}
                  >
                    <Popover.Trigger
                      title="Create a new workspace"
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white px-2.5 text-xs font-semibold text-neutral-800 shadow-sm transition-colors hover:border-neutral-400 hover:bg-neutral-50 sm:px-3 sm:text-sm"
                    >
                      <span className="inline-flex max-w-full items-center justify-center gap-1.5 sm:gap-2">
                        <HiOutlineFolderPlus className="size-4 shrink-0 text-neutral-500 sm:size-5" aria-hidden />
                        <span className="max-w-[5.5rem] truncate sm:max-w-[10rem]">New workspace</span>
                      </span>
                    </Popover.Trigger>
                    <Popover.Content
                      side="bottom"
                      align="end"
                      sideOffset={6}
                      container={uploadThemeLayerEl ?? undefined}
                      width="280px"
                      className="z-[2147483010]"
                    >
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">Name workspace</p>
                          <p className="mt-0.5 text-xs leading-snug text-neutral-500">
                            Uploads and imports can use this folder.
                          </p>
                        </div>
                        <form
                          className="flex flex-col gap-3"
                          onSubmit={(e) => {
                            void handleCreateWorkspace(e)
                          }}
                        >
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="upload-new-workspace-name" className="sr-only">
                              Workspace name
                            </label>
                            <input
                              id="upload-new-workspace-name"
                              value={createName}
                              onChange={(e) => setCreateName(e.target.value)}
                              placeholder="e.g. Client proposals"
                              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none ring-neutral-900/10 focus:border-neutral-400 focus:ring-2"
                              maxLength={200}
                              autoFocus={createWorkspaceOpen}
                              autoComplete="off"
                            />
                            <p className="text-right text-[11px] text-neutral-400">
                              {createName.length}/200
                            </p>
                          </div>
                          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-2">
                            <button
                              type="button"
                              onClick={closeCreateWorkspacePopover}
                              disabled={createBusy}
                              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 sm:text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={createBusy || !createName.trim()}
                              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 sm:px-4 sm:text-sm"
                            >
                              {createBusy ? 'Creating…' : 'Create'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-2">
                <p className="mb-2 text-xs font-medium text-neutral-600">Import from URL</p>
                <form onSubmit={handleImportFromUrl} className="flex flex-col gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={urlBusy}
                    className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {urlBusy ? 'Importing…' : 'Import link'}
                  </button>
                </form>
              </div>

              <div className="stack-upload-shell border-t border-neutral-100 pt-3">
                <div ref={uppyMountRef} className="min-h-[420px] w-full" />
              </div>
            </div>
          </div>
        </div>
        </div>
      </Theme>
    ) : null,
    document.body,
  )
}
