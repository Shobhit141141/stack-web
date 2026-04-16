import type { ActivityItem } from '../services/activity-service'

export function parseActivityMetadata(item: ActivityItem): Record<string, unknown> {
  const m = item.metadata
  if (!m || typeof m !== 'object') return {}
  return m as Record<string, unknown>
}

export function typographicQuote(s: string, max = 96): string {
  const t = s.trim()
  const ell = t.length > max
  const body = ell ? `${t.slice(0, max).trimEnd()}…` : t
  const safe = body.replace(/"/g, '″')
  return `“${safe}”`
}

export function getActivityTitleLine(item: ActivityItem): string {
  const meta = parseActivityMetadata(item)
  if (item.type === 'upload') {
    const name =
      typeof meta.fileName === 'string' && meta.fileName.trim()
        ? meta.fileName.trim()
        : 'a file'
    return `Uploaded ${name}`
  }
  if (item.type === 'search') {
    const q = typeof meta.query === 'string' ? meta.query.trim() : ''
    return q ? `Searched ${typographicQuote(q)}` : 'Searched'
  }
  const q = typeof meta.query === 'string' ? meta.query.trim() : ''
  return q ? `Asked ${typographicQuote(q)}` : 'Asked the assistant'
}

export function formatActivityRelativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
