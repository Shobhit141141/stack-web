import { Text } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import {
  HiOutlineArrowUpTray,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronLeft,
  HiOutlineClock,
  HiOutlineFolder,
  HiOutlineQueueList,
  HiOutlineTrash,
} from 'react-icons/hi2'
import { NavLink } from 'react-router-dom'
import { routeMap } from '../lib/routes'
import { useUploadStore } from '../store/upload-store'
import { SegmentedProgressBar } from './ui/segmented-progress-bar'

const SIDEBAR_COLLAPSED_KEY = 'stack-sidebar-collapsed'

const SIDEBAR_WIDTH_EXPANDED = 240
const SIDEBAR_WIDTH_COLLAPSED = 68

const sidebarTransition = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 38,
  mass: 0.85,
}

const labelTransition = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }

const navItems = [
  { to: routeMap.recents, label: 'Recents', Icon: HiOutlineClock },
  { to: routeMap.files, label: 'Files', Icon: HiOutlineFolder },
  { to: routeMap.timeline, label: 'Timeline', Icon: HiOutlineQueueList },
  { to: routeMap.trash, label: 'Trash', Icon: HiOutlineTrash },
] as const

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
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

// left rail: logo, upload, nav, storage + ask; width + labels animated with motion
// IMPORTANT: every element stays at the same vertical position during collapse/expand.
// Only width changes and labels fade — no DOM swaps that cause vertical displacement.
export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const openUpload = useUploadStore((s) => s.open)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore quota / private mode
    }
  }, [collapsed])

  return (
    <motion.aside
      initial={false}
      animate={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
      }}
      transition={sidebarTransition}
      className="relative flex h-svh shrink-0 flex-col overflow-hidden border-r border-neutral-300 bg-neutral-50"
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <button
          type="button"
          aria-label="Expand sidebar"
          className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
          onClick={() => setCollapsed(false)}
        />
      ) : null}

      <div
        className={[
          'relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          collapsed ? 'pointer-events-none' : '',
        ].join(' ')}
      >
      {/* ── Header: mark always visible, wordmark + chevron fade ── */}
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
        <motion.div
          initial={false}
          animate={{ width: collapsed ? 0 : 32, opacity: collapsed ? 0 : 1 }}
          transition={sidebarTransition}
          className="overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="pointer-events-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100"
            aria-label="Collapse sidebar"
          >
            <HiOutlineChevronLeft className="size-4" aria-hidden />
          </button>
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
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              [
                'pointer-events-auto flex min-w-0 items-center gap-3 rounded-lg border py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'px-3',
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100',
              ].join(' ')
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden />
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
          </NavLink>
        ))}
      </nav>

      {/* ── Footer: storage + ask — same DOM, content crossfades ── */}
      <div className="mt-auto shrink-0 px-3 pb-4 pt-6">
        <div
          className={[
            "flex flex-col items-center gap-3 rounded-xl",
            collapsed ? "" : "border border-neutral-200 bg-neutral-100 p-3"
          ].join(" ")}
        >
   
          {/* Storage indicator — fixed h-[44px] so neither variant shifts the layout */}
          <div className="relative flex h-[44px] w-full items-center justify-center" title="About 25% storage left">
            {/* Circular (collapsed) */}
            <motion.div
              initial={false}
              animate={{ opacity: collapsed ? 1 : 0 }}
              transition={labelTransition}
              className="absolute inset-0 flex items-center justify-center"
              style={{ pointerEvents: collapsed ? 'auto' : 'none' }}
            >
              <CircularProgress percent={75} />
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
                filledPercent={75}
                segmentCount={24}
                aria-label="Storage used, about 75 percent"
              />
              <Text size="1" weight="medium" className="text-center text-neutral-700">
                25% left
              </Text>
            </motion.div>
          </div>

          {/* Ask button */}
          <button
            type="button"
            className="pointer-events-auto flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
            title="Ask file?"
          >
            <HiOutlineChatBubbleLeftRight className="size-5 shrink-0" aria-hidden />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="ask-label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={labelTransition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Ask file?
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
      </div>
    </motion.aside>
  )
}
