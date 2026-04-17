import { Avatar, Button, Popover, Text, Tooltip } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import {
  HiOutlineArrowUpTray,
  HiOutlineArrowRightOnRectangle,
  HiOutlineClock,
  HiOutlineFolder,
  HiOutlineQueueList,
  HiOutlineTrash,
  HiOutlineUserCircle,
} from 'react-icons/hi2'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { routeMap } from '../lib/routes'
import type { MeProfile } from '../types/auth'
import { useFileStorageSummary } from '../hooks/use-file-storage-summary'
import { MEDIA_LG_MIN, useMediaQuery } from '../hooks/use-media-query'
import { useUploadStore } from '../store/upload-store'
import { formatFileSize } from '../utils/file-display'
import { SegmentedProgressBar } from './ui/segmented-progress-bar'

const SIDEBAR_WIDTH_EXPANDED = 240
const SIDEBAR_WIDTH_COLLAPSED = 68

const sidebarTransition = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 38,
  mass: 0.85,
}

const labelTransition = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }

function profileInitials(p: MeProfile): string {
  const from = p.displayName?.trim() || p.email || p.userName || '?'
  const parts = from.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase()
  }
  return from.slice(0, 2).toUpperCase()
}

function profileDisplayName(p: MeProfile): string {
  return p.displayName?.trim() || p.userName || p.email
}

const navItems = [
  { to: routeMap.recents, label: 'Recents', Icon: HiOutlineClock },
  { to: routeMap.files, label: 'Files', Icon: HiOutlineFolder },
  { to: routeMap.timeline, label: 'Timeline', Icon: HiOutlineQueueList },
  { to: routeMap.trash, label: 'Trash', Icon: HiOutlineTrash },
] as const

function isComingSoonNav(to: (typeof navItems)[number]['to']): boolean {
  return to === routeMap.timeline || to === routeMap.trash
}

function navShellClass(collapsed: boolean): string {
  return [
    'flex min-w-0 items-center gap-3 rounded-lg border py-2.5 text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-2' : 'px-3',
  ].join(' ')
}

function CircularProgress({
  percent,
  size = 36,
  dotted = false,
  dots = 20,
}: {
  percent: number
  size?: number
  dotted?: boolean
  dots?: number
}) {
  const clamped = Math.min(100, Math.max(0, percent))
  const cx = size / 2
  const cy = size / 2

  if (dotted) {
    const dotRadius = 1.5
    const ringRadius = (size - dotRadius * 2) / 2
    const filledCount = Math.round((dots * clamped) / 100)

    return (
      <svg width={size} height={size} className="block" aria-hidden>
        {Array.from({ length: dots }, (_, i) => {
          const angle = (2 * Math.PI * i) / dots - Math.PI / 2
          return (
            <circle
              key={i}
              cx={cx + ringRadius * Math.cos(angle)}
              cy={cy + ringRadius * Math.sin(angle)}
              r={dotRadius}
              fill={i < filledCount ? '#171717' : '#d4d4d4'}
            />
          )
        })}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-neutral-900 text-[9px] font-semibold"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
    )
  }

  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (clamped / 100) * circumference

  return (
    <svg width={size} height={size} className="block" aria-hidden>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#e5e5e5"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#171717"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - filled}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-neutral-900 text-[9px] font-semibold"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

// left rail: logo, upload, nav, storage + account; width + labels animated with motion
// Expand while pointer is over the rail, collapsed width when pointer leaves (popover / focus keep it open).
// IMPORTANT: every element stays at the same vertical position during collapse/expand.
export function AppSidebar() {
  const asideRef = useRef<HTMLElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focusInside, setFocusInside] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const openUpload = useUploadStore((s) => s.open)
  const { profile, signOut } = useAuth()
  const { data: storageSummary } = useFileStorageSummary()

  const maxFiles = storageSummary?.maxFiles ?? 10
  const fileCount = storageSummary?.fileCount ?? 0
  const maxBytesPerFile = storageSummary?.maxBytesPerFile ?? 5 * 1024 * 1024
  const totalSizeBytes = storageSummary?.totalSizeBytes ?? 0
  const slotsUsedPercent =
    maxFiles > 0 ? Math.min(100, Math.max(0, (fileCount / maxFiles) * 100)) : 0
  const slotsFreeLabel =
    maxFiles > 0 ? `${Math.max(0, maxFiles - fileCount)} free` : ''

  const storageTooltip = (
    <div className="max-w-[240px] space-y-1.5 text-left text-xs leading-snug normal-case">
      <p className="font-medium">Files {fileCount} of {maxFiles}</p>
      <p>
        Total size {formatFileSize(totalSizeBytes)} (each file up to {formatFileSize(maxBytesPerFile)}
        ).
      </p>
      <p className="opacity-90">
        The meter shows how many of your {maxFiles} file slots are in use, not how full your disk
        is.
      </p>
    </div>
  )

  const canExpandRail = useMediaQuery(MEDIA_LG_MIN)
  // Mobile / narrow: always collapsed width; desktop: expand on hover, account menu, or focus
  const railExpanded = canExpandRail && (hovered || accountOpen || focusInside)
  const collapsed = !railExpanded

  useEffect(() => {
    const el = asideRef.current
    if (!el) return
    const onFocusIn = () => setFocusInside(true)
    const onFocusOut = (e: FocusEvent) => {
      const rt = e.relatedTarget as Node | null
      if (!rt || !el.contains(rt)) setFocusInside(false)
    }
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return (
    <motion.aside
      ref={asideRef}
      data-no-link-import
      initial={false}
      animate={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
      }}
      transition={sidebarTransition}
      className="relative flex h-svh shrink-0 flex-col overflow-hidden border-r border-neutral-300 bg-neutral-50"
      aria-expanded={railExpanded}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* ── Header: logo + wordmark (width follows hover) ── */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-4 pb-3 ml-1">
        <motion.div
          initial={false}
          animate={{ marginLeft: collapsed ? 'auto' : 0, marginRight: collapsed ? 'auto' : 0 }}
          transition={sidebarTransition}
          className="shrink-0"
        >
          <img src="/icons/cloud.svg" alt="Stack" className="h-9 w-9 " />
        </motion.div>
        <motion.div
          initial={false}
          animate={{ width: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }}
          transition={sidebarTransition}
          className="min-w-0 flex-1 overflow-hidden"
        >
          <Text size="4" weight="bold" className="whitespace-nowrap lowercase tracking-tight text-neutral-900">
            stack
          </Text>
        </motion.div>
      </div>

      {/* ── Upload button ── */}
      <div className="shrink-0 px-3">
        <button
          type="button"
          onClick={() => openUpload()}
          className="pointer-events-auto flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          title="Upload"
        >
          <HiOutlineArrowUpTray className="size-5 shrink-0" aria-hidden />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="upload-label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={labelTransition}
                className="overflow-hidden whitespace-nowrap text-white"
              >
                Upload
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Nav items ── */}
      <nav className="mt-5 flex min-w-0 flex-col gap-2 px-3" aria-label="Main">
        {navItems.map(({ to, label, Icon }) => {
          const comingSoon = isComingSoonNav(to)
          const labelRow = (
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key={label}
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={labelTransition}
                  className="min-w-0 overflow-hidden whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          )

          if (comingSoon) {
            return (
              <Tooltip key={to} content="Coming soon">
                <span className="pointer-events-auto inline-flex w-full min-w-0">
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    aria-label={`${label} (coming soon)`}
                    className={[
                      navShellClass(collapsed),
                      'w-full cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-500',
                    ].join(' ')}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    {labelRow}
                  </button>
                </span>
              </Tooltip>
            )
          }

          return (
            <NavLink
              key={to}
              to={to}
              end={to === routeMap.home}
              title={label}
              className={({ isActive }) =>
                [
                  'pointer-events-auto',
                  navShellClass(collapsed),
                  isActive
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100',
                ].join(' ')
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {labelRow}
            </NavLink>
          )
        })}
      </nav>

      {/* ── Footer: storage + account — same DOM, content crossfades ── */}
      <div className="mt-auto shrink-0 px-3 pb-4 pt-6">
        <div
          className={[
            "flex flex-col items-center gap-3 rounded-xl",
            collapsed ? "" : "border border-neutral-200 bg-neutral-100 p-3"
          ].join(" ")}
        >
   
          {/* Storage indicator — fixed h-[44px]; bar = file slots used (max 10 × 5 MB each) */}
          <Tooltip delayDuration={300} content={storageTooltip}>
            <div
              className="relative flex h-[44px] w-full cursor-default items-center justify-center"
              aria-label={`File slots in use: ${fileCount} of ${maxFiles}`}
            >
              {/* Circular (collapsed) */}
              <motion.div
                initial={false}
                animate={{ opacity: collapsed ? 1 : 0 }}
                transition={labelTransition}
                className="absolute inset-0 flex items-center justify-center"
                style={{ pointerEvents: collapsed ? 'auto' : 'none' }}
              >
                <CircularProgress percent={slotsUsedPercent} />
              </motion.div>
              {/* Segmented (expanded) */}
              <motion.div
                initial={false}
                animate={{ opacity: collapsed ? 0 : 1 }}
                transition={labelTransition}
                className="absolute inset-0 flex w-full flex-col justify-center gap-1"
                style={{ pointerEvents: collapsed ? 'none' : 'auto' }}
              >
                <SegmentedProgressBar
                  filledPercent={slotsUsedPercent}
                  segmentCount={maxFiles}
                  aria-label={`File slots used, ${fileCount} of ${maxFiles}`}
                />
                <Text size="1" weight="medium" className="text-center text-neutral-700">
                  {fileCount}/{maxFiles} files · {slotsFreeLabel}
                </Text>
              </motion.div>
            </div>
          </Tooltip>

          {/* Account: popover anchored to trigger (profile + sign out) */}
          <div className="pointer-events-auto w-full">
            <Popover.Root open={accountOpen} onOpenChange={setAccountOpen}>
              <Popover.Trigger
                type="button"
                aria-expanded={accountOpen}
                aria-haspopup="true"
                title={profile ? profileDisplayName(profile) : 'Account'}
                className={[
                  'w-full min-w-0 cursor-pointer rounded-lg border py-2 text-sm font-medium text-neutral-900 transition-[border-color,background-color,box-shadow] duration-200 ease-out hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50',
                  accountOpen
                    ? 'border-neutral-400 bg-neutral-50 shadow-sm'
                    : 'border-neutral-300 bg-white',
                  'px-2',
                ].join(' ')}
              >
                {/* Radix Popover.Trigger composes with Slot — must be exactly one element child */}
                <span
                  className={[
                    'flex min-w-0 w-full items-center gap-2',
                    collapsed ? 'justify-center' : 'text-left',
                  ].join(' ')}
                >
                  {profile ? (
                    <Avatar
                      size="2"
                      radius="full"
                      fallback={profileInitials(profile)}
                      src={profile.avatarUrl ?? undefined}
                      referrerPolicy="no-referrer"
                      color="gray"
                      className="shrink-0"
                    />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600">
                      <HiOutlineUserCircle className="size-6" aria-hidden />
                    </span>
                  )}
                  <AnimatePresence initial={false}>
                    {!collapsed && (
                      <motion.span
                        key="account-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={labelTransition}
                        className="min-w-0 flex-1 overflow-hidden text-left"
                      >
                        <span className="block truncate">
                          {profile ? profileDisplayName(profile) : 'Account'}
                        </span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </Popover.Trigger>

              <Popover.Content
                size="2"
                width="200px"
                side="top"
                align="center"
                sideOffset={8}
                collisionPadding={16}
              >
                <div className="flex flex-col">
                  {/* <Heading as="h2" size="4" weight="bold" className="text-neutral-900">
                    Account
                  </Heading> */}
                  <Text as="p" size="1" color="gray" className="sr-only">
                    Sign out of Stack.
                  </Text>
                  <div className="mt-3 flex items-center gap-3">
                    {profile ? (
                      <Avatar
                        size="3"
                        radius="full"
                        fallback={profileInitials(profile)}
                        src={profile.avatarUrl ?? undefined}
                        referrerPolicy="no-referrer"
                        color="gray"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600">
                        <HiOutlineUserCircle className="size-7" aria-hidden />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <Text as="p" size="2" weight="medium" className="truncate text-neutral-900">
                        {profile ? profileDisplayName(profile) : 'Account'}
                      </Text>
                      {profile ? (
                        <Text as="p" size="1" color="gray" className="mt-0.5 truncate">
                          {profile.email}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="soft"
                      color="red"
                      size="2"
                      onClick={() => {
                        setAccountOpen(false)
                        void signOut()
                      }}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <HiOutlineArrowRightOnRectangle className="size-4 shrink-0" aria-hidden />
                        Sign out
                      </span>
                    </Button>
                  </div>
                </div>
              </Popover.Content>
            </Popover.Root>
          </div>
        </div>
      </div>
      </div>
    </motion.aside>
  )
}
