'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Calendar, ClipboardList, Clock, Home, LogOut, MessageSquareText, Users } from 'lucide-react'
import { getSession, mockLogout } from '@/lib/mock-auth'

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
    mockLogout()
    router.push('/login')
  }

  // Colour badge per role
  const roleBadgeClass = session?.role === 'HOD'
    ? 'bg-violet-100 text-violet-700'
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

// ─── Main Navbar ─────────────────────────────────────────────────────────────
export function Navbar({ currentDate, onCalendarChange, dateRangeText }) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const [session, setSession] = useState(null)

  // Hydrate session client-side
  useEffect(() => {
    setSession(getSession())
  }, [pathname])

  const isHOD = session?.role === 'HOD'
  const isDesigner = session?.role === 'DESIGNER'

  const utilityIconClass = 'ui-icon-button'
  const onTeamActivity =
    pathname === '/team-activity' ||
    pathname.startsWith('/team-activity/') ||
    pathname.includes('/team-activity')
  const onProjects = pathname === '/projects-overview' || pathname.startsWith('/projects-overview')
  const onScheduler = pathname === '/design-scheduler' || pathname.startsWith('/designer')

  // Logo click: HOD → design-list, Designer → their design list
  const handleLogoClick = () => {
    if (isDesigner) {
      router.push(`/design-list/tasks`)
    } else {
      router.push('/design-list')
    }
  }

  // Scheduler icon behaviour differs by role
  const handleSchedulerClick = () => {
    if (isDesigner) {
      router.push('/designer/dashboard')
    } else {
      // HOD / guest → master scheduler
      router.push('/design-scheduler')
    }
  }

  // Home button: HOD → projects-list, Designer → disabled / my-work
  const handleHomeClick = () => {
    if (isDesigner) return // designers don't use the projects list
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
            {/* Scheduler / Calendar icon */}
            {currentDate ? (
              /* HOD Master Scheduler — shows inline date picker */
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  {currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <div className="relative">
                  <button
                    type="button"
                    className={`${utilityIconClass}${onScheduler ? ' bg-slate-100 text-slate-900' : ''}`}
                    aria-label="Select date"
                  >
                    <Calendar className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </button>
                  <input
                    type="date"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`}
                    onChange={(e) => {
                      if (e.target.value && onCalendarChange) {
                        const [y, m, d] = e.target.value.split('-')
                        onCalendarChange(new Date(Number(y), Number(m) - 1, Number(d)))
                      }
                    }}
                    onClick={(e) => {
                      if ('showPicker' in e.currentTarget) {
                        try { e.currentTarget.showPicker() } catch {}
                      }
                    }}
                  />
                </div>
              </div>
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
            )}

            {/* Projects overview — HOD only */}
            {isHOD && (
              <button
                type="button"
                onClick={() => router.push('/projects-overview')}
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

            {/* Team Activity — HOD only */}
            <button
              type="button"
              onClick={() => {
                if (isDesigner) {
                  router.push('/designer/team-activity')
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

            {/* Notifications */}
            <button
              type="button"
              className={`relative ${utilityIconClass}`}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              <span className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>

            {/* Profile */}
            <ProfileDropdown session={session} />
          </div>
        </div>
      </div>

      {/* Bottom nav bar */}
      <div className="bg-slate-200/80 border-t border-slate-200">
        <div className="w-full flex items-center px-4 py-1.5 sm:px-6">
          <div className="flex w-full items-center gap-1">
            {/* Home button: clickable for all; designers stay on current page */}
            <button
              type="button"
              onClick={handleHomeClick}
              className={`ui-icon-button h-8 w-8 ${isDesigner ? 'opacity-70' : ''}`}
              aria-label={isDesigner ? 'Home (stay on current page)' : 'Go to Projects List'}
              title={isDesigner ? 'Home' : 'Projects List'}
            >
              <Home className="h-4 w-4" />
            </button>

            <nav className="min-w-0 flex-1">
              <div className="flex w-full items-center justify-evenly">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white/50"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
}
