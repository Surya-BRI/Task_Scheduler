// @ts-nocheck
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '../components/Navbar'
import { useDesignListStore } from '../state/DesignListContext'

export function ProjectDesignPage() {
  const router = useRouter()
  const { records } = useDesignListStore()
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return records.slice(0, 18)

    return records
      .filter((row) => {
        const projectText = `${row.projectNo} ${row.name} ${row.salesPerson} ${row.designType}`.toLowerCase()
        return projectText.includes(normalizedQuery)
      })
      .slice(0, 18)
  }, [query, records])

  return (
    <div className="h-screen bg-[#f5f6f8]">
      <Navbar />
      <main className="px-2 py-3 sm:px-3 lg:px-4">
        <div className="mx-auto w-full max-w-[1600px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold text-slate-900">Project Design</h1>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by Project ID..."
              className="w-full max-w-[220px] rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="grid grid-cols-[130px_1fr_140px_100px] items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
              <div>Project ID</div>
              <div>Project Name</div>
              <div>Sales Person</div>
              <div>category</div>
            </div>

            <div>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[130px_1fr_140px_100px] items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-800 last:border-b-0"
                >
                  <div className="truncate text-[#1e5aa7]" title={row.projectNo}>
                    {row.projectNo}
                  </div>
                  <div className="truncate" title={row.name}>
                    {row.name.toUpperCase()} @ {row.businessUnit.toUpperCase()}
                  </div>
                  <div className="truncate">{row.salesPerson}</div>
                  <div className="text-[#526b92]">
                    <button
                      type="button"
                      onClick={() => router.push(`/design-list/task/${row.id}?from=project-design`)}
                      className="font-medium text-[#1e5aa7] underline decoration-[#1e5aa7]/40 underline-offset-2 hover:text-[#164a8c]"
                    >
                      {row.designType}
                    </button>
                  </div>
                </div>
              ))}

              {rows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No project designs found.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
