'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, CircleCheck, Clock3, FileText, Flag, Hourglass, Info, Pencil, Shield, Trash2, Upload } from 'lucide-react'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { Navbar } from '../components/Navbar'
import { dummyProjects } from '../features/projects/data/dummy-projects'
import { apiClient } from '@/lib/api-client'
import { fetchProjectActivities, fetchTaskActivities } from '@/features/team-activity/services/activities.api'
import {
  createChatterComment,
  createChatterPost,
  listChatterMentionUsers,
  listChatterPosts,
  normalizePriority,
  resolveEmbeddedChatterTitle,
} from '@/features/chatter/services/chatter-posts.api'
import { MentionTextarea } from '@/features/chatter/components/MentionTextarea'
import { EmbeddedChatterCommentComposer } from '@/features/chatter/components/EmbeddedChatterCommentComposer'
import { ChatterMentionText } from '@/features/chatter/components/ChatterMentionText'
import { parseMentionUserIdsFromMessage } from '@/features/chatter/utils/mention-utils'
import {
  resolveChatterMentionScope,
  resolvePageChatterMentionScope,
} from '@/features/chatter/utils/resolve-chatter-mention-scope'
import {
  updateCommentDraft,
  updateCommentMentionIds,
  updateMentionIdList,
} from '@/features/chatter/utils/chatter-draft-handlers'
import { emitChatterRefresh, onChatterRefresh } from '@/features/chatter/utils/chatter-events'
import { mergeChatterPostLists } from '@/features/chatter/utils/chatter-merge'
import {
  isChatterUuid,
  resolveTaskIdForChatter,
} from '@/features/chatter/utils/resolve-chatter-task-id'

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}

function deriveFileNameFromUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    const queryName = url.searchParams.get('filename') || url.searchParams.get('fileName') || url.searchParams.get('name')
    if (queryName && queryName.trim()) return queryName.trim()
    const segments = url.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
    const ignored = new Set(['view', 'edit', 'preview', 'open', 'download', 'u', 'd', 'file', 'folders'])
    const preferred = [...segments].reverse().find((part) => !ignored.has(part.toLowerCase()))
    if (url.hostname.includes('drive.google.com')) {
      const fileIdIndex = segments.findIndex((part) => part.toLowerCase() === 'd')
      const fileId = fileIdIndex >= 0 ? segments[fileIdIndex + 1] : null
      if (fileId) return `google-drive-${fileId}`
    }
    return preferred || 'linked-file'
  } catch {
    return 'linked-file'
  }
}

const STAGE_ITEMS = [
  { id: 'new', label: 'Design Task New', hint: 'Awaiting project allocation', icon: Flag },
  { id: 'planned', label: 'Design Planned', hint: 'Task scheduled for production', icon: Clock3 },
  { id: 'progress', label: 'In Progress', hint: 'Active design and drafting', icon: Hourglass },
  { id: 'completed', label: 'Design Completed', hint: 'Submitted for internal review', icon: CircleCheck },
  { id: 'review', label: 'HOD Review', hint: 'Verified and approved by HOD', icon: Shield },
  { id: 'sales', label: 'Sales Review', hint: 'Final sales and client check', icon: Pencil },
  { id: 'rework', label: 'Rework / Error', hint: 'Corrections needed', icon: Info },
]

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'activity', label: 'Activity' },
  { id: 'chatter', label: 'Chatter' },
]

function StagePill({ item }) {
  const Icon = item.icon
  return (
    <div className="min-w-[148px] rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex items-start gap-1.5">
        <div className="mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-slate-900 text-white">
          <Icon className="h-2.5 w-2.5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-900">{item.label}</p>
          <p className="text-[10px] leading-tight text-slate-500">{item.hint}</p>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[125px_1fr] gap-2 py-0.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  )
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 py-1.5 text-sm ${
        active
          ? 'border-slate-900 font-semibold text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  )
}

function FormFieldWithPencil({ id, label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-9 text-[13px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400" aria-hidden>
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

function FilesPanel({ projectId, files, uploading, onPick, onAddLink, onDelete }) {
  const fileInputRef = useRef(null)
  const [mode, setMode] = useState('link')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Project Files</h2>
      <div className="mt-2 inline-flex rounded-md border border-slate-300 bg-slate-50 p-1 text-xs">
        <button type="button" onClick={() => setMode('link')} className={`rounded px-2 py-1 font-semibold ${mode === 'link' ? 'bg-white text-slate-900' : 'text-slate-600'}`}>Paste Link</button>
        <button type="button" onClick={() => setMode('browse')} className={`rounded px-2 py-1 font-semibold ${mode === 'browse' ? 'bg-white text-slate-900' : 'text-slate-600'}`}>Browse Files</button>
      </div>
      {mode === 'link' ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value)
                setLinkError('')
              }}
              placeholder="Paste Google Drive/S3/HTTP link"
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              disabled={!projectId || uploading}
              onClick={async () => {
                const url = linkUrl.trim()
                if (!isValidHttpUrl(url)) {
                  setLinkError('Enter a valid http/https URL')
                  return
                }
                await onAddLink(url, deriveFileNameFromUrl(url))
                setLinkUrl('')
              }}
              className="shrink-0 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Link
            </button>
          </div>
          {linkError ? <p className="text-xs text-red-600">{linkError}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={!projectId || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'Uploading...' : 'Upload Project Files'}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(event) => onPick(Array.from(event.target.files ?? []))}
      />
      <div className="mt-2 rounded-md border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">
        Drag &amp; drop files here or click to browse.
        <span className="mt-1 block text-xs text-slate-400">Supported: Audio, MP4 Files.</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {files.map((file) => (
          <div key={file.id} className="flex min-h-10 items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <a href={file.signedUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 truncate text-blue-700 hover:underline">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span className="truncate">{file.fileName}</span>
            </a>
            <button type="button" className="ml-2 text-slate-500 hover:text-red-600" onClick={() => onDelete(file.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

const HISTORY_FIELD_ACTIONS = new Set(['TASK_CREATED', 'ASSIGNED_TASK', 'STATUS_CHANGED'])

function HistoryDialog({ title, projectId, type, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [cursorStack, setCursorStack] = useState([null])
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setLoading(true)
    const cursor = cursorStack[pageIndex]
    fetchProjectActivities(projectId, { limit: 20, cursor: cursor ?? undefined })
      .then((response) => {
        if (!alive) return
        let data = response?.data ?? []
        if (type === 'field') data = data.filter((i) => HISTORY_FIELD_ACTIONS.has(i.action))
        setItems(data)
        setNextCursor(response?.pageInfo?.nextCursor ?? null)
        setHasMore(Boolean(response?.pageInfo?.hasMore))
      })
      .catch(() => { if (alive) setItems([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId, type, cursorStack, pageIndex])

  const handlePrevious = () => {
    if (!hasMore || !nextCursor) return
    setCursorStack((prev) => {
      const updated = [...prev]
      if (updated.length <= pageIndex + 1) updated.push(nextCursor)
      return updated
    })
    setPageIndex((i) => i + 1)
  }

  const handleLatest = () => {
    setCursorStack([null])
    setPageIndex(0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        {loading ? (
          <p className="px-6 py-10 text-center text-xs text-slate-400">Loading…</p>
        ) : (
          <ul className="px-6 py-4 text-xs text-slate-700">
            {items.length === 0 ? (
              <li className="py-4 text-center text-slate-500">No history on this page.</li>
            ) : items.map((entry) => (
              <li key={entry.id} className="border-b border-slate-100 py-2.5">
                <p className="text-[10px] text-slate-500">{new Date(entry.occurredAt).toLocaleDateString('en-CA')}</p>
                <p className="mt-0.5">{entry.summary}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={handleLatest}
            disabled={pageIndex === 0 || loading}
            className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Latest
          </button>
          <span className="text-[10px] text-slate-400">Page {pageIndex + 1}</span>
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!hasMore || loading}
            className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
        </div>
      </div>
    </div>
  )
}

const RETAIL_TAB_IDS = ['details', 'activity', 'chatter']

function modelFromProjectRow(row) {
  const digits = row.projectId.replace(/\D/g, '')
  const opCore = digits.slice(-5) || row.id
  const at = row.projectName.match(/@(.+)/i)
  const location = at ? at[1].split(/[,:]/)[0].trim().toUpperCase() : 'MAIN SITE'
  return {
    pageTitle: row.projectName.toUpperCase(),
    projectName: row.projectName,
    projectNo: row.projectId,
    opNo: `OP${opCore}`,
    businessUnit: 'Green Valley Developers',
    projectLocation: location,
    salesPerson: row.salesPerson,
  }
}

export function RetailProjectPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const projectRowId = String(params.projectRowId ?? '')

  const row = useMemo(
    () => dummyProjects.find((p) => p.id === projectRowId && p.category === 'Retail'),
    [projectRowId],
  )

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [chatterMessage, setChatterMessage] = useState('')
  const [chatterPriority, setChatterPriority] = useState('')
  const [chatterPosts, setChatterPosts] = useState([])
  const [chatterLoading, setChatterLoading] = useState(false)
  const [chatterError, setChatterError] = useState('')
  const [chatterSubmitting, setChatterSubmitting] = useState(false)
  const [mentionSuggestions, setMentionSuggestions] = useState([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [commentByPostId, setCommentByPostId] = useState({})
  const [commentMentionIdsByPostId, setCommentMentionIdsByPostId] = useState({})
  const [postMentionUserIds, setPostMentionUserIds] = useState([])
  const [commentSubmittingPostId, setCommentSubmittingPostId] = useState('')
  const [mentionUsers, setMentionUsers] = useState([])
  const [priorityLevel, setPriorityLevel] = useState('')
  const [hoursRequired, setHoursRequired] = useState('')
  const [dateIssued, setDateIssued] = useState('')
  const [dateSubmission, setDateSubmission] = useState('')
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [projectFiles, setProjectFiles] = useState([])
  const [uploadingProjectFiles, setUploadingProjectFiles] = useState(false)
  const [resolvingTaskId, setResolvingTaskId] = useState(false)
  const mentionUsersRef = useRef([])
  const [activityMode, setActivityMode] = useState('project')
  const [activityItems, setActivityItems] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityCursor, setActivityCursor] = useState(null)
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [projectHistoryItems, setProjectHistoryItems] = useState([])
  const [fieldHistoryItems, setFieldHistoryItems] = useState([])
  const [sidebarHasMore, setSidebarHasMore] = useState(false)
  const [historyDialog, setHistoryDialog] = useState(null)

  useEffect(() => {
    if (!row) {
      router.replace('/projects-list')
    }
  }, [row, router])

  const rawTab = searchParams.get('tab')
  const activeTab = RETAIL_TAB_IDS.includes(rawTab) ? rawTab : 'details'
  const isCreateRequested = searchParams.get('create') === '1'

  useEffect(() => {
    if (!row) return
    if (!isCreateRequested) return
    const next = new URLSearchParams(searchParams.toString())
    next.delete('create')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [isCreateRequested, row, searchParams, pathname, router])

  const selectTab = useCallback(
    (tabId) => {
      const next = new URLSearchParams(searchParams.toString())
      if (tabId === 'details') {
        next.delete('tab')
      } else {
        next.set('tab', tabId)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const m = useMemo(() => (row ? modelFromProjectRow(row) : null), [row])
  const createTaskRecord = useMemo(
    () =>
      row && m
        ? {
            ...row,
            opNo: m.opNo,
            projectNo: m.projectNo,
            projectName: m.projectName,
            name: m.projectName,
            businessUnit: m.businessUnit,
          }
        : row,
    [row, m],
  )
  const taskIdReady = isChatterUuid(taskId)
  const canPostChatter =
    chatterMessage.trim().length > 0 && !resolvingTaskId
  useEffect(() => {
    let alive = true
    async function resolveProjectId() {
      if (!row?.projectId) return
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.projectId)) {
        setProjectId(row.projectId)
        return
      }
      try {
        const project = await apiClient.get(`/projects/by-project-no/${encodeURIComponent(row.projectId)}`)
        if (!alive) return
        setProjectId(project?.id ?? '')
      } catch {
        if (!alive) return
        setProjectId('')
      }
    }
    resolveProjectId()
    return () => {
      alive = false
    }
  }, [row?.projectId])

  useEffect(() => {
    let alive = true
    async function resolveTaskId() {
      if (!row && !projectId) {
        if (alive) setTaskId('')
        return
      }
      setResolvingTaskId(true)
      try {
        const foundId = await resolveTaskIdForChatter({
          taskId: row?.taskId,
          recordId: row?.id,
          opNo: m?.opNo,
          projectId,
          fromTaskApi: Boolean(row?.fromTaskApi),
        })
        if (!alive) return
        setTaskId(foundId ?? '')
      } catch {
        if (!alive) return
        setTaskId('')
      } finally {
        if (alive) setResolvingTaskId(false)
      }
    }
    resolveTaskId()
    return () => {
      alive = false
    }
  }, [m?.opNo, projectId, row?.fromTaskApi, row?.id, row?.taskId])

  const fetchActivities = useCallback(
    async (opts = { append: false, cursor: null }) => {
      const targetId = activityMode === 'task' ? taskId : projectId
      if (!targetId) {
        setActivityItems([])
        setActivityCursor(null)
        setActivityHasMore(false)
        return
      }
      setActivityLoading(true)
      setActivityError('')
      try {
        const response =
          activityMode === 'task'
            ? await fetchTaskActivities(targetId, { limit: 20, cursor: opts.cursor ?? undefined })
            : await fetchProjectActivities(targetId, { limit: 20, cursor: opts.cursor ?? undefined })
        setActivityItems((prev) => (opts.append ? [...prev, ...(response?.data ?? [])] : (response?.data ?? [])))
        setActivityCursor(response?.pageInfo?.nextCursor ?? null)
        setActivityHasMore(Boolean(response?.pageInfo?.hasMore))
      } catch (error) {
        setActivityError(error instanceof Error ? error.message : 'Failed to load activity')
      } finally {
        setActivityLoading(false)
      }
    },
    [activityMode, projectId, taskId],
  )

  useEffect(() => {
    if (activeTab !== 'activity') return
    fetchActivities({ append: false, cursor: null })
    const interval = setInterval(() => fetchActivities({ append: false, cursor: null }), 20000)
    return () => clearInterval(interval)
  }, [activeTab, activityMode, taskId, projectId, fetchActivities])

  useEffect(() => {
    let alive = true
    async function fetchSidebarHistory() {
      if (!projectId) {
        if (!alive) return
        setProjectHistoryItems([])
        setFieldHistoryItems([])
        return
      }
      try {
        const response = await fetchProjectActivities(projectId, { limit: 20 })
        const items = response?.data ?? []
        if (!alive) return
        setProjectHistoryItems(items)
        const fieldActions = new Set(['TASK_CREATED', 'ASSIGNED_TASK', 'STATUS_CHANGED'])
        setFieldHistoryItems(items.filter((item) => fieldActions.has(item.action)))
        setSidebarHasMore(Boolean(response?.pageInfo?.hasMore))
      } catch {
        if (!alive) return
        setProjectHistoryItems([])
        setFieldHistoryItems([])
        setSidebarHasMore(false)
      }
    }
    fetchSidebarHistory()
    const interval = setInterval(fetchSidebarHistory, 20000)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [projectId])

  const chatterRefreshPendingRef = useRef(false)

  const fetchChatterPosts = useCallback(async ({ silent = false } = {}) => {
    const queryTaskId = taskId && isUuid(taskId) ? taskId : null
    if (!queryTaskId && !projectId) {
      setChatterPosts([])
      return
    }
    if (!silent) setChatterLoading(true)
    setChatterError('')
    try {
      const res = queryTaskId
        ? await listChatterPosts({ taskId: queryTaskId, limit: 200 })
        : await listChatterPosts({ projectId, limit: 200 })
      const posts = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
      const normalized = [...posts]
      setChatterPosts((prev) =>
        mergeChatterPostLists(normalized, prev, { taskId: queryTaskId, projectId }),
      )
    } catch (error) {
      setChatterError(error instanceof Error ? error.message : 'Failed to load chatter')
      if (!silent) setChatterPosts([])
    } finally {
      if (!silent) setChatterLoading(false)
    }
  }, [projectId, taskId])

  useEffect(() => {
    if (activeTab !== 'chatter') return
    chatterRefreshPendingRef.current = false
    fetchChatterPosts()
    if (mentionUsersRef.current.length === 0) {
      listChatterMentionUsers()
        .then((users) => { mentionUsersRef.current = Array.isArray(users) ? users : [] })
        .catch(() => {})
    }
  }, [activeTab, fetchChatterPosts])

  useEffect(() => {
    return onChatterRefresh((detail) => {
      if (detail.taskId && taskId && detail.taskId !== taskId) return
      if (detail.projectId && projectId && detail.projectId !== projectId) return
      if (activeTab === 'chatter') {
        void fetchChatterPosts({ silent: true })
      } else {
        chatterRefreshPendingRef.current = true
      }
    })
  }, [activeTab, fetchChatterPosts, projectId, taskId])

  const focusPostId = searchParams.get('postId')
  const focusCommentId = searchParams.get('commentId')
  const chatterMentionDirectory = useMemo(() => {
    const map = new Map()
    for (const user of mentionUsers) {
      if (user?.id) map.set(user.id, user)
    }
    for (const post of chatterPosts) {
      for (const user of post.mentionedUsers ?? []) {
        if (user?.id) map.set(user.id, user)
      }
      for (const comment of post.comments ?? []) {
        for (const user of comment.mentionedUsers ?? []) {
          if (user?.id) map.set(user.id, user)
        }
      }
    }
    return [...map.values()]
  }, [mentionUsers, chatterPosts])

  useEffect(() => {
    if (activeTab !== 'chatter') return
    listChatterMentionUsers({
      taskId: taskIdReady ? taskId : null,
      projectId: projectId || null,
    })
      .then((rows) => setMentionUsers(Array.isArray(rows) ? rows : []))
      .catch(() => setMentionUsers([]))
  }, [activeTab, taskId, taskIdReady, projectId])

  useEffect(() => {
    if (activeTab !== 'chatter' || !focusPostId || chatterLoading) return
    requestAnimationFrame(() => {
      const targetId = focusCommentId
        ? `chatter-comment-${focusCommentId}`
        : `chatter-post-${focusPostId}`
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [activeTab, focusPostId, focusCommentId, chatterLoading, chatterPosts.length])

  const fetchProjectFiles = useCallback(async () => {
    if (!projectId) {
      setProjectFiles([])
      return
    }
    try {
      const files = await apiClient.get(`/projects/${projectId}/files`)
      setProjectFiles(files ?? [])
    } catch {
      setProjectFiles([])
    }
  }, [projectId])

  useEffect(() => {
    fetchProjectFiles()
  }, [fetchProjectFiles])

  async function handleProjectFilesPicked(files) {
    if (!projectId || files.length === 0) return
    setUploadingProjectFiles(true)
    try {
      await Promise.all(
        files.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)
          await apiClient.post(`/projects/${projectId}/files`, formData)
        }),
      )
      await fetchProjectFiles()
    } finally {
      setUploadingProjectFiles(false)
    }
  }

  async function handleDeleteProjectFile(fileId) {
    if (!projectId) return
    await apiClient.delete(`/projects/${projectId}/files/${fileId}`)
    await fetchProjectFiles()
  }

  async function handleProjectFileLinkAdd(url, fileName) {
    if (!projectId) return
    setUploadingProjectFiles(true)
    try {
      await apiClient.post(`/projects/${projectId}/files/link`, { url, fileName })
      await fetchProjectFiles()
    } finally {
      setUploadingProjectFiles(false)
    }
  }

  async function handlePostChatter() {
    const message = chatterMessage.trim()
    if (!message) return
    setChatterSubmitting(true)
    setChatterError('')
    let resolvedTaskId = taskIdReady ? taskId : null
    if (!resolvedTaskId) {
      setResolvingTaskId(true)
      try {
        resolvedTaskId = await resolveTaskIdForChatter({
          taskId: row?.taskId,
          recordId: row?.id,
          opNo: m?.opNo,
          projectId,
          fromTaskApi: Boolean(row?.fromTaskApi),
        })
        if (resolvedTaskId) setTaskId(resolvedTaskId)
      } finally {
        setResolvingTaskId(false)
      }
    }
    if (!resolvedTaskId && !projectId) {
      setChatterError('Project is still being linked. Please wait a moment and try again.')
      setChatterSubmitting(false)
      return
    }
    try {
      const mentionUserIds =
        postMentionUserIds.length > 0
          ? postMentionUserIds
          : parseMentionUserIdsFromMessage(message, mentionUsers)
      const created = await createChatterPost({
        message,
        postType: 'Posts',
        ...(mentionUserIds.length ? { mentionUserIds } : {}),
        ...(chatterPriority ? { priority: chatterPriority } : {}),
        ...(mentionUserIds.length ? { mentionUserIds } : {}),
        ...(resolvedTaskId ? { taskId: resolvedTaskId } : { projectId }),
      })
      setChatterMessage('')
      setChatterPriority('')
      setPostMentionUserIds([])
      setChatterPosts((prev) => {
        const next = [created, ...prev.filter((p) => p.id !== created.id)]
        next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        return next
      })
      emitChatterRefresh({ taskId: resolvedTaskId, projectId, postId: created.id })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post chatter')
    } finally {
      setChatterSubmitting(false)
    }
  }

  function handleChatterMessageChange(value) {
    setChatterMessage(value)
    const lastAt = value.lastIndexOf('@')
    if (lastAt !== -1) {
      const fragment = value.slice(lastAt + 1)
      if (/^[A-Za-z][A-Za-z0-9._\s-]{0,49}$/.test(fragment)) {
        const needle = fragment.trim().toLowerCase()
        if (needle.length >= 1) {
          const matches = mentionUsersRef.current
            .filter((u) => u.fullName.toLowerCase().includes(needle))
            .slice(0, 6)
          setMentionSuggestions(matches)
          setMentionQuery(fragment)
          return
        }
      }
    }
    setMentionSuggestions([])
    setMentionQuery('')
  }

  function insertMentionIntoMessage(user) {
    const lastAt = chatterMessage.lastIndexOf('@')
    const before = chatterMessage.slice(0, lastAt)
    const after = chatterMessage.slice(lastAt + 1 + mentionQuery.length).trimStart()
    setChatterMessage(`${before}@${user.fullName} ${after}`)
    setMentionSuggestions([])
    setMentionQuery('')
  }

  function resolveMentionUserIdsFromText(text) {
    const pattern = /@([A-Za-z][A-Za-z0-9._-]{1,50}(?:\s[A-Za-z][A-Za-z0-9._-]{1,40})?)/g
    const ids = []
    let match
    while ((match = pattern.exec(text)) !== null) {
      const needle = match[1].trim().toLowerCase()
      const user = mentionUsersRef.current.find((u) => {
        const name = String(u.fullName ?? '').trim().toLowerCase()
        return name === needle || name.startsWith(needle)
      })
      if (user && !ids.includes(user.id)) ids.push(user.id)
    }
    return ids
  }

  async function handlePostComment(postId) {
    const message = String(commentByPostId[postId] ?? '').trim()
    if (!postId || !message) return
    setCommentSubmittingPostId(postId)
    setChatterError('')
    try {
      const post = chatterPosts.find((entry) => entry.id === postId)
      const scopedIds = commentMentionIdsByPostId[postId] ?? []
      const mentionUserIds =
        scopedIds.length > 0
          ? scopedIds
          : parseMentionUserIdsFromMessage(message, mentionUsers)
      const created = await createChatterComment(postId, message, mentionUserIds)
      setCommentByPostId((prev) => updateCommentDraft(prev, postId, ''))
      setCommentMentionIdsByPostId((prev) => updateCommentMentionIds(prev, postId, []))
      setChatterPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                updatedAt: new Date().toISOString(),
                comments: [created, ...(post.comments ?? []).filter((c) => c.id !== created.id)],
              }
            : post,
        ),
      )
      emitChatterRefresh({
        taskId: post?.taskId ?? taskId,
        projectId: post?.projectId ?? projectId,
        postId,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post comment')
    } finally {
      setCommentSubmittingPostId('')
    }
  }

  const pageMentionScope = resolvePageChatterMentionScope({ taskId, projectId, taskIdReady })

  const handleCommentDraftChange = useCallback((postId, text) => {
    setCommentByPostId((prev) => updateCommentDraft(prev, postId, text))
  }, [])

  const handleCommentMentionIdsChange = useCallback((postId, ids) => {
    setCommentMentionIdsByPostId((prev) => updateCommentMentionIds(prev, postId, ids))
  }, [])

  const handlePostMentionIdsChange = useCallback((ids) => {
    setPostMentionUserIds((prev) => updateMentionIdList(prev, ids))
  }, [])

  if (!row || !m) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="h-[calc(100vh-128px)] overflow-auto px-2.5 py-2 pb-3 sm:px-3">
        <div className="mx-auto max-w-[1460px] space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push('/projects-list')}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <h1 className="text-base font-semibold leading-tight tracking-tight text-slate-900 sm:text-lg">
            {m.pageTitle}
          </h1>

          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {STAGE_ITEMS.map((item) => (
              <StagePill key={item.id} item={item} />
            ))}
          </div>

          <div className="grid gap-2.5 lg:grid-cols-[1fr_265px]">
            <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="flex items-center gap-4">
                  {TABS.map((tab) => (
                    <TabButton
                      key={tab.id}
                      label={tab.label}
                      active={activeTab === tab.id}
                      onClick={() => selectTab(tab.id)}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">OP NO: {m.opNo}</p>
              </div>

              {activeTab === 'details' ? (
                <>
                  <div className="mt-2.5 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-0.5">
                      <DetailRow label="Project Name" value={m.projectName} />
                      <DetailRow label="OP No" value={m.opNo} />
                      <DetailRow label="Project No" value={m.projectNo} />
                    </div>
                    <div className="space-y-0.5">
                      <DetailRow label="Project Location" value={m.projectLocation} />
                      <DetailRow label="Business Unit" value={m.businessUnit} />
                      <DetailRow label="Sales Person" value={m.salesPerson} />
                    </div>
                  </div>

                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <FormFieldWithPencil
                        id="retail-priority"
                        label="Priority Level"
                        value={priorityLevel}
                        onChange={setPriorityLevel}
                        placeholder=""
                      />
                      <FormFieldWithPencil
                        id="retail-hours"
                        label="Hours Required"
                        value={hoursRequired}
                        onChange={setHoursRequired}
                        placeholder=""
                      />
                      <FormFieldWithPencil
                        id="retail-issued"
                        label="Date of Issued"
                        value={dateIssued}
                        onChange={setDateIssued}
                        placeholder=""
                      />
                      <FormFieldWithPencil
                        id="retail-submission"
                        label="Date of Submission"
                        value={dateSubmission}
                        onChange={setDateSubmission}
                        placeholder=""
                      />
                    </div>
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setCreateModalOpen(true)}
                        className="rounded-md bg-[#10a6e3] px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      >
                        Create
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                    <div className="grid grid-cols-5 bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
                      <div>Sign Family</div>
                      <div>Sign Type</div>
                      <div>Plan Code</div>
                      <div>Contract Reference</div>
                      <div>Quantity</div>
                    </div>
                    <div className="px-3 py-6 text-center text-xs text-slate-500">No rows yet.</div>
                  </div>
                </>
              ) : null}

              {activeTab === 'activity' ? (
                <ActivityTimelinePane
                  items={activityItems}
                  loading={activityLoading}
                  error={activityError}
                  hasMore={activityHasMore}
                  onLoadMore={() => fetchActivities({ append: true, cursor: activityCursor })}
                  onRetry={() => fetchActivities({ append: false, cursor: null })}
                />
              ) : null}

              {activeTab === 'chatter' ? (
                <div className="mt-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <label htmlFor="retail-chatter-input" className="text-xs font-semibold text-slate-700">
                      Message
                    </label>
                    <MentionTextarea
                      value={chatterMessage}
                      onChange={setChatterMessage}
                      taskId={pageMentionScope.taskId}
                      projectId={pageMentionScope.projectId}
                      onMentionIdsChange={handlePostMentionIdsChange}
                      minRows={3}
                      placeholder="Type your message... Use @ to mention someone"
                      className="mt-1.5 w-full resize-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                    />
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold text-slate-600">Priority (optional)</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {['High', 'Medium', 'Low'].map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setChatterPriority((prev) => (prev === level ? '' : level))}
                            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                              chatterPriority === level
                                ? level === 'High'
                                  ? 'border-red-500 bg-red-500 text-white'
                                  : level === 'Medium'
                                    ? 'border-amber-400 bg-amber-400 text-white'
                                    : 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      {resolvingTaskId ? (
                        <p className="text-[11px] text-slate-400">Preparing chatter…</p>
                      ) : !taskIdReady && projectId ? (
                        <p className="text-[11px] text-slate-400">Posting to project discussion</p>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={handlePostChatter}
                        disabled={!canPostChatter || chatterSubmitting || resolvingTaskId}
                        className="rounded-md bg-[#10a6e3] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f96cd] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {chatterSubmitting ? 'Posting...' : resolvingTaskId ? 'Linking…' : 'Post'}
                      </button>
                    </div>
                  </div>

                  {chatterError ? (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                      {chatterError}
                      <button type="button" className="ml-2 underline" onClick={fetchChatterPosts}>Retry</button>
                    </div>
                  ) : null}
                  <div className="mt-2 max-h-[260px] space-y-1.5 overflow-auto pr-1">
                    {chatterLoading ? (
                      <div className="space-y-2">
                        <div className="h-14 animate-pulse rounded-md bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-md bg-slate-100" />
                      </div>
                    ) : null}
                    {!chatterLoading && chatterPosts.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">
                        No chatter messages yet.
                      </div>
                    ) : (
                      chatterPosts.map((entry) => (
                        <article key={entry.id} id={`chatter-post-${entry.id}`} className="overflow-visible rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800">
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-900 truncate">
        {resolveEmbeddedChatterTitle(entry, m?.opNo, m?.projectNo)}
      </p>
      {normalizePriority(entry.priority) ? (
        <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
          {normalizePriority(entry.priority)}
        </span>
      ) : null}
      <p className="text-[10px] text-slate-500">
        {entry.authorName ? `${entry.authorName}${entry.authorRole ? ` (${entry.authorRole})` : ''}` : (entry.authorId ? `User ${entry.authorId.slice(0, 8)}` : 'Unknown')}
      </p>
    </div>
    <p className="shrink-0 text-[10px] text-slate-500">{formatChatterDateTime(entry.createdAt)}</p>
  </div>
  <ChatterMentionText message={entry.message} users={chatterMentionDirectory} className="mt-1 block" />
  <div className="mt-2 space-y-1">
    {(entry.comments ?? []).map((comment) => (
      <div
        key={comment.id}
        id={`chatter-comment-${comment.id}`}
        className={`rounded border border-slate-200 bg-slate-50 px-2 py-1 ${focusCommentId === comment.id ? 'ring-2 ring-blue-400' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold text-slate-700">
            {comment.authorName ? `${comment.authorName}${comment.authorRole ? ` (${comment.authorRole})` : ''}` : (comment.authorId ? `User ${comment.authorId.slice(0, 8)}` : 'Unknown')}
          </p>
          <p className="shrink-0 text-[10px] text-slate-500">{formatChatterDateTime(comment.createdAt)}</p>
        </div>
        <ChatterMentionText message={comment.message} users={chatterMentionDirectory} className="mt-1 block" />
      </div>
    ))}
  </div>
  <EmbeddedChatterCommentComposer
                            value={commentByPostId[entry.id] ?? ''}
                            onChange={(value) => handleCommentDraftChange(entry.id, value)}
                            onMentionIdsChange={(ids) => handleCommentMentionIdsChange(entry.id, ids)}
                            taskId={resolveChatterMentionScope(entry, { taskId, projectId, taskIdReady }).taskId}
                            projectId={resolveChatterMentionScope(entry, { taskId, projectId, taskIdReady }).projectId}
                            onSubmit={() => handlePostComment(entry.id)}
                            submitting={commentSubmittingPostId === entry.id}
                          />
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </section>

            <aside className="space-y-2.5">
              {activeTab !== 'chatter' ? (
                <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                  <h2 className="text-xs font-semibold text-slate-900">Project History</h2>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {projectHistoryItems.length === 0 ? (
                      <li className="text-slate-500">No history yet.</li>
                    ) : projectHistoryItems.slice(0, 4).map((entry) => (
                      <li key={entry.id} className="border-b border-slate-100 pb-1.5 last:border-b-0">
                        <p className="text-[10px] text-slate-500">{new Date(entry.occurredAt).toLocaleDateString('en-CA')}</p>
                        <p>{entry.summary}</p>
                      </li>
                    ))}
                  </ul>
                  {projectHistoryItems.length > 4 && (
                    <button type="button" onClick={() => setHistoryDialog({ title: 'Project History', type: 'project' })} className="mt-2 text-[11px] font-semibold text-blue-600 hover:underline">
                      Show all ({projectHistoryItems.length}{sidebarHasMore ? '+' : ''})
                    </button>
                  )}
                </section>
              ) : (
                <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                  <h2 className="text-xs font-semibold text-slate-900">Field History</h2>
                  <ul className="mt-2 space-y-2 text-xs text-slate-700">
                    {fieldHistoryItems.length === 0 ? (
                      <li className="text-slate-500">No field changes yet.</li>
                    ) : fieldHistoryItems.slice(0, 4).map((entry) => (
                      <li key={entry.id}>
                        <p className="text-xs text-slate-500">{new Date(entry.occurredAt).toLocaleDateString('en-CA')}</p>
                        <p>{entry.summary}</p>
                      </li>
                    ))}
                  </ul>
                  {fieldHistoryItems.length > 4 && (
                    <button type="button" onClick={() => setHistoryDialog({ title: 'Field History', type: 'field' })} className="mt-2 text-[11px] font-semibold text-blue-600 hover:underline">
                      Show all ({fieldHistoryItems.length}{sidebarHasMore ? '+' : ''})
                    </button>
                  )}
                </section>
              )}

              <FilesPanel
                projectId={projectId}
                files={projectFiles}
                uploading={uploadingProjectFiles}
                onPick={handleProjectFilesPicked}
                onAddLink={handleProjectFileLinkAdd}
                onDelete={handleDeleteProjectFile}
              />
            </aside>
          </div>
        </div>
      </main>

      <CreateTaskModal
        open={createModalOpen || isCreateRequested}
        onClose={() => setCreateModalOpen(false)}
        record={createTaskRecord}
      />

      {historyDialog && (
        <HistoryDialog
          title={historyDialog.title}
          projectId={projectId}
          type={historyDialog.type}
          onClose={() => setHistoryDialog(null)}
        />
      )}
    </div>
  )
}

function formatChatterDateTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function ActivityTimelinePane({
  items,
  loading,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}) {
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  const hodDisplayName = (value) => {
    if (!value) return '-'
    if (value === 'hod-1') return 'A. Khan'
    if (value === 'hod-2') return 'M. Rahman'
    return value
  }
  return (
    <div className="mt-3 space-y-3">
      {loading ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-md bg-slate-100" />
          <div className="h-14 animate-pulse rounded-md bg-slate-100" />
          <div className="h-14 animate-pulse rounded-md bg-slate-100" />
        </div>
      ) : null}
      {!loading && error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" className="ml-3 font-semibold underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No activity yet.
        </div>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-800">{item.summary}</p>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold ${
                    item.severity === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : item.severity === 'success'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {item.action}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {item.actor?.name ?? 'Unknown'} • {new Date(item.occurredAt).toLocaleString('en-GB')}
              </p>
              {item.task?.id ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTaskId((prev) => (prev === item.task.id ? null : item.task.id))
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {expandedTaskId === item.task.id ? 'Hide task details' : 'Show task details'}
                  </button>
                  {expandedTaskId === item.task.id ? (
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                      <p>
                        <span className="font-semibold text-slate-800">Task No:</span> {item.task.taskNo ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">OP No:</span> {item.task.opNo ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Project:</span>{' '}
                        {item.project?.name ?? '-'} ({item.project?.projectNo ?? '-'})
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Deadline:</span>{' '}
                        {item.task.dueDate ? new Date(item.task.dueDate).toLocaleDateString('en-GB') : '-'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Priority:</span> {item.task.priority ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Assigned Designer:</span>{' '}
                        {item.task.assigneeName ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">HOD:</span> {hodDisplayName(item.task.hodName)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {hasMore ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={onLoadMore}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Load more
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}


