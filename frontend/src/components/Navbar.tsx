// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Calendar, Home, Users } from 'lucide-react'

const PROFILE_USER = { name: 'Sarah', role: 'Designer' }

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
        <Users className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
          role="menu"
          aria-label="Account"
        >
          <div className="px-3 py-2" role="none">
            <p className="text-sm font-semibold text-slate-900">{PROFILE_USER.name}</p>
            <p className="text-xs text-slate-500">{PROFILE_USER.role}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function Navbar() {
  const router = useRouter()
  const utilityIconClass =
    'grid h-9 w-9 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300'

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200">
      <div className="bg-white">
        <div className="w-full flex items-center gap-3 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => router.push('/design-list')}
            className="rounded-md bg-white px-2 py-1"
            aria-label="Go to main page"
          >
            <img
              src="/blue-rhine-logo.png"
              alt="Blue Rhine Industries"
              className="h-12 w-auto object-contain"
            />
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => router.push('/design-scheduler')}
              className={utilityIconClass}
              aria-label="Open calendar"
            >
              <Calendar className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={`relative ${utilityIconClass}`}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              <span className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <ProfileDropdown />
          </div>
        </div>
      </div>

      <div className="bg-[#cfd9ea]">
        <div className="w-full flex items-center px-4 py-1.5 sm:px-6">
          <div className="flex w-full items-center gap-1">
            <button
              type="button"
              onClick={() => router.push('/projects-list')}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-slate-700 hover:bg-white/40"
              aria-label="Home"
            >
              <Home className="h-4 w-4" />
            </button>

            <nav className="min-w-0 flex-1">
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
