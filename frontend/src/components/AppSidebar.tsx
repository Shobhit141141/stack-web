import { Box, Flex, Text } from '@radix-ui/themes'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import {
  HiOutlineArrowUpTray,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineFolder,
  HiOutlineQueueList,
  HiOutlineTrash,
} from 'react-icons/hi2'
import { NavLink } from 'react-router-dom'
import { routeMap } from '../lib/routes'
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

// left rail: logo, upload, nav, storage + ask; width + labels animated with motion
export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

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
      className="flex h-svh shrink-0 flex-col overflow-hidden border-r border-neutral-300 bg-neutral-50"
      aria-expanded={!collapsed}
    >
      <Box px="3" pt="4" pb="3" className="shrink-0">
        <Flex
          align="center"
          justify={collapsed ? 'center' : 'between'}
          gap="2"
          wrap="nowrap"
          className={collapsed ? 'min-w-0 flex-col' : 'min-w-0'}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {collapsed ? (
              <motion.div
                key="mark"
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ ...labelTransition }}
                className="flex shrink-0"
              >
                <Box
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-900 text-sm font-bold lowercase text-neutral-900"
                  aria-hidden
                >
                  s
                </Box>
              </motion.div>
            ) : (
              <motion.div
                key="wordmark"
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ ...labelTransition }}
                className="min-w-0 flex-1 overflow-hidden"
              >
                <Text size="4" weight="bold" className="lowercase tracking-tight text-neutral-900">
                  stack
                </Text>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            type="button"
            layout
            onClick={() => setCollapsed((c) => !c)}
            whileTap={{ scale: 0.96 }}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={collapsed ? 'expand' : 'collapse'}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.12 }}
                className="flex items-center justify-center"
              >
                {collapsed ? (
                  <HiOutlineChevronRight className="size-4" aria-hidden />
                ) : (
                  <HiOutlineChevronLeft className="size-4" aria-hidden />
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </Flex>
      </Box>

      <Box px="3" className="shrink-0">
        <button
          type="button"
          className={`flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 ${
            collapsed ? 'px-2' : 'px-3'
          }`}
          title="Upload"
        >
          <HiOutlineArrowUpTray className="size-5 shrink-0" aria-hidden />
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.span
                key="upload-label"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={labelTransition}
                className="whitespace-nowrap"
              >
                Upload
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>
      </Box>

      <nav className="mt-5 flex min-w-0 flex-col gap-2 px-3" aria-label="Main">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              [
                'flex min-w-0 items-center gap-3 rounded-lg border py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'px-3',
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100',
              ].join(' ')
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <AnimatePresence initial={false}>
              {!collapsed ? (
                <motion.span
                  key={label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={labelTransition}
                  className="min-w-0 overflow-hidden whitespace-nowrap"
                >
                  {label}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </NavLink>
        ))}
      </nav>

      <Box px="3" pb="4" pt="6" className="mt-auto min-w-0 shrink-0">
        <Flex
          direction="column"
          gap="3"
          className="rounded-xl border border-neutral-200 bg-neutral-100 p-3"
        >
          <Box title="About 25% storage left">
            <Flex direction="column" gap="2">
              <SegmentedProgressBar
                filledPercent={75}
                segmentCount={collapsed ? 10 : 24}
                aria-label="Storage used, about 75 percent"
              />
              <AnimatePresence initial={false}>
                {!collapsed ? (
                  <motion.div
                    key="pct"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={labelTransition}
                  >
                    <Text size="1" weight="medium" className="text-center text-neutral-700">
                      25% left
                    </Text>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Flex>
          </Box>
          <button
            type="button"
            className={`flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 ${
              collapsed ? 'px-2' : 'px-3'
            }`}
            title="Ask file?"
          >
            <HiOutlineChatBubbleLeftRight className="size-5 shrink-0" aria-hidden />
            <AnimatePresence initial={false}>
              {!collapsed ? (
                <motion.span
                  key="ask-label"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={labelTransition}
                  className="whitespace-nowrap"
                >
                  Ask file?
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
        </Flex>
      </Box>
    </motion.aside>
  )
}
