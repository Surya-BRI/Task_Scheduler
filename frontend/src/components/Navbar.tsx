// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarDays, ChevronDown, Home, LogOut } from 'lucide-react'
import { useAuth } from '../state/AuthContext'

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

function ProfileDropdown() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function handleLogout() {
    logout()
    setOpen(false)
    router.replace('/login')
  }

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <div className="h-9 w-9 overflow-hidden rounded-full bg-white ring-1 ring-slate-300">
          <div className="grid h-full w-full place-items-center text-xs font-semibold text-slate-600">
            {initials}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
          role="menu"
          aria-label="Account"
        >
          <div className="px-3 py-2" role="none">
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">{user.role}</p>
          </div>
          <div className="my-1 border-t border-slate-100" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus-visible:bg-red-50"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Navbar() {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200">
      <div className="bg-white">
        <div className="w-full flex items-center gap-3 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => router.push('/design-list/table')}
            className="rounded-md bg-white px-2 py-1"
            aria-label="Go to main page"
          >
            <img
              src="/blue-rhine-logo.png"
              alt="Blue Rhine Industries"
              className="h-12 w-auto object-contain"
            />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
              aria-label="Calendar"
            >
              <CalendarDays className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <ProfileDropdown />
          </div>
        </div>
      </div>

      <div className="bg-[#cfd9ea]">
        <div className="w-full flex items-center px-4 py-1.5 sm:px-6">
          <div className="flex w-full items-center">
            <button
              type="button"
              onClick={() => router.push('/project-design')}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-slate-700 hover:bg-white/40"
              aria-label="Home"
            >
              <Home className="h-4 w-4" />
            </button>

            <nav className="ml-2 flex-1">
              <div className="flex w-full items-center justify-evenly">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white/40"
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
