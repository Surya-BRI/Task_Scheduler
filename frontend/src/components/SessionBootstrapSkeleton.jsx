'use client'

/** Shared shell shown while session/auth resolves — avoids blank white screens. */
export function SessionBootstrapSkeleton({ label = 'Loading session' }) {
  return (
    <div className="app-shell flex min-h-screen flex-col bg-slate-50" aria-busy="true" aria-label={label}>
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
          <div className="hidden h-4 w-28 animate-pulse rounded bg-slate-200 sm:block" />
          <div className="ml-2 hidden items-center gap-2 md:flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`nav-skel-${i}`} className="h-3 w-14 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
            <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-7 w-48 animate-pulse rounded-md bg-slate-200" />
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`stat-skel-${i}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`row-skel-${i}`} className="flex items-center gap-3">
                <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
