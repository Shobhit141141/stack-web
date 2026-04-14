import { useEffect, useMemo } from 'react'
import Uppy from '@uppy/core'
import XHRUpload from '@uppy/xhr-upload'
import DashboardModal from '@uppy/react/dashboard-modal'
import { useUploadStore } from '../store/upload-store'
import { getSupabase } from '../lib/supabase'

import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import './upload-modal.css'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export function UploadModal() {
  const { isOpen, close } = useUploadStore()

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

  // attach auth header when modal opens
  useEffect(() => {
    if (!isOpen) return
    const setAuth = async () => {
      const supabase = getSupabase()
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        uppy.getPlugin('XHRUpload')?.setOptions({
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
      }
    }
    setAuth()
  }, [uppy, isOpen])

  // close modal + clear files on completion
  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        uppy.clear()
        close()
      }, 1500)
    }
    uppy.on('complete', handler)
    return () => { uppy.off('complete', handler) }
  }, [uppy, close])

  useEffect(() => {
    return () => uppy.destroy()
  }, [uppy])

  return (
    <DashboardModal
      uppy={uppy}
      open={isOpen}
      onRequestClose={() => { uppy.clear(); close() }}
      proudlyDisplayPoweredByUppy={false}
      note="PDF and DOCX files only, up to 10 MB each"
      theme="light"
    />
  )
}
