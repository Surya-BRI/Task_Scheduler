'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Search } from 'lucide-react'
import { SalesReviewIcon } from '@/features/sales/components/SalesReviewIcon'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api-client'
import { taskViewPathForRecord, FROM_SALES_QUEUE } from '@/lib/design-list-routes'
import { getStatusLabel, mapTaskToDesignRow } from '@/features/design-list/task-view-model'

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
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/tasks?limit=500&salesQueue=true')
      const raw = Array.isArray(res) ? res : (res?.data ?? [])
      setTasks(raw.map(mapTaskToDesignRow))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.projectName?.toLowerCase().includes(q) ||
        t.opNo?.toLowerCase().includes(q),
    )
  }, [tasks, search])

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar lockPrimaryNav />
      <div className="flex-1 flex flex-col min-h-0">
        {/* Toolbar */}
        <div className="shrink-0 mb-4 mt-4 flex flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 leading-none shrink-0">
            <SalesReviewIcon className="h-6 w-6 shrink-0 text-slate-700" strokeWidth={1.75} />
            Sales Review Queue
          </h1>
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
              onClick={fetchTasks}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">No tasks in sales review.</div>
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
                      <td className="px-2 py-1 font-medium text-slate-800 whitespace-nowrap">{row.typeOfDesign || '—'}</td>
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
          </div>
        )}
      </div>
    </div>
  )
}
