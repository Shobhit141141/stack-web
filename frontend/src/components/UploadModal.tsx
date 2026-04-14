import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import XHRUpload from '@uppy/xhr-upload'
import { useUploadStore } from '../store/upload-store'
import { getSupabase } from '../lib/supabase'

import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import './upload-modal.css'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export function UploadModal() {
  const { isOpen, close } = useUploadStore()
  const installedRef = useRef(false)
  const closeRef = useRef(close)
  closeRef.current = close

  const uppy = useMemo(() => {
    return new Uppy({
      restrictions: {
        maxFileSize: 10 * 1024 * 1024,
        allowedFileTypes: ['.pdf', '.docx', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      },
      autoProceed: false,
    }).use(XHRUpload, {
      endpoint: `${API_BASE}/files`,
      fieldName: 'file',
      formData: true,
      bundle: true,
    })
  }, [])

  // install Dashboard plugin as soon as the portal div mounts
  const containerCallback = useCallback((node: HTMLDivElement | null) => {
    if (!node || installedRef.current) return
    uppy.use(Dashboard, {
      inline: false,
      target: node,
      proudlyDisplayPoweredByUppy: false,
      note: 'PDF and DOCX files only, up to 10 MB each',
      theme: 'light',
      closeModalOnClickOutside: true,
      onRequestCloseModal: () => { uppy.clear(); closeRef.current() },
    })
    installedRef.current = true
  }, [uppy])

  // open/close modal based on store state
  useEffect(() => {
    if (!installedRef.current) return
    const dashboard = uppy.getPlugin('Dashboard') as InstanceType<typeof Dashboard> | undefined
    if (!dashboard) return
    if (isOpen) {
      dashboard.openModal()
    } else {
      dashboard.closeModal()
    }
  }, [isOpen, uppy])

  // attach auth header when modal opens
  useEffect(() => {
    if (!isOpen) return
    ;(async () => {
      const supabase = getSupabase()
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        uppy.getPlugin('XHRUpload')?.setOptions({
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
      }
    })()
  }, [uppy, isOpen])

  // close modal + clear files on completion
  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        uppy.clear()
        closeRef.current()
      }, 1500)
    }
    uppy.on('complete', handler)
    return () => { uppy.off('complete', handler) }
  }, [uppy])

  useEffect(() => {
    return () => uppy.destroy()
  }, [uppy])

  return createPortal(
    <div ref={containerCallback} />,
    document.body,
  )
}
