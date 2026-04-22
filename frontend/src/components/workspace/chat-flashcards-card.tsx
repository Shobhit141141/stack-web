import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import type { FlashcardsPayload } from '../../services/ask-service'

const CARD_THEMES = [
  {
    surface: 'bg-rose-50',
    border: 'border-rose-200',
    chip: 'bg-rose-700',
    text: 'text-rose-950',
    muted: 'text-rose-700',
    backSurface: 'bg-rose-700',
    backBorder: 'border-rose-800',
    backText: 'text-white',
    backMuted: 'text-rose-100',
  },
  {
    surface: 'bg-sky-50',
    border: 'border-sky-200',
    chip: 'bg-sky-700',
    text: 'text-sky-950',
    muted: 'text-sky-700',
    backSurface: 'bg-sky-700',
    backBorder: 'border-sky-800',
    backText: 'text-white',
    backMuted: 'text-sky-100',
  },
  {
    surface: 'bg-emerald-50',
    border: 'border-emerald-200',
    chip: 'bg-emerald-700',
    text: 'text-emerald-950',
    muted: 'text-emerald-700',
    backSurface: 'bg-emerald-700',
    backBorder: 'border-emerald-800',
    backText: 'text-white',
    backMuted: 'text-emerald-100',
  },
  {
    surface: 'bg-violet-50',
    border: 'border-violet-200',
    chip: 'bg-violet-700',
    text: 'text-violet-950',
    muted: 'text-violet-700',
    backSurface: 'bg-violet-700',
    backBorder: 'border-violet-800',
    backText: 'text-white',
    backMuted: 'text-violet-100',
  },
  {
    surface: 'bg-amber-50',
    border: 'border-amber-200',
    chip: 'bg-amber-700',
    text: 'text-amber-950',
    muted: 'text-amber-700',
    backSurface: 'bg-amber-700',
    backBorder: 'border-amber-800',
    backText: 'text-white',
    backMuted: 'text-amber-100',
  },
] as const

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ChatFlashcardsCard({ deck }: { deck: FlashcardsPayload }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const count = deck.cards.length
  const active = deck.cards[index]
  const stackPreview = useMemo(() => deck.cards.slice(0, 3), [deck.cards])
  const activeTheme = CARD_THEMES[index % CARD_THEMES.length]

  async function downloadZip() {
    if (downloading) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      deck.cards.forEach((card, i) => {
        const serial = String(i + 1).padStart(3, '0')
        const content = `Front:\n${card.front}\n\nBack:\n${card.back}\n`
        zip.file(`${serial}-${card.cardId}.txt`, content)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(`${deck.title.replace(/[^\w\-]+/g, '_') || 'flashcards'}.zip`, blob)
    } finally {
      setDownloading(false)
    }
  }

  function goNext() {
    setIndex((i) => (i + 1) % count)
    setShowBack(false)
  }

  function goPrev() {
    setIndex((i) => (i - 1 + count) % count)
    setShowBack(false)
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, count])

  return (
    <div className="mt-2 mx-auto w-full max-w-120 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{deck.title}</p>
          <p className="text-xs text-neutral-500">{count} flashcards</p>
        </div>
        <button
          type="button"
          onClick={() => void downloadZip()}
          disabled={downloading}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {downloading ? 'Preparing…' : 'Download ZIP'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative mx-auto h-64 w-full max-w-104 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 text-left outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
      >
        {stackPreview.map((c, i) => (
          <div
            key={c.cardId}
            className={`absolute bottom-6 left-1/2 w-[72%] -translate-x-1/2 rounded-xl border px-4 py-4 text-sm shadow-sm ${
              CARD_THEMES[i % CARD_THEMES.length].surface
            } ${CARD_THEMES[i % CARD_THEMES.length].border} ${
              CARD_THEMES[i % CARD_THEMES.length].text
            }`}
            style={{ top: `${20 + i * 10}px` }}
          >
            <span className="line-clamp-3">{c.front}</span>
          </div>
        ))}
        <span className="absolute right-2 bottom-2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
          Open carousel
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">
                Card {index + 1}/{count}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
              >
                Close
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowBack((v) => !v)}
              className="w-full cursor-pointer rounded-xl text-left"
              style={{ perspective: '1200px' }}
            >
              <div
                className="relative min-h-72 w-full"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div
                  className={`absolute inset-0 rounded-xl border px-4 py-6 transition-transform duration-500 ${
                    activeTheme.surface
                  } ${activeTheme.border} ${activeTheme.text}`}
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: showBack ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${activeTheme.muted}`}>
                    Front
                  </p>
                  <p className="text-base leading-relaxed">{active.front}</p>
                </div>
                <div
                  className={`absolute inset-0 rounded-xl border px-4 py-6 transition-transform duration-500 ${
                    activeTheme.backSurface
                  } ${activeTheme.backBorder} ${activeTheme.backText}`}
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: showBack ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                  }}
                >
                  <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${activeTheme.backMuted}`}>
                    Back
                  </p>
                  <p className="text-base leading-relaxed">{active.back}</p>
                </div>
              </div>
            </button>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={goPrev}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setShowBack((v) => !v)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
              >
                {showBack ? 'Show front' : 'Flip card'}
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
