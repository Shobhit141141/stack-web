import { useMemo, useState } from 'react'
import JSZip from 'jszip'
import type { FlashcardsPayload } from '../../services/ask-service'

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

  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-3">
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
        className="relative h-24 w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 text-left"
      >
        {stackPreview.map((c, i) => (
          <div
            key={c.cardId}
            className="absolute left-3 right-3 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 shadow-sm"
            style={{ top: `${8 + i * 8}px` }}
          >
            <span className="line-clamp-1">{c.front}</span>
          </div>
        ))}
        <span className="absolute right-2 bottom-2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
          Open carousel
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-2xl">
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
              className="min-h-44 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-left"
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {showBack ? 'Back' : 'Front'}
              </p>
              <p className="text-base leading-relaxed text-neutral-900">
                {showBack ? active.back : active.front}
              </p>
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
