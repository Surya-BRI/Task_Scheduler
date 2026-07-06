'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Calendar, ClipboardList, Clock, Home, LogOut, MessageSquareText, Users, Volume2, VolumeX } from 'lucide-react'
import { SalesReviewIcon } from '@/features/sales/components/SalesReviewIcon'
import { getSession, mockLogout } from '@/lib/mock-auth'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/notifications/services/notifications.api'
import { connectDashboardRealtime } from '@/lib/realtime'
import { hasDepartmentManagerAccess } from '@/lib/workflow-roles'

const NAV_ITEMS = [
  'Activities',
  'Dashboards',
  'Transactions',
  'Reports',
  'Analytics',
  'Screens',
  'Setup',
  'Support',
]

const DEADLINE_ALERT_SOUND_KEY = 'br_deadline_alert_sound_enabled'

function isDeadlineNotification(notification) {
  return /deadline/i.test(notification?.title ?? '')
}

function isOverdueNotification(notification) {
  return /overdue/i.test(`${notification?.title ?? ''} ${notification?.message ?? ''}`)
}

function readDeadlineSoundEnabled() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(DEADLINE_ALERT_SOUND_KEY) !== '0'
}

function playDeadlineAlertSound(kind = 'reminder') {
  if (typeof window === 'undefined') return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    const context = new AudioContext()
    const now = context.currentTime
    const sequence = kind === 'overdue'
      ? [
          { frequency: 880, start: 0, duration: 0.16 },
          { frequency: 660, start: 0.2, duration: 0.18 },
          { frequency: 880, start: 0.42, duration: 0.2 },
        ]
      : [
          { frequency: 620, start: 0, duration: 0.16 },
          { frequency: 820, start: 0.22, duration: 0.16 },
        ]

    sequence.forEach((tone) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = kind === 'overdue' ? 'square' : 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.start)
      gain.gain.setValueAtTime(0.0001, now + tone.start)
      gain.gain.exponentialRampToValueAtTime(0.08, now + tone.start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now + tone.start)
      oscillator.stop(now + tone.start + tone.duration + 0.03)
    })

    window.setTimeout(() => {
      void context.close().catch(() => {})
    }, 900)
  } catch {
    // Browsers can block audio until the user has interacted with the page.
  }
}

// ─── Profile Dropdown ────────────────────────────────────────────────────────
function ProfileDropdown({ session }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const displayName = session?.name || 'Guest'
  const displayRole = session?.designation || session?.role || 'User'

  const handleLogout = () => {
    setOpen(false)
    void mockLogout().finally(() => {
      router.push('/login')
    })
  }

  // Colour badge per role
  const roleBadgeClass = session?.role === 'HOD'
    ? 'bg-violet-100 text-violet-700'
    : session?.role === 'QS'
      ? 'bg-amber-100 text-amber-700'
    : 'bg-blue-100 text-blue-700'

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-full bg-[#c5d9ed] text-slate-700 shadow-sm transition hover:bg-[#b5cee6] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
          role="menu"
          aria-label="Account"
        >
          {/* User header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1a3c6e] text-white flex items-center justify-center text-sm font-bold shrink-0">
              {session?.initials || '?'}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{displayRole}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold self-start ${roleBadgeClass}`}>
                {session?.role || 'GUEST'}
              </span>
            </div>
          </div>

          {/* Sign out */}
          <button
            type="button"
            role="menuitem"
            className="w-full px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50 flex items-center gap-2 border-t border-slate-100"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Notifications Dropdown ──────────────────────────────────────────────────
function NotificationDropdown({ session }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [deadlineSoundEnabled, setDeadlineSoundEnabled] = useState(readDeadlineSoundEnabled)
  const rootRef = useRef(null)
  const loadingRef = useRef(false)
  const itemsRef = useRef([])
  const initialLoadRef = useRef(true)
  const deadlineSoundEnabledRef = useRef(deadlineSoundEnabled)

  useEffect(() => {
    deadlineSoundEnabledRef.current = deadlineSoundEnabled
  }, [deadlineSoundEnabled])

  const loadNotifications = async () => {
    if (!session || loadingRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    loadingRef.current = true
    setLoading(true)
    try {
      const [rows, count] = await Promise.all([
        listNotifications(30),
        getUnreadNotificationCount().catch(() => itemsRef.current.filter((n) => !n.isRead).length),
      ])
      const nextItems = Array.isArray(rows) ? rows : []
      const previousIds = new Set(itemsRef.current.map((item) => item.id))
      const newDeadlineItems = nextItems.filter(
        (item) => !item.isRead && isDeadlineNotification(item) && !previousIds.has(item.id),
      )

      if (!initialLoadRef.current && deadlineSoundEnabledRef.current && newDeadlineItems.length > 0) {
        const hasOverdue = newDeadlineItems.some(isOverdueNotification)
        playDeadlineAlertSound(hasOverdue ? 'overdue' : 'reminder')
      }

      initialLoadRef.current = false
      itemsRef.current = nextItems
      setItems(nextItems)
      setUnreadCount(typeof count === 'number' ? count : 0)
    } catch {
      // Keep existing items on transient errors (e.g. DB pool timeout).
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!session) return
    void loadNotifications()
    const interval = setInterval(() => void loadNotifications(), 45000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadNotifications()
    }
    document.addEventListener('visibilitychange', onVisible)
    const disconnectRealtime = connectDashboardRealtime({
      onNotificationsRefresh: () => void loadNotifications(),
    })
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      disconnectRealtime()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.role])

  useEffect(() => {
    if (!open) return undefined
    void loadNotifications()
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleOpenNotification = async (notification) => {
    try {
      if (!notification.isRead) {
        await markNotificationRead(notification.id)
      }
    } catch {
      // ignore
    }
    setOpen(false)
    if (notification.linkUrl?.trim()) {
      router.push(notification.linkUrl)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      await loadNotifications()
    } catch {
      // ignore
    }
  }

  const toggleDeadlineSound = () => {
    setDeadlineSoundEnabled((current) => {
      const next = !current
      try {
        window.localStorage.setItem(DEADLINE_ALERT_SOUND_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      if (next) playDeadlineAlertSound('reminder')
      return next
    })
  }

  if (!session) return null

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative ${'ui-icon-button'}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        {unreadCount > 0 ? (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5"
          role="menu"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleDeadlineSound}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                  deadlineSoundEnabled ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}
                title={deadlineSoundEnabled ? 'Disable deadline alert sounds' : 'Enable deadline alert sounds'}
              >
                {deadlineSoundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                Sound
              </button>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <NotificationItem key={item.id} item={item} onOpen={handleOpenNotification} />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NotificationItem({ item, onOpen }) {
  const overdue = isOverdueNotification(item)
  const deadline = isDeadlineNotification(item)
  const itemClass = overdue
    ? item.isRead
      ? 'bg-red-50/50 hover:bg-red-50'
      : 'bg-red-100/70 hover:bg-red-100'
    : item.isRead
      ? 'bg-white hover:bg-slate-50'
      : 'bg-blue-50/40 hover:bg-slate-50'

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => void onOpen(item)}
      className={`w-full border-b border-slate-100 px-4 py-3 text-left transition ${itemClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-semibold ${overdue ? 'text-red-800' : 'text-slate-900'}`}>{item.title}</p>
        {deadline ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            overdue ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700'
          }`}>
            {overdue ? 'Overdue' : 'Deadline'}
          </span>
        ) : null}
      </div>
      <p className={`mt-1 line-clamp-2 text-xs ${overdue ? 'text-red-700' : 'text-slate-600'}`}>{item.message}</p>
      <p className="mt-1 text-[10px] text-slate-400">
        {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
      </p>
    </button>
  )
}

// ─── Main Navbar ─────────────────────────────────────────────────────────────
export function Navbar({ currentDate, onCalendarChange, dateRangeText }) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const [session, setSession] = useState(null)

  // Hydrate session client-side
  useEffect(() => {
    setSession(getSession())
  }, [pathname])

  const isDesigner = session?.role === 'DESIGNER'
  const isSalesperson = session?.role === 'SALESPERSON'
  const isQs = session?.role === 'QS'
  const canViewOverview = hasDepartmentManagerAccess(session?.role)
  const bottomNavItems = isQs ? [] : NAV_ITEMS

  const utilityIconClass = 'ui-icon-button'
  const onTeamActivity =
    pathname === '/team-activity' ||
    pathname.startsWith('/team-activity/') ||
    pathname.includes('/team-activity') ||
    pathname === '/sales/team-activity' ||
    pathname.startsWith('/sales/team-activity')
  const onProjects = pathname === '/projects-overview' || pathname.startsWith('/projects-overview') || pathname === '/sales/projects-overview' || pathname.startsWith('/sales/projects-overview')
  const onSalesReview = pathname === '/sales/tasks' || pathname.startsWith('/sales/tasks/')
  const onSalesProjectsList = pathname === '/sales/projects-list' || pathname.startsWith('/sales/projects-list/')
  const onScheduler = pathname === '/design-scheduler' || pathname.startsWith('/designer')

  // Logo click: role-based home route (Design List for HOD/Sales design modules)
  const handleLogoClick = () => {
    if (isDesigner) {
      router.push('/design-list/tasks')
    } else if (isSalesperson) {
      router.push('/sales/design-list')
    } else if (isQs) {
      router.push('/qs/projects')
    } else {
      router.push('/design-list')
    }
  }

  // Scheduler icon behaviour differs by role
  const handleSchedulerClick = () => {
    if (isDesigner) {
      router.push('/designer/dashboard')
    } else if (isQs) {
      router.push('/qs/projects')
    } else {
      // HOD / guest → master scheduler
      router.push('/design-scheduler')
    }
  }

  // Home button: HOD/Sales → Project Design (projects-list), Designer → disabled / my-work
  const handleHomeClick = () => {
    if (isDesigner) return
    if (isSalesperson) { router.push('/sales/projects-list'); return }
    if (isQs) { router.push('/qs/projects'); return }
    router.push('/projects-list')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="bg-white">
        <div className="w-full flex items-center gap-3 px-4 py-2 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleLogoClick}
              className="rounded-md bg-white px-2 py-1 flex items-center gap-4"
              aria-label="Go to main page"
            >
              <img
                src="/blue-rhine-logo.png"
                alt="Blue Rhine Industries"
                className="h-12 w-auto object-contain"
              />
            </button>
            {dateRangeText && (
              <div className="hidden sm:block text-sm font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
                {dateRangeText}
              </div>
            )}
          </div>

          {/* Right-side icons */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/* Date display — always visible */}
            <span className="text-sm font-semibold text-slate-700">
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>

            {/* Scheduler / Calendar icon — hidden for Salesperson */}
            {!isSalesperson && !isQs && (
              currentDate ? (
                /* HOD Master Scheduler — date display only, no picker */
                <button
                  type="button"
                  className={`${utilityIconClass}${onScheduler ? ' bg-slate-100 text-slate-900' : ''}`}
                  aria-label="Calendar"
                >
                  <Calendar className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSchedulerClick}
                  aria-current={onScheduler ? 'page' : undefined}
                  className={`${utilityIconClass}${onScheduler ? ' bg-slate-100 text-slate-900' : ''}`}
                  aria-label={isDesigner ? 'Open my dashboard' : 'Open scheduler'}
                  title={isDesigner ? 'My Scheduler Dashboard' : 'Master Scheduler'}
                >
                  <Calendar className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
              )
            )}

            {/* Sales Review queue — Sales-only module */}
            {isSalesperson && (
              <button
                type="button"
                onClick={() => router.push('/sales/tasks')}
                aria-current={onSalesReview ? 'page' : undefined}
                className={`${utilityIconClass}${onSalesReview ? ' bg-slate-100 text-slate-900' : ''}`}
                aria-label="Open sales review queue"
                title="Sales Review"
              >
                <SalesReviewIcon className="h-5 w-5" strokeWidth={1.75} />
              </button>
            )}

            {/* Projects overview — HOD / Admin / PM */}
            {canViewOverview && (
              <button
                type="button"
                onClick={() => router.push(isSalesperson ? '/sales/projects-overview' : '/projects-overview')}
                aria-current={onProjects ? 'page' : undefined}
                className={`${utilityIconClass}${onProjects ? ' bg-slate-100 text-slate-900' : ''}`}
                aria-label="Open projects overview"
                title="Projects Overview"
              >
                <ClipboardList className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
            )}



            {/* Chatter */}
            <button
              type="button"
              onClick={() => router.push('/chatter')}
              className={`${utilityIconClass}${pathname === '/chatter' ? ' bg-slate-100 text-slate-900' : ''}`}
              aria-label="Open chatter page"
              title="Chatter"
            >
              <MessageSquareText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>

            {/* Team Activity — hidden for QS; sales uses sales module route */}
            {!isQs && (
              <button
                type="button"
                onClick={() => {
                  if (isDesigner) {
                    router.push('/designer/team-activity')
                    return
                  }
                  if (isSalesperson) {
                    router.push('/sales/team-activity')
                    return
                  }
                  router.push('/team-activity')
                }}
                title="Team Activity Feed"
                aria-label="Open team activity feed"
                aria-current={onTeamActivity ? 'page' : undefined}
                className={`${utilityIconClass}${onTeamActivity ? ' bg-slate-100 text-slate-900' : ''}`}
              >
                <Clock className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
            )}

            {/* Notifications */}
            <NotificationDropdown session={session} />

            {/* Profile */}
            <ProfileDropdown session={session} />
          </div>
        </div>
      </div>

      {/* Bottom nav bar */}
      {!isQs && (
      <div className="bg-slate-200/80 border-t border-slate-200">
        <div className="w-full flex items-center px-4 py-1.5 sm:px-6">
          <div className="flex w-full items-center gap-1">
            {/* Home button: clickable for all; designers stay on current page */}
            <button
              type="button"
              onClick={handleHomeClick}
              className={`ui-icon-button h-8 w-8 ${isDesigner ? 'opacity-70' : ''}${
                isSalesperson && onSalesProjectsList ? ' bg-white text-slate-900 shadow-sm' : ''
              }`}
              aria-label={isDesigner ? 'Home (stay on current page)' : 'Go to Projects List'}
              title={isDesigner ? 'Home' : 'Projects List'}
              aria-current={isSalesperson && onSalesProjectsList ? 'page' : undefined}
            >
              <Home className="h-4 w-4" />
            </button>

            <nav className="min-w-0 flex-1">
              <div className="flex w-full items-center justify-evenly">
                {bottomNavItems.map((item) => {
                  const label = typeof item === 'string' ? item : item.label
                  const href = typeof item === 'string' ? null : item.href
                  const active = href
                    ? pathname === href.split('#')[0]
                    : false
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (href) router.push(href)
                      }}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/50 ${
                        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>
      )}
    </header>
  )
}
