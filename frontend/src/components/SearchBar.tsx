import { useCallback, useEffect, useRef, useState } from 'react'
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import { semanticSearch, type SearchResult } from '../services/search-service'
import { openKnownFile } from '../hooks/use-open-file'
import { useImageThumbnailUrls } from '../hooks/use-image-thumbnail-urls'
import { fileIcon, isImageFileType } from '../utils/file-display'
import { Skeleton } from './ui/skeleton'

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const thumbnailUrls = useImageThumbnailUrls(
    results.map((r) => ({
      fileId: r.fileId,
      type: r.type,
    })),
  )

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await semanticSearch(q.trim())
      setResults(data)
      setOpen(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setOpen(true)
    debounceRef.current = setTimeout(() => search(value), 400)
  }

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    void openKnownFile(result.fileId, result.fileName)
  }

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input — pill shape to match global top bar */}
      <div className="flex h-10 items-center gap-2 rounded-full border border-neutral-200 bg-white pl-3.5 pr-4 shadow-sm">
        <HiOutlineMagnifyingGlass className="size-4 shrink-0 text-neutral-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
          placeholder="Search files..."
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          {loading && (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="px-4 py-6 text-center text-sm text-neutral-500">
              No results found
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map((r) => (
                <button
                  key={`${r.contentId}-${r.fileId}`}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50"
                >
                  <img
                    src={
                      isImageFileType(r.type)
                        ? (thumbnailUrls.get(r.fileId) ?? fileIcon(r.type))
                        : fileIcon(r.type)
                    }
                    alt=""
                    className={`mt-0.5 h-8 w-8 shrink-0 rounded-md ${
                      isImageFileType(r.type) ? 'object-cover' : ''
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {r.fileName}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                      {r.snippet}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
