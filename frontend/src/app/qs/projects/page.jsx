'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Eye,
  Filter,
  GalleryVerticalEnd,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api-client'
import { getHomeRoute, getSession } from '@/lib/mock-auth'

const COMPLETE_ROW_STATUSES = new Set(['COMPLETE', 'COMPLETED', 'DONE', 'UPDATED', 'APPROVED'])
const PAGE_SIZE = 100
const PROJECT_FETCH_LIMIT = 5000

function normalizeStatus(value) {
  return String(value ?? '').trim().toUpperCase()
}

function getStatusLabel(value) {
  const status = normalizeStatus(value)
  if (!status) return 'Unspecified'
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function getCompletionColor(status) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'IN PROGRESS':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'PENDING':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function isTaskSignFamilyComplete(task) {
  const rows = Array.isArray(task.signRows) ? task.signRows : []
  if (rows.length === 0) return false
  return rows.every((row) => {
    const status = normalizeStatus(row.status)
    if (status && COMPLETE_ROW_STATUSES.has(status)) return true
    return row.qsQty !== null && row.qsQty !== undefined && row.qsQty !== ''
  })
}

function getTaskSignRowCount(task) {
  return Array.isArray(task.signRows) ? task.signRows.length : 0
}

function formatDate(value) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function truncateText(value, max = 28) {
  const text = String(value ?? '').trim()
  if (!text) return 'N/A'
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function projectTaskHref(project) {
  const task = project.reviewTask ?? project.firstPendingTask
  const taskId = task?.id ?? task?.taskId ?? task?.taskUUID ?? task?.taskUuid
  const targetId = taskId ?? project.id
  return targetId ? `/project-task-view/${targetId}?from=qs` : null
}

function Toolbar({ filters, setFilters, categories, statuses, loading, onRefresh }) {
  const [showFilters, setShowFilters] = useState(false)
  const activeCount = [filters.category, filters.status, filters.completion].filter(Boolean).length

  return (
    <div className="mb-4 mt-4 flex flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
      <h1 className="shrink-0 text-2xl font-semibold leading-none tracking-tight text-slate-900">QS Project List</h1>

      <div className="relative flex flex-wrap items-center justify-end gap-2 sm:gap-3 md:ml-auto">
        <div className="relative mr-0 md:mr-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(event) => setFilters({ ...filters, searchQuery: event.target.value })}
            placeholder="Search by project, task, OP no..."
            className="w-64 rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 shadow-sm transition-colors ${activeCount > 0 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          <Filter size={14} />
          <span className="text-sm font-medium">Filters {activeCount > 0 && `(${activeCount})`}</span>
        </button>

        {showFilters ? (
          <div className="ui-surface absolute right-20 top-12 z-50 flex w-[340px] flex-col gap-4 p-5">
            <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-semibold text-slate-800">Filter Options</h3>
              {activeCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilters({ category: '', status: '', completion: '', searchQuery: filters.searchQuery })}
                  className="cursor-pointer rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:text-red-700"
                >
                  Clear All
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-500">Category</label>
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <GalleryVerticalEnd size={14} className="mr-2 text-slate-400" />
                <select
                  className="w-full cursor-pointer bg-transparent text-sm text-slate-700 outline-none"
                  value={filters.category}
                  onChange={(event) => setFilters({ ...filters, category: event.target.value })}
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-500">Task Status</label>
              <select
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              >
                <option value="">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>{getStatusLabel(status)}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-500">QS Completion</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {[
                  { value: '', label: 'All' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'IN PROGRESS', label: 'In Progress' },
                  { value: 'COMPLETED', label: 'Completed' },
                ].map((option) => (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    onClick={() => setFilters({ ...filters, completion: option.value })}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filters.completion === option.value ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  )
}

function ProjectTable({ data, onOpen }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6">
      <div className="ui-surface flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-[11px] text-slate-700">
            <thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-2 py-1.5">Project No</th>
                <th className="px-2 py-1.5">Project Name</th>
                <th className="px-2 py-1.5">Category</th>
                <th className="px-2 py-1.5 text-right">Tasks</th>
                <th className="px-2 py-1.5 text-right">Pending</th>
                <th className="px-2 py-1.5 text-right">Completed</th>
                <th className="px-2 py-1.5 text-right">Sign Rows</th>
                <th className="px-2 py-1.5">Next Task</th>
                <th className="px-2 py-1.5">Due Date</th>
                <th className="px-2 py-1.5">QS Status</th>
                <th className="px-2 py-1.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row, index) => {
                const href = projectTaskHref(row)
                const actionLabel = row.taskCount > 0
                  ? (row.completionStatus === 'COMPLETED' ? 'View Sign Family Details' : 'Update Sign Family')
                  : 'View Project Details'
                return (
                  <tr key={row.id} className={`transition-colors hover:bg-blue-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                    <td className="px-2 py-1.5 text-xs font-medium text-slate-800">
                      {href ? (
                        <button type="button" onClick={() => onOpen(row)} className="text-left text-blue-600 hover:text-blue-700 hover:underline">
                          {row.projectNo || 'N/A'}
                        </button>
                      ) : (
                        row.projectNo || 'N/A'
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="w-[220px] truncate text-xs text-slate-700" title={row.name || 'N/A'}>{truncateText(row.name, 32)}</div>
                    </td>
                    <td className="px-2 py-1.5">{row.category || 'Project'}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{row.taskCount}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-amber-600">{row.pending}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-emerald-600">{row.completed}</td>
                    <td className="px-2 py-1.5 text-right">{row.signRowCount}</td>
                    <td className="px-2 py-1.5">
                      <div className="w-[150px] truncate" title={row.firstPendingTask?.opNo || row.firstPendingTask?.taskNo || 'N/A'}>
                        {row.firstPendingTask?.opNo || row.firstPendingTask?.taskNo || 'N/A'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{formatDate(row.firstPendingTask?.dueDate)}</td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold leading-tight ${getCompletionColor(row.completionStatus)}`}>
                        {getStatusLabel(row.completionStatus)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-center text-slate-400">
                        {href ? (
                          <button
                            type="button"
                            onClick={() => onOpen(row)}
                            className="rounded p-0.5 transition-colors hover:bg-slate-100 hover:text-blue-600"
                            title={actionLabel}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function QsProjectsPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ category: '', status: '', completion: '', searchQuery: '' })

  useEffect(() => {
    const currentSession = getSession()
    if (!currentSession) {
      router.replace('/login')
      return
    }
    if (currentSession.role !== 'QS') {
      router.replace(getHomeRoute(currentSession))
      return
    }
    setAuthorized(true)
  }, [router])

  const loadProjects = async () => {
    if (!authorized) return
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get(`/projects?status=ACTIVE&limit=${PROJECT_FETCH_LIMIT}`)
      const rows = Array.isArray(response?.data) ? response.data : []
      const withTasks = await Promise.all(
        rows.map(async (project) => {
          try {
            const detail = await apiClient.get(`/projects/${project.id}`)
            const tasks = Array.isArray(detail?.tasks) ? detail.tasks : []
            const enrichedTasks = await Promise.all(
              tasks.map(async (task) => {
                try {
                  const signRows = await apiClient.get(`/tasks/${task.id}/sign-rows`)
                  return { ...task, signRows: Array.isArray(signRows) ? signRows : [] }
                } catch {
                  return { ...task, signRows: [] }
                }
              }),
            )
            return { ...project, ...detail, tasks: enrichedTasks }
          } catch {
            return { ...project, tasks: [] }
          }
        }),
      )
      setProjects(withTasks)
    } catch (err) {
      setError(err?.message || 'Could not load assigned projects.')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authorized) return undefined
    let mounted = true
    const run = async () => {
      await loadProjects()
      if (!mounted) return
    }
    void run()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized])

  const projectRows = useMemo(() => (
    projects.map((project) => {
      const tasks = project.tasks ?? []
      const completed = tasks.filter(isTaskSignFamilyComplete).length
      const pending = Math.max(0, tasks.length - completed)
      const firstPendingTask = tasks.find((task) => !isTaskSignFamilyComplete(task)) ?? tasks[0]
      const firstTaskWithSignRows = tasks.find((task) => getTaskSignRowCount(task) > 0)
      const reviewTask = firstTaskWithSignRows ?? firstPendingTask ?? tasks[0] ?? null
      const completionPercent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
      const statuses = Array.from(new Set(tasks.map((task) => normalizeStatus(task.status)).filter(Boolean)))
      const persistedQsStatus = normalizeStatus(project.qsStatus?.status)
      const fallbackQsStatus = tasks.length > 0 && pending === 0 ? 'COMPLETED' : 'PENDING'
      return {
        ...project,
        completed,
        pending,
        firstPendingTask,
        reviewTask,
        completionPercent,
        statuses,
        completionStatus: persistedQsStatus || fallbackQsStatus,
        signRowCount: tasks.reduce((sum, task) => sum + getTaskSignRowCount(task), 0),
        taskCount: tasks.length,
      }
    })
  ), [projects])

  useEffect(() => {
    setPage(1)
  }, [filters])

  const filteredProjects = useMemo(() => {
    const query = filters.searchQuery.trim().toLowerCase()
    return projectRows.filter((project) => {
      if (filters.category && project.category !== filters.category) return false
      if (filters.completion && project.completionStatus !== filters.completion) return false
      if (filters.status && !project.statuses.includes(filters.status)) return false
      if (!query) return true
      const searchable = [
        project.projectNo,
        project.name,
        project.category,
        ...((project.tasks ?? []).flatMap((task) => [task.opNo, task.taskNo, task.name, task.status])),
      ].join(' ').toLowerCase()
      return searchable.includes(query)
    })
  }, [filters, projectRows])

  const categories = useMemo(() => Array.from(new Set(projectRows.map((project) => project.category).filter(Boolean))).sort(), [projectRows])
  const statuses = useMemo(() => Array.from(new Set(projectRows.flatMap((project) => project.statuses))).sort(), [projectRows])
  const total = filteredProjects.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const visibleProjects = filteredProjects.slice(start, start + PAGE_SIZE)

  const openProject = (project) => {
    const href = projectTaskHref(project)
    if (href) router.push(href)
  }

  if (!authorized) return null

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden font-sans">
      <Navbar />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0">
          <Toolbar
            filters={filters}
            setFilters={setFilters}
            categories={categories}
            statuses={statuses}
            loading={loading}
            onRefresh={() => void loadProjects()}
          />
        </div>

        {error ? (
          <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:mx-6">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading assigned projects...</div>
        ) : visibleProjects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-slate-500">No QS projects match the current view.</div>
        ) : (
          <ProjectTable data={visibleProjects} onOpen={openProject} />
        )}

        <div className="shrink-0 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 sm:px-6">
          <span className="font-medium">
            Showing {total === 0 ? 0 : start + 1}-{Math.min(start + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span className="min-w-[7rem] text-center text-xs font-medium text-slate-700">Page {currentPage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
