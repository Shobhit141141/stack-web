import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineArrowsPointingIn,
  HiOutlineArrowsPointingOut,
  HiOutlineChevronLeft,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlassMinus,
  HiOutlineMagnifyingGlassPlus,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { fetchFileSignedUrl } from '../services/file-service'
import { useImageViewerStore } from '../store/image-viewer-store'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.2

function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v))
}

export function ImageViewerModal() {
  const { fileId, fileName, summary, summaryStatus, close } = useImageViewerStore()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [fitMode, setFitMode] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{
    active: boolean
    startX: number
    startY: number
    originX: number
    originY: number
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })

  const summaryText = summary?.trim() ?? ''
  const showSummary = summaryStatus === 'ready' && summaryText.length > 0
  const showPendingSummary = summaryStatus === 'pending'
  const hasSummaryPanel = showSummary || showPendingSummary

  const resetTransforms = useCallback(() => {
    setZoom(1)
    setRotation(0)
    setOffset({ x: 0, y: 0 })
    setFitMode(true)
  }, [])

  useEffect(() => {
    if (!fileId) {
      setUrl(null)
      setError(null)
      return
    }
    setUrl(null)
    setError(null)
    resetTransforms()
    fetchFileSignedUrl(fileId)
      .then(setUrl)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load image'))
  }, [fileId, resetTransforms])

  useEffect(() => {
    setSummaryPanelOpen(hasSummaryPanel)
  }, [fileId, hasSummaryPanel])

  const zoomIn = useCallback(() => {
    setFitMode(false)
    setZoom((z) => clampZoom(z * ZOOM_STEP))
  }, [])

  const zoomOut = useCallback(() => {
    setFitMode(false)
    setZoom((z) => {
      const next = clampZoom(z / ZOOM_STEP)
      if (next <= 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  const fitToScreen = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setFitMode(true)
  }, [])

  const actualSize = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setFitMode(false)
  }, [])

  const rotateLeft = useCallback(() => {
    setRotation((r) => (r - 90) % 360)
  }, [])

  const rotateRight = useCallback(() => {
    setRotation((r) => (r + 90) % 360)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().catch(() => undefined)
    } else {
      void document.exitFullscreen?.().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!fileId) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      switch (e.key) {
        case 'Escape':
          if (document.fullscreenElement) {
            void document.exitFullscreen?.().catch(() => undefined)
          } else {
            close()
          }
          return
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          return
        case '-':
        case '_':
          e.preventDefault()
          zoomOut()
          return
        case '0':
          e.preventDefault()
          fitToScreen()
          return
        case '1':
          e.preventDefault()
          actualSize()
          return
        case '[':
          e.preventDefault()
          rotateLeft()
          return
        case ']':
          e.preventDefault()
          rotateRight()
          return
        case 'r':
        case 'R':
          e.preventDefault()
          resetTransforms()
          return
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          return
        default:
          return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fileId, close, zoomIn, zoomOut, fitToScreen, actualSize, rotateLeft, rotateRight, resetTransforms, toggleFullscreen])

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!url) return
    e.preventDefault()
    setFitMode(false)
    setZoom((z) => {
      const direction = e.deltaY < 0 ? 1 : -1
      const next = clampZoom(z * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
      if (next <= 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const st = dragStateRef.current
    if (!st.active) return
    setOffset({
      x: st.originX + (e.clientX - st.startX),
      y: st.originY + (e.clientY - st.startY),
    })
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragStateRef.current.active = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }

  function handleDoubleClick() {
    if (zoom > 1) {
      fitToScreen()
    } else {
      setFitMode(false)
      setZoom(2)
    }
  }

  const transformStyle = useMemo(() => {
    const fitScale = fitMode ? 1 : undefined
    void fitScale
    return {
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
      transition: dragStateRef.current.active ? 'none' : 'transform 140ms ease-out',
      cursor: zoom > 1 ? (dragStateRef.current.active ? 'grabbing' : 'grab') : 'default',
    } as React.CSSProperties
  }, [zoom, rotation, offset, fitMode])

  const zoomPercent = Math.round(zoom * 100)

  return (
    <AnimatePresence>
      {fileId ? (
        <motion.div
          key="image-modal"
          data-no-link-import
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Text size="3" weight="medium" className="truncate text-neutral-900">
                  {fileName ?? 'Image Viewer'}
                </Text>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <ToolbarButton
                  onClick={zoomOut}
                  disabled={zoom <= MIN_ZOOM}
                  title="Zoom out ( - )"
                  aria-label="Zoom out"
                >
                  <HiOutlineMagnifyingGlassMinus className="size-4" />
                </ToolbarButton>
                <div
                  className="min-w-14 px-2 text-center font-mono text-xs tabular-nums text-neutral-600 select-none"
                  title="Current zoom"
                >
                  {zoomPercent}%
                </div>
                <ToolbarButton
                  onClick={zoomIn}
                  disabled={zoom >= MAX_ZOOM}
                  title="Zoom in ( + )"
                  aria-label="Zoom in"
                >
                  <HiOutlineMagnifyingGlassPlus className="size-4" />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                  onClick={fitToScreen}
                  title="Fit to screen ( 0 )"
                  aria-label="Fit to screen"
                  pressed={fitMode}
                >
                  <HiOutlineArrowsPointingIn className="size-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={actualSize}
                  title="Actual size 1:1 ( 1 )"
                  aria-label="Actual size"
                  pressed={!fitMode && zoom === 1}
                >
                  <span className="text-[11px] font-semibold tracking-tight">1:1</span>
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton onClick={rotateLeft} title="Rotate left ( [ )" aria-label="Rotate left">
                  <HiOutlineArrowUturnLeft className="size-4" />
                </ToolbarButton>
                <ToolbarButton onClick={rotateRight} title="Rotate right ( ] )" aria-label="Rotate right">
                  <HiOutlineArrowUturnRight className="size-4" />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                  onClick={resetTransforms}
                  title="Reset ( R )"
                  aria-label="Reset zoom and rotation"
                >
                  <HiOutlineArrowPath className="size-4" />
                </ToolbarButton>

                {url ? (
                  <a
                    href={url}
                    download={fileName ?? 'image'}
                    title="Download"
                    aria-label="Download image"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    <HiOutlineArrowDownTray className="size-4" />
                  </a>
                ) : null}

                <ToolbarButton
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen ( F )' : 'Fullscreen ( F )'}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  pressed={isFullscreen}
                >
                  <HiOutlineArrowsPointingOut className="size-4" />
                </ToolbarButton>

                {hasSummaryPanel ? (
                  <ToolbarButton
                    onClick={() => setSummaryPanelOpen((s) => !s)}
                    title={summaryPanelOpen ? 'Hide summary' : 'Show summary'}
                    aria-label={summaryPanelOpen ? 'Hide summary' : 'Show summary'}
                    pressed={summaryPanelOpen}
                  >
                    <HiOutlineDocumentText className="size-4" />
                  </ToolbarButton>
                ) : null}

                <ToolbarDivider />

                <ToolbarButton onClick={close} title="Close ( Esc )" aria-label="Close image viewer">
                  <HiOutlineXMark className="size-4" />
                </ToolbarButton>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1">
              {hasSummaryPanel && summaryPanelOpen ? (
                <aside className="relative z-10 flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80">
                  <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
                    <Text size="2" weight="medium" className="text-neutral-800">
                      Summary
                    </Text>
                    <button
                      type="button"
                      onClick={() => setSummaryPanelOpen(false)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100"
                      aria-label="Hide summary panel"
                    >
                      <HiOutlineChevronLeft className="size-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {showSummary ? (
                      <Text size="2" className="whitespace-pre-wrap leading-6 text-neutral-700">
                        {summaryText}
                      </Text>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-neutral-500">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
                        Generating summary…
                      </div>
                    )}
                  </div>
                </aside>
              ) : null}

              {hasSummaryPanel && !summaryPanelOpen ? (
                <button
                  type="button"
                  onClick={() => setSummaryPanelOpen(true)}
                  className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-1 rounded-md bg-black/85 px-2 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-black"
                  aria-label="Show summary panel"
                >
                  <HiOutlineDocumentText className="size-3.5" />
                  Summary
                </button>
              ) : null}

              <div
                className="relative min-h-0 flex-1 overflow-hidden bg-neutral-900/95"
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={handleDoubleClick}
              >
                {!url && !error ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
                  </div>
                ) : null}
                {error ? (
                  <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                    <Text size="2" className="text-red-300">
                      {error}
                    </Text>
                  </div>
                ) : null}
                {url ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <img
                      src={url}
                      alt={fileName ?? 'Image'}
                      draggable={false}
                      style={transformStyle}
                      className={fitMode ? 'max-h-full max-w-full object-contain select-none' : 'select-none'}
                    />
                  </div>
                ) : null}

                <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white/80 shadow-sm">
                  Scroll to zoom · Drag to pan · Dbl-click to toggle · R to reset
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ToolbarButton({
  children,
  onClick,
  title,
  disabled,
  pressed,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  pressed?: boolean
  'aria-label': string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-md border text-neutral-700 transition-colors',
        pressed
          ? 'border-neutral-400 bg-neutral-200'
          : 'border-neutral-200 bg-white hover:bg-neutral-50',
        disabled ? 'cursor-not-allowed opacity-40 hover:bg-white' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-200" />
}
