import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
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
  const [creating, setCreating] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)

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
    const mount = uppyMountRef.current
    if (!mount) return

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
        endpoint: buildFilesEndpoint(null),
        fieldName: 'file',
        formData: true,
        bundle: true,
      })
      .use(Dashboard, {
        inline: false,
        target: mount,
        proudlyDisplayPoweredByUppy: false,
        note: 'Pick a workspace above. Add files here or paste a link in the field above.',
        theme: 'light',
        closeModalOnClickOutside: true,
        onRequestCloseModal: () => {
          uppy.clear()
          closeRef.current()
        },
      })

    uppy.on('complete', (result) => {
      const ok = result.successful.length
      const failed = result.failed.length
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

    return () => {
      uppyRef.current = null
      uppy.destroy()
    }
  }, [])

  useEffect(() => {
    const uppy = uppyRef.current
    if (!uppy) return
    const dashboard = uppy.getPlugin('Dashboard') as InstanceType<typeof Dashboard> | undefined
    if (!dashboard) return
    if (isOpen) {
      const initial = useUploadStore.getState().defaultWorkspaceId
      setSelectedWorkspaceId(initial)
      setLinkUrl('')
      void applyXhrOptions(initial).then(() => {
        dashboard.openModal()
      })
    } else {
      setSelectedWorkspaceId(null)
      setLinkUrl('')
      dashboard.closeModal()
    }
  }, [isOpen, applyXhrOptions])

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
      setCreating(false)
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
    <>
      {isOpen ? (
        <div
          data-no-link-import
          className="pointer-events-auto fixed top-4 left-1/2 z-[2147483000] w-[min(100vw-2rem,26rem)] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
          role="region"
          aria-label="Upload and link import"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="upload-workspace" className="text-xs font-medium text-neutral-600">
                Workspace
              </label>
              <select
                id="upload-workspace"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
                value={selectedWorkspaceId ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  void handleWorkspaceChange(v === '' ? null : v)
                }}
              >
                <option value="">No workspace</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="text-left text-xs font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900"
                >
                  + Create workspace
                </button>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-2">
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Workspace name"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                    maxLength={200}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createBusy}
                      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {createBusy ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false)
                        setCreateName('')
                      }}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
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
          </div>
        </div>
      ) : null}
      <div ref={uppyMountRef} />
    </>,
    document.body,
  )
}
