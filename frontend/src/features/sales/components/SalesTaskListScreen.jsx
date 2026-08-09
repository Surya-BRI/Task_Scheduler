'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Search } from 'lucide-react'
import { SalesReviewIcon } from '@/features/sales/components/SalesReviewIcon'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api-client'
import { taskViewPathForRecord, FROM_SALES_QUEUE } from '@/lib/design-list-routes'
import { getStatusLabel, mapTaskToDesignRow } from '@/features/design-list/task-view-model'
import { TypeOfDesignChip } from '@/lib/ui/TypeOfDesignChip'

import { toUserFacingError } from '@/lib/api-error'
const PAGE_SIZE = 100

const getStatusColor = (status) => {
  switch (status) {
    case 'SALES_REVIEW':    return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'ON_HOLD':         return 'bg-slate-100 text-slate-700 border-slate-300'
    case 'CLIENT_ACCEPTED': return 'bg-green-100 text-green-700 border-green-200'
    case 'CLIENT_REJECTED': return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'REWORK':          return 'bg-red-100 text-red-700 border-red-200'
    default:                return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

export default function SalesTaskListScreen() {
  const router = useRouter()
  const [listMode, setListMode] = useState('queue') // 'queue' | 'history'
  const [tasks, setTasks] = useState([])
  const [page, setPage] = useState(1)
  const [serverTotal, setServerTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  /** Session cache so Queue↔History toggles do not re-pay the network when data is fresh. */
  const modeCacheRef = useRef({ queue: null, history: null })
  const fetchGenRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchTasks = useCallback(async ({ force = false } = {}) => {
    const generation = ++fetchGenRef.current
    const cacheKey = listMode === 'history' ? 'history' : 'queue'
    const cached = modeCacheRef.current[cacheKey]
    if (!force && cached && cached.page === page && cached.search === debouncedSearch) {
      setTasks(cached.tasks)
      setServerTotal(cached.total)
      setLoading(false)
      setError('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(Math.max(1, page)))
      params.set('limit', String(PAGE_SIZE))
      if (listMode === 'history') params.set('salesHistory', 'true')
      else params.set('salesQueue', 'true')
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())

      const res = await apiClient.get(`/tasks?${params.toString()}`)
      if (generation !== fetchGenRef.current) return
      const raw = Array.isArray(res) ? res : (res?.data ?? [])
      const mapped = raw.map(mapTaskToDesignRow)
      const total = Number(res?.total ?? mapped.length) || 0
      setTasks(mapped)
      setServerTotal(total)
      modeCacheRef.current[cacheKey] = {
        page,
        search: debouncedSearch,
        tasks: mapped,
        total,
      }
    } catch (err) {
      if (generation !== fetchGenRef.current) return
      setTasks([])
      setServerTotal(0)
      setError(toUserFacingError(err, 'Could not load sales review list.'))
    } finally {
      if (generation === fetchGenRef.current) setLoading(false)
    }
  }, [listMode, page, debouncedSearch])

  const filterKey = `${listMode}|${debouncedSearch}`
  const prevFilterKeyRef = useRef(filterKey)

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey
      if (page !== 1) {
        setPage(1)
        return
      }
    }
    void fetchTasks()
  }, [fetchTasks, filterKey, page])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || q === debouncedSearch.trim().toLowerCase()) return tasks
    // Local refine while debounce catches up
    return tasks.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.projectName?.toLowerCase().includes(q) ||
        t.opNo?.toLowerCase().includes(q),
    )
  }, [tasks, search, debouncedSearch])

  const isHistory = listMode === 'history'
  const totalPages = Math.max(1, Math.ceil(Math.max(serverTotal, 1) / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const emptyCopy = (() => {
    if (error) return null
    if (tasks.length === 0) {
      return isHistory ? 'No reviewed tasks yet.' : 'No tasks in sales review.'
    }
    if (filtered.length === 0 && search.trim()) {
      return 'No tasks match your search.'
    }
    return null
  })()

  const handleModeChange = (mode) => {
    if (mode === listMode) return
    setListMode(mode)
    setPage(1)
  }

  const handleRefresh = () => {
    modeCacheRef.current[isHistory ? 'history' : 'queue'] = null
    void fetchTasks({ force: true })
  }

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar lockPrimaryNav />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 mb-4 mt-4 flex flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 leading-none shrink-0">
              <SalesReviewIcon className="h-6 w-6 shrink-0 text-slate-700" strokeWidth={1.75} />
              {isHistory ? 'Sales Review History' : 'Sales Review Queue'}
            </h1>
            <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleModeChange('queue')}
                className={`rounded px-3 py-1.5 transition-colors ${
                  !isHistory ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Queue
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('history')}
                className={`rounded px-3 py-1.5 transition-colors ${
                  isHistory ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                History
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, project, OP no..."
                className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-orange-400/25 focus:border-orange-400 bg-white text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6" aria-busy="true" aria-label="Loading list">
            <div className="ui-surface h-full overflow-auto">
              <table className="w-full text-xs text-left leading-tight">
                <thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-1.5">Task</th>
                    <th className="px-2 py-1.5">Project</th>
                    <th className="px-2 py-1.5">Business Unit</th>
                    <th className="px-2 py-1.5">Design Type</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Created</th>
                    <th className="px-2 py-1.5">Deadline</th>
                    <th className="px-2 py-1.5">Aging</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`sales-list-skel-${i}`} className="animate-pulse">
                      <td className="px-2 py-2">
                        <div className="h-3 w-40 rounded bg-slate-200" />
                        <div className="mt-1 h-2.5 w-16 rounded bg-slate-100" />
                      </td>
                      <td className="px-2 py-2"><div className="h-3 w-32 rounded bg-slate-100" /></td>
                      <td className="px-2 py-2"><div className="h-3 w-20 rounded bg-slate-100" /></td>
                      <td className="px-2 py-2"><div className="h-5 w-16 rounded-full bg-slate-100" /></td>
                      <td className="px-2 py-2"><div className="h-5 w-20 rounded-full bg-slate-100" /></td>
                      <td className="px-2 py-2"><div className="h-3 w-16 rounded bg-slate-100" /></td>
                      <td className="px-2 py-2"><div className="h-3 w-16 rounded bg-slate-100" /></td>
                      <td className="px-2 py-2"><div className="h-3 w-8 rounded bg-slate-100" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-sm text-slate-600">
            <p className="text-red-600">{error}</p>
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : emptyCopy ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            {emptyCopy}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
            <div className="ui-surface h-full overflow-auto">
              <table className="w-full text-xs text-left leading-tight">
                <thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-1.5">Task</th>
                    <th className="px-2 py-1.5">Project</th>
                    <th className="px-2 py-1.5">Business Unit</th>
                    <th className="px-2 py-1.5">Design Type</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Created</th>
                    <th className="px-2 py-1.5">Deadline</th>
                    <th className="px-2 py-1.5">Aging</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => router.push(taskViewPathForRecord(row, { from: FROM_SALES_QUEUE }))}
                    >
                      <td className="px-2 py-1 text-slate-800 font-medium">
                        <div className="max-w-[220px] truncate" title={row.name}>{row.name || '—'}</div>
                        <div className="text-[10px] text-slate-400">{row.opNo}</div>
                      </td>
                      <td className="px-2 py-1 text-slate-700">
                        <div className="max-w-[180px] truncate" title={row.projectName}>{row.projectName}</div>
                      </td>
                      <td className="px-2 py-1 text-slate-500">{row.businessUnit || row.designType || '—'}</td>
                      <td className="px-2 py-1"><TypeOfDesignChip value={row.typeOfDesign} /></td>
                      <td className="px-2 py-1">
                        <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${getStatusColor(row.status)}`}>
                          {getStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{row.created}</td>
                      <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{row.deadline}</td>
                      <td className={`px-2 py-1 font-medium whitespace-nowrap ${row.agingDays > 14 ? 'text-red-600' : 'text-slate-500'}`}>
                        {row.agingDays}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {serverTotal > 0 ? (
              <div className="shrink-0 flex items-center justify-between pt-3 text-xs text-slate-600">
                <span>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                  {Math.min(currentPage * PAGE_SIZE, serverTotal)} of {serverTotal}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Prev
                  </button>
                  <span>Page {currentPage} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
