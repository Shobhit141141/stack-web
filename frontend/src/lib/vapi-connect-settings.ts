// shared vapi web-call tuning: fewer surprise disconnects + connect UX timings

export const VAPI_WEB_CALL_START_OPTIONS = {
  roomDeleteOnUserLeaveEnabled: false,
} as const

/** hard stop if Daily never reaches call-start */
export const VAPI_CONNECT_TIMEOUT_MS = 38_000

/** show “still connecting” hint — mic/network */
export const VAPI_CONNECT_SLOW_HINT_MS = 6_000

// maps call-start-progress stages to short UI copy
export function formatVapiConnectStage(stage: string | undefined): string {
  if (!stage) return 'Connecting…'
  const labels: Record<string, string> = {
    initialization: 'Starting…',
    'web-call-creation': 'Creating session…',
    'daily-call-object-creation': 'Preparing audio…',
    'mobile-permissions': 'Checking device…',
    'daily-call-join': 'Joining call…',
    'video-recording-setup': 'Setting up…',
    'audio-observer-setup': 'Almost there…',
    'audio-processing-setup': 'Almost there…',
    reconnect: 'Reconnecting…',
  }
  return labels[stage] ?? 'Connecting…'
}
