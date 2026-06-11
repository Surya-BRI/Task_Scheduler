import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Ban, Calendar, CheckCircle2, ChevronLeft, CircleCheck, Clock3, FileText, Flag, Hourglass, Info, Link, Pause, Pencil, Shield, Trash2, Upload } from 'lucide-react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import DatePicker from 'react-datepicker'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { ProjectCreateTaskModal } from '../components/ProjectCreateTaskModal'
import { Navbar } from '../components/Navbar'
import { ProjectTaskTimer } from '../components/ProjectTaskTimer'
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
  { id: 'new',       label: 'Design Task New',   hint: 'Awaiting project allocation',   icon: Flag,         status: 'DESIGN_NEW' },
  { id: 'planned',   label: 'Design Planned',    hint: 'Task scheduled for production', icon: Clock3,       status: 'DESIGN_PLANNED' },
  { id: 'progress',  label: 'In Progress',       hint: 'Active design and drafting',    icon: Hourglass,    status: 'IN_PROGRESS' },
  { id: 'completed', label: 'Design Completed',  hint: 'Submitted for internal review', icon: CircleCheck,  status: 'DESIGN_COMPLETED' },
  { id: 'review',    label: 'HOD Review',        hint: 'Verified and approved by HOD',  icon: Shield,       status: 'HOD_REVIEW' },
  { id: 'sales',     label: 'Sales Review',      hint: 'Final sales and client check',  icon: Pencil,       status: 'SALES_REVIEW' },
  { id: 'rework',    label: 'Rework / Error',    hint: 'Corrections needed',            icon: Info,         status: 'REWORK' },
]

const SPECIAL_STATUS = {
  REVIEW_COMPLETED: { label: 'Completed',       hint: 'Task fully reviewed & closed', icon: CheckCircle2, border: 'border-emerald-400', bg: 'bg-emerald-50', iconBg: 'bg-emerald-500', text: 'text-emerald-800', hint2: 'text-emerald-600' },
  CLIENT_REJECTED:  { label: 'Client Rejected', hint: 'Rejected by client',           icon: Ban,          border: 'border-red-400',     bg: 'bg-red-50',     iconBg: 'bg-red-500',     text: 'text-red-800',     hint2: 'text-red-500' },
  ON_HOLD:          { label: 'On Hold',          hint: 'Task paused',                  icon: Pause,        border: 'border-amber-400',   bg: 'bg-amber-50',   iconBg: 'bg-amber-500',   text: 'text-amber-800',   hint2: 'text-amber-600' },
}

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'activity', label: 'Activity' },
  { id: 'chatter', label: 'Chatter' },
]
const PROJECT_TAB = { id: 'team', label: 'Team' }

const PROJECT_TABLE_ROWS = Array.from({ length: 15 }, (_, idx) => ({
  tNo: idx === 0 ? '1' : '',
  no: `${idx + 1}`,
  signType: 'B315',
  planCode: 'CP-2-344',
  estQty: '1',
  qsQty: '1',
  areaZone: 'CP',
  levelParcel: '2',
  sequence: '2344',
  status: 'Art Work IP',
  comment: '',
  contRef: `QE$294$59${70 + idx}`,
}))

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

function StagePill({ item, active }) {
  const Icon = item.icon
  return (
    <div className={`min-w-[148px] rounded-lg border px-2 py-1.5 transition-colors ${
      active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start gap-1.5">
        <div className={`mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full text-white ${
          active ? 'bg-blue-600' : 'bg-slate-900'
        }`}>
          <Icon className="h-2.5 w-2.5" />
        </div>
        <div>
          <p className={`text-[11px] font-semibold ${active ? 'text-blue-700' : 'text-slate-900'}`}>{item.label}</p>
          <p className="text-[10px] leading-tight text-slate-500">{item.hint}</p>
        </div>
      </div>
    </div>
  )
}

function SpecialStatusPill({ config }) {
  const Icon = config.icon
  return (
    <div className={`shrink-0 min-w-[148px] rounded-lg border px-2 py-1.5 ${config.border} ${config.bg}`}>
      <div className="flex items-start gap-1.5">
        <div className={`mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full text-white ${config.iconBg}`}>
          <Icon className="h-2.5 w-2.5" />
        </div>
        <div>
          <p className={`text-[11px] font-semibold ${config.text}`}>{config.label}</p>
          <p className={`text-[10px] leading-tight ${config.hint2}`}>{config.hint}</p>
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

function FormFieldWithPencil({ id, label, value, onChange, placeholder, type = 'text', min, icon: Icon = Pencil }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={type}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-9 text-[13px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400" aria-hidden>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

function DatePickerField({ id, label, selected, onChange, minDate }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <DatePicker
          id={id}
          selected={selected}
          onChange={onChange}
          minDate={minDate}
          dateFormat="dd/MM/yyyy"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          popperPlacement="bottom-start"
          calendarClassName="task-date-picker-calendar"
          wrapperClassName="task-date-picker-wrapper"
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-9 text-[13px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400" aria-hidden>
          <Calendar className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

function FilesPanel({ projectId, files, uploading, resolvingProjectId, onPick, onAddLink, onDelete }) {
  const fileInputRef = useRef(null)
  const [mode, setMode] = useState('link')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

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
              disabled={!projectId || uploading || resolvingProjectId}
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
          disabled={!projectId || uploading || resolvingProjectId}
          onClick={openFilePicker}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {resolvingProjectId ? 'Preparing Project...' : uploading ? 'Uploading...' : 'Upload Project Files'}
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

function ProjectDetailsTable() {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
      <div className="grid grid-cols-[0.5fr_0.5fr_0.8fr_0.5fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr] bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
        <div>T. No</div>
        <div>No</div>
        <div>Sign Type</div>
        <div>Image</div>
        <div>Plan Code</div>
        <div>Est QTY</div>
        <div>Qs QTY</div>
        <div>Area/ Zone</div>
        <div>Level/ Parcel</div>
        <div>Sequence</div>
        <div>Status</div>
        <div>Comment</div>
        <div>Cont. Ref</div>
      </div>
      <div className="max-h-[260px] overflow-auto">
        {PROJECT_TABLE_ROWS.map((row) => (
          <div key={row.no} className="grid grid-cols-[0.5fr_0.5fr_0.8fr_0.5fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr] items-center border-t border-slate-100 px-2 py-1 text-[11px] text-slate-800">
            <div>{row.tNo}</div>
            <div>{row.no}</div>
            <div>{row.signType}</div>
            <div>🏠</div>
            <div>
              <input value={row.planCode} readOnly className="h-5 w-full rounded border border-slate-300 px-2 text-[10px]" />
            </div>
            <div>{row.estQty}</div>
            <div>{row.qsQty}</div>
            <div>{row.areaZone}</div>
            <div>{row.levelParcel}</div>
            <div>{row.sequence}</div>
            <div>
              <span className="inline-flex rounded bg-teal-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{row.status}</span>
            </div>
            <div>
              <input readOnly value={row.comment} className="h-5 w-full rounded border border-slate-300 px-2 text-[10px]" />
            </div>
            <div className="truncate">{row.contRef}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityTimelinePane({
  mode,
  onModeChange,
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
      {onModeChange ? (
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => onModeChange('task')}
            className={`rounded px-3 py-1 text-xs font-semibold ${mode === 'task' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Task
          </button>
          <button
            type="button"
            onClick={() => onModeChange('project')}
            className={`rounded px-3 py-1 text-xs font-semibold ${mode === 'project' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Project
          </button>
        </div>
      ) : null}

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

function formatDdMmYyyy(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB')
}

function prettifyHodName(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'
  if (raw === 'hod-1') return 'A. Khan'
  if (raw === 'hod-2') return 'M. Rahman'
  return raw
}

function mapTaskToRecord(task) {
  if (!task) return null
  const project = task.project ?? {}
  const assetsMap = new Map()
  for (const line of task.retailDetails ?? []) {
    const providedNames = String(line?.providedFile ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    for (const name of providedNames) {
      if (!assetsMap.has(name)) assetsMap.set(name, { name, url: null })
    }
    for (const attachment of line?.attachments ?? []) {
      const name = String(attachment?.fileName ?? '').trim()
      if (!name) continue
      assetsMap.set(name, {
        name,
        url: attachment?.signedUrl ?? null,
      })
    }
  }
  for (const line of task.projectDetails ?? []) {
    for (const attachment of line?.attachments ?? []) {
      const name = String(attachment?.fileName ?? '').trim()
      if (!name) continue
      assetsMap.set(name, {
        name,
        url: attachment?.signedUrl ?? null,
      })
    }
  }
  const providedAssets = Array.from(assetsMap.values())
  const reviewerHodRaw =
    (task.retailDetails ?? []).find((line) => String(line?.hodName ?? '').trim())?.hodName ?? '-'
  const reviewerHod = prettifyHodName(reviewerHodRaw)
  const retailDesignTypes = [
    ...new Set(
      (task.retailDetails ?? [])
        .flatMap((line) => String(line?.designTypes ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    ),
  ]

  return {
    id: task.id,
    taskId: task.id,
    fromTaskApi: true,
    opNo: task.opNo ?? '-',
    projectNo: project.projectNo ?? '-',
    projectId: project.id ?? null,
    projectName: project.name ?? project.projectNo ?? 'Task',
    name: task.title ?? 'Task',
    taskDesignType: task.designType ?? null,
    retailDesignTypes,
    revisionCode: task.revisionCode ?? null,
    status: task.status ?? 'PENDING',
    priority: task.priority ?? '-',
    reviewerHod,
    providedAssets,
    designType: project.category ?? 'Project',
    businessUnit: project.category ?? 'Project',
    salesPerson: project.salesPerson ?? 'Unassigned',
    created: formatDdMmYyyy(task.createdAt),
    deadline: formatDdMmYyyy(task.dueDate ?? task.createdAt),
    clientName: null,
    client: null,
    technicalHead: task.technicalHead ?? '',
    teamLead: task.teamLead ?? '',
    subTeamLead: task.subTeamLead ?? '',
    designers: task.designers ?? '',
  }
}

function mapProjectListRowToRecord(row) {
  const createdOn = row?.created ?? row?.createdOn ?? null
  const dateLabel = formatDdMmYyyy(createdOn)
  return {
    id: String(row?.id ?? ''),
    taskId: row?.taskId ?? null,
    fromTaskApi: false,
    opNo: row?.salesForceCode ?? row?.opNo ?? '-',
    projectNo: row?.projectCode ?? row?.projectNo ?? '-',
    projectId: row?.projectId ?? row?.id ?? null,
    designType: row?.designType ?? row?.category ?? 'Project',
    businessUnit: row?.businessUnitCode ?? row?.businessUnit ?? 'Project',
    name: row?.projectName ?? row?.name ?? '-',
    status: row?.status ?? 'Pending',
    salesPerson: row?.salesPerson ?? 'Unassigned',
    created: dateLabel,
    deadline: dateLabel,
    agingDays: 0,
    clientName: row?.clientName ?? row?.customerName ?? null,
    projectName: row?.projectName ?? row?.name ?? null,
    client: row?.clientName ?? row?.customerName ?? null,
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}
const TASK_TAB_IDS = ['details', 'activity', 'chatter', 'team']
export function TaskDetailsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const routeId = params?.taskId ?? params?.id
  const queryOpNo = searchParams.get('opNo')
  const queryProjectCode = searchParams.get('projectCode')
  const queryDesignType = searchParams.get('designType')
  const from = searchParams.get('from')
  const recordId = routeId
  const [record, setRecord] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [projectCreateModalOpen, setProjectCreateModalOpen] = useState(false)
  const [createdTasks, setCreatedTasks] = useState([])
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
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const [dateIssued, setDateIssued] = useState(today)
  const [dateSubmission, setDateSubmission] = useState(tomorrow)
  const [technicalHead, setTechnicalHead] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [subTeamLead, setSubTeamLead] = useState('')
  const [designers, setDesigners] = useState('')
  const [teamSaving, setTeamSaving] = useState(false)
  const [signRows, setSignRows] = useState([])
  const [signRowsSaving, setSignRowsSaving] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [projectFiles, setProjectFiles] = useState([])
  const [uploadingProjectFiles, setUploadingProjectFiles] = useState(false)
  const [resolvingProjectId, setResolvingProjectId] = useState(false)
  const [resolvingTaskId, setResolvingTaskId] = useState(false)
  const mentionUsersRef = useRef([])
  const isCreationRoute = Boolean(pathname?.includes('-task-creation'))
  const [activityMode] = useState(isCreationRoute ? 'project' : 'task')
  const [activityItems, setActivityItems] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityCursor, setActivityCursor] = useState(null)
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [projectHistoryItems, setProjectHistoryItems] = useState([])
  const [fieldHistoryItems, setFieldHistoryItems] = useState([])
  const [sidebarHasMore, setSidebarHasMore] = useState(false)
  const [historyDialog, setHistoryDialog] = useState(null)
  const [taskAuditInfo, setTaskAuditInfo] = useState({ createdByHod: '-' })
  const [taskRefreshCounter, setTaskRefreshCounter] = useState(0)
  const [submittedSession, setSubmittedSession] = useState(null)

  useEffect(() => {
    let alive = true
    async function loadTask() {
      if (!recordId && !queryOpNo) {
        setRecord(null)
        return
      }
      try {
        const rawId = String(recordId ?? '').trim()
        const rawOpNo = String(queryOpNo ?? '').trim()
        const isProjectsListFlow = from === 'projects-list'
        const lookupProjectCode = isProjectsListFlow ? (String(queryProjectCode ?? '').trim() || rawId) : ''
        const lookupOpNo = isProjectsListFlow ? rawOpNo : rawOpNo
        let task = null
        if (!isProjectsListFlow && rawId && isUuid(rawId)) {
          task = await apiClient.get(`/tasks/${encodeURIComponent(rawId)}`)
        } else if (!isProjectsListFlow && rawId) {
          const result = await apiClient.get(`/tasks?search=${encodeURIComponent(rawId)}&limit=20`)
          const rows = result?.data ?? []
          task =
            rows.find((item) => String(item?.id ?? '') === rawId) ??
            rows.find((item) => String(item?.taskId ?? '') === rawId) ??
            rows.find((item) => String(item?.opNo ?? '') === rawId) ??
            null
        }
        if (!task && lookupOpNo) {
          const result = await apiClient.get(`/tasks?search=${encodeURIComponent(lookupOpNo)}&limit=20`)
          const rows = result?.data ?? []
          task = rows.find((item) => String(item?.opNo ?? '') === lookupOpNo) ?? rows[0] ?? null
        }
        if (task?.id && !task?.retailDetails && !task?.projectDetails) {
          try {
            task = await apiClient.get(`/tasks/${encodeURIComponent(task.id)}`)
          } catch {
            // Keep best-effort list payload if detail fetch fails.
          }
        }
        if (!task) {
          const projectLookupKey = lookupProjectCode || lookupOpNo || rawId
          if (projectLookupKey) {
            const projectRowsResponse = await apiClient.get(
              `/design-list/projects-list?page=1&limit=30&q=${encodeURIComponent(projectLookupKey)}`,
            )
            const projectRows = Array.isArray(projectRowsResponse?.data) ? projectRowsResponse.data : []
            // Exact projectCode match — trim both sides to handle ERP whitespace issues
            const projectRow =
              projectRows.find((row) => String(row?.projectCode ?? row?.projectNo ?? '').trim() === projectLookupKey) ??
              // Only fall back to salesForceCode match when NOT in projects-list flow
              // (projects-list flow passes designType in URL; salesForceCode fallback risks loading the wrong project)
              (!isProjectsListFlow
                ? projectRows.find((row) => String(row?.salesForceCode ?? row?.opNo ?? '') === projectLookupKey) ?? null
                : null)
            if (projectRow) {
              if (!alive) return
              const mapped = mapProjectListRowToRecord(projectRow)
              if (queryDesignType) mapped.designType = queryDesignType
              setRecord(mapped)
              return
            }
            if (isProjectsListFlow && queryDesignType) {
              if (!alive) return
              setRecord({
                id: rawId,
                taskId: null,
                fromTaskApi: false,
                opNo: lookupOpNo || '-',
                projectNo: lookupProjectCode || rawId,
                projectId: null,
                designType: queryDesignType,
                businessUnit: queryDesignType,
                name: lookupProjectCode || rawId,
                status: 'Pending',
                salesPerson: 'Unassigned',
                created: '',
                deadline: '',
                agingDays: 0,
                clientName: null,
                projectName: lookupProjectCode || null,
                client: null,
              })
              return
            }
          }
        }
        if (!alive) return
        setRecord(task ? mapTaskToRecord(task) : null)
      } catch {
        if (!alive) return
        setRecord(null)
      }
    }
    loadTask()
    return () => {
      alive = false
    }
  }, [recordId, queryOpNo, queryProjectCode, queryDesignType, from, taskRefreshCounter])


  const launchAutostart = searchParams.get('autostart') === '1'
  const launchPauseModal = searchParams.get('openPause') === '1'
  const launchCompleteModal = searchParams.get('openComplete') === '1'

  const clearTimerLaunchParams = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('autostart')
    next.delete('openPause')
    next.delete('openComplete')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const selectTaskTab = useCallback(
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

  const isRetail = record?.designType === 'Retail'
  const rawTab = searchParams.get('tab')
  const activeTab =
    TASK_TAB_IDS.includes(rawTab) && !(rawTab === 'team' && isRetail)
      ? rawTab
      : 'details'
  const backPath =
    from === 'project-design'
      ? '/project-design'
      : from === 'projects-list'
        ? '/projects-list'
        : from === 'design-scheduler'
          ? '/design-scheduler'
          : from === 'designer-queue' || from === 'designer-design-list'
            ? '/design-list/tasks'
          : '/design-list'
  const resolvedProjectName = record?.projectName ?? record?.name ?? ''
  const resolvedOpCode = String(record?.salesForceCode ?? record?.opNo ?? '').trim()
  const pageTitleCore = `${resolvedProjectName.toUpperCase()} @ ${(record?.businessUnit ?? '').toUpperCase()}`
  const pageTitle = resolvedOpCode ? `${resolvedOpCode} - ${pageTitleCore}` : pageTitleCore
  const taskIdReady = isChatterUuid(taskId)
  const canPostChatter =
    chatterMessage.trim().length > 0 && !resolvingProjectId && !resolvingTaskId
  const hasExistingTask = Boolean(taskId || isUuid(record?.taskId ?? record?.id))
  const taskStatus = record?.status ?? null
  const isTerminalStatus = taskStatus === 'COMPLETED' || taskStatus === 'APPROVED'
  const showTimer = !isCreationRoute && hasExistingTask && Boolean(taskId) && !isTerminalStatus && (from === 'designer-queue' || from === 'designer-design-list')
  const tabs = isCreationRoute && !isRetail ? [...TABS, PROJECT_TAB] : TABS
  useEffect(() => {
    let alive = true
    async function resolveProjectId() {
      setResolvingProjectId(true)
      const projectNo = record?.projectNo ?? record?.projectId
      if (!projectNo) {
        if (alive) setResolvingProjectId(false)
        return
      }
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectNo)) {
        setProjectId(projectNo)
        if (alive) setResolvingProjectId(false)
        return
      }
      try {
        const project = await apiClient.get(`/projects/by-project-no/${encodeURIComponent(projectNo)}`)
        if (!alive) return
        setProjectId(project?.id ?? '')
      } catch {
        if (!alive) return
        setProjectId('')
      } finally {
        if (alive) setResolvingProjectId(false)
      }
    }
    resolveProjectId()
    return () => {
      alive = false
    }
  }, [record?.projectNo, record?.projectId])

  useEffect(() => {
    let alive = true
    async function resolveTaskId() {
      if (!record) {
        if (alive) setTaskId('')
        return
      }
      setResolvingTaskId(true)
      try {
        const foundId = await resolveTaskIdForChatter({
          taskId: record.taskId,
          recordId: record.id,
          opNo: record.opNo,
          projectId,
          fromTaskApi: Boolean(record.fromTaskApi),
        })
        if (!alive) return
        setTaskId(foundId ?? '')
        if (foundId) {
          try {
            const fullTask = await apiClient.get(`/tasks/${encodeURIComponent(foundId)}`)
            if (!alive) return
            setRecord(mapTaskToRecord(fullTask))
          } catch {
            // keep existing record if detail fetch fails
          }
        }
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
  }, [record?.taskId, record?.id, record?.opNo, record?.fromTaskApi, projectId])

  useEffect(() => {
    if (!record) return
    setTechnicalHead(record.technicalHead ?? '')
    setTeamLead(record.teamLead ?? '')
    setSubTeamLead(record.subTeamLead ?? '')
    setDesigners(record.designers ?? '')
  }, [record])

  useEffect(() => {
    if (!taskId) { setSignRows([]); return }
    apiClient.get(`/tasks/${taskId}/sign-rows`).then((rows) => setSignRows(Array.isArray(rows) ? rows : [])).catch(() => setSignRows([]))
  }, [taskId])

  const PROJECT_FILE_ACTIONS = new Set(['PROJECT_FILE_UPLOADED', 'PROJECT_FILE_DELETED'])

  const fetchActivities = useCallback(
    async (opts = { append: false, cursor: null }) => {
      // Always fetch by projectId so project-wide file events are included,
      // then filter: keep events for this specific task + project file events
      if (!projectId) {
        setActivityItems([])
        setActivityCursor(null)
        setActivityHasMore(false)
        return
      }
      setActivityLoading(true)
      setActivityError('')
      try {
        const response = await fetchProjectActivities(projectId, { limit: 50, cursor: opts.cursor ?? undefined })
        const allItems = response?.data ?? []
        const filtered = isCreationRoute
          ? allItems  // creation route: show all project activity
          : allItems.filter(
              (item) =>
                PROJECT_FILE_ACTIONS.has(item.action) ||  // project-wide file events
                item.task?.id === taskId                   // this task's events
            )
        setActivityItems((prev) => (opts.append ? [...prev, ...filtered] : filtered))
        setActivityCursor(response?.pageInfo?.nextCursor ?? null)
        setActivityHasMore(Boolean(response?.pageInfo?.hasMore))
      } catch (error) {
        setActivityError(error instanceof Error ? error.message : 'Failed to load activity')
      } finally {
        setActivityLoading(false)
      }
    },
    [projectId, taskId, isCreationRoute],
  )

  useEffect(() => {
    if (activeTab !== 'activity') return
    fetchActivities({ append: false, cursor: null })
    const interval = setInterval(() => fetchActivities({ append: false, cursor: null }), 20000)
    return () => clearInterval(interval)
  }, [activeTab, activityMode, taskId, projectId, fetchActivities])

  useEffect(() => {
    let alive = true
    async function fetchTaskAuditInfo() {
      if (!taskId) {
        if (!alive) return
        setTaskAuditInfo({ createdByHod: '-' })
        return
      }
      try {
        const response = await fetchTaskActivities(taskId, { limit: 50 })
        const items = Array.isArray(response?.data) ? response.data : []
        const createdEvent = items.find((item) => item.action === 'TASK_CREATED')
        if (!alive) return
        setTaskAuditInfo({
          createdByHod: createdEvent?.actor?.name ?? '-',
        })
      } catch {
        if (!alive) return
        setTaskAuditInfo({ createdByHod: '-' })
      }
    }
    fetchTaskAuditInfo()
    return () => {
      alive = false
    }
  }, [taskId])

  useEffect(() => {
    if (!taskId || !isTerminalStatus) { setSubmittedSession(null); return }
    let alive = true
    apiClient.get(`/tasks/${taskId}/submitted-session`)
      .then((data) => { if (alive) setSubmittedSession(data) })
      .catch(() => { if (alive) setSubmittedSession(null) })
    return () => { alive = false }
  }, [taskId, isTerminalStatus])

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
      if (!silent) setChatterError('No task or project linked — chatter cannot load.')
      return
    }
    setChatterError('')
    if (!silent) setChatterLoading(true)
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
          taskId: record?.taskId,
          recordId: record?.id,
          opNo: record?.opNo,
          projectId,
          fromTaskApi: Boolean(record?.fromTaskApi),
        })
        if (resolvedTaskId) setTaskId(resolvedTaskId)
      } finally {
        setResolvingTaskId(false)
      }
    }
    const postProjectId =
      projectId || (isChatterUuid(record?.projectId) ? record.projectId : null)
    if (!resolvedTaskId && !postProjectId) {
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
        ...(resolvedTaskId ? { taskId: resolvedTaskId } : { projectId: postProjectId }),
      })
      setChatterMessage('')
      setChatterPriority('')
      setPostMentionUserIds([])
      setChatterPosts((prev) => {
        const next = [created, ...prev.filter((p) => p.id !== created.id)]
        next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        return next
      })
      emitChatterRefresh({
        taskId: resolvedTaskId ?? undefined,
        projectId: postProjectId ?? projectId,
        postId: created.id,
      })
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

  async function handleSaveTeam() {
    if (!taskId) return
    setTeamSaving(true)
    try {
      await apiClient.patch(`/tasks/${taskId}`, { technicalHead, teamLead, subTeamLead, designers })
    } finally {
      setTeamSaving(false)
    }
  }

  async function handleSaveSignRows() {
    if (!taskId) return
    setSignRowsSaving(true)
    try {
      const saved = await apiClient.put(`/tasks/${taskId}/sign-rows`, {
        rows: signRows.map(({ tNo, no, signType, planCode, estQty, qsQty, areaZone, levelParcel, sequence, status, comment, contRef }) => ({
          tNo: tNo || undefined,
          no: no || undefined,
          signType: signType || undefined,
          planCode: planCode || undefined,
          estQty: estQty !== '' && estQty != null ? Number(estQty) : undefined,
          qsQty: qsQty !== '' && qsQty != null ? Number(qsQty) : undefined,
          areaZone: areaZone || undefined,
          levelParcel: levelParcel || undefined,
          sequence: sequence || undefined,
          status: status || undefined,
          comment: comment || undefined,
          contRef: contRef || undefined,
        })),
      })
      setSignRows(Array.isArray(saved) ? saved : [])
    } finally {
      setSignRowsSaving(false)
    }
  }

  if (!record) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="h-[calc(100vh-128px)] w-full overflow-y-auto px-4 py-4 sm:px-6">
        <div className="w-full space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {pageTitle}
          </h1>

          <div className="flex items-start gap-2 pb-0.5">
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {STAGE_ITEMS.map((item) => (
                <StagePill key={item.id} item={item} active={record?.status === item.status} />
              ))}
            </div>
            {SPECIAL_STATUS[record?.status] ? (
              <SpecialStatusPill config={SPECIAL_STATUS[record.status]} />
            ) : null}
          </div>

          <div className="grid gap-2.5 lg:grid-cols-[1fr_265px]">
            <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="flex items-center gap-4">
                  {tabs.map((tab) => (
                    <TabButton
                      key={tab.id}
                      label={tab.label}
                      active={activeTab === tab.id}
                      onClick={() => selectTaskTab(tab.id)}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">OP NO: {record.opNo}</p>
              </div>

              {activeTab === 'details' ? (
                <>
                  <div className="mt-2.5 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-0.5">
                      <DetailRow label="Project Code" value={record.projectNo ?? '-'} />
                      <DetailRow label="Project Name" value={resolvedProjectName || '-'} />
                      <DetailRow label="OP Code" value={resolvedOpCode || '-'} />
                    </div>
                    <div className="space-y-0.5">
                      <DetailRow label="Sales Person" value={record.salesPerson ?? '-'} />
                      <DetailRow label="Business Unit" value={record.businessUnit ?? '-'} />
                    </div>
                  </div>

                  {(!isCreationRoute && hasExistingTask) ? (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-0.5">
                          <DetailRow
                            label="Design Type"
                            value={
                              Array.isArray(record.retailDesignTypes) && record.retailDesignTypes.length > 0
                                ? record.retailDesignTypes.join(', ')
                                : (record.taskDesignType ?? record.designType ?? '-')
                            }
                          />
                          <DetailRow label="Revision" value={record.revisionCode ?? '-'} />
                          <DetailRow label="Task Status" value={record.status ?? '-'} />
                          <DetailRow label="Priority Level" value={record.priority ?? '-'} />
                        </div>
                        <div className="space-y-0.5">
                          <DetailRow label="Created Date" value={record.created ?? '-'} />
                          <DetailRow label="Deadline" value={record.deadline ?? '-'} />
                          <DetailRow label="Created By (HOD)" value={taskAuditInfo.createdByHod} />
                          <DetailRow label="Reviewer HOD" value={record.reviewerHod ?? '-'} />
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <div className="grid grid-cols-[125px_1fr] gap-2 py-0.5">
                          <p className="text-[11px] text-slate-500">Provided Assets</p>
                          <div>
                            {Array.isArray(record.providedAssets) && record.providedAssets.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {record.providedAssets.map((asset) => (
                                  <div
                                    key={`${asset?.name ?? 'asset'}-${asset?.url ?? 'na'}`}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-800"
                                  >
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                    {asset?.url ? (
                                      <a
                                        href={asset.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="max-w-[260px] truncate font-medium text-blue-700 underline hover:text-blue-800"
                                        title={asset?.name}
                                      >
                                        {asset?.name}
                                      </a>
                                    ) : (
                                      <span className="max-w-[260px] truncate" title={asset?.name}>
                                        {asset?.name}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[13px] text-slate-500 italic">No assets available for task</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {showTimer ? (
                        <ProjectTaskTimer
                          taskId={taskId}
                          taskStatus={taskStatus}
                          launchAutostart={launchAutostart}
                          launchPauseModal={launchPauseModal}
                          launchCompleteModal={launchCompleteModal}
                          onConsumedLaunchFlags={clearTimerLaunchParams}
                          onSubmitComplete={() => setTaskRefreshCounter((c) => c + 1)}
                        />
                      ) : null}
                      {isTerminalStatus && submittedSession ? (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800">Work Submitted</span>
                            {submittedSession.submittedBy && (
                              <span className="text-xs text-slate-500">by {submittedSession.submittedBy}</span>
                            )}
                            {submittedSession.submittedAt && (
                              <span className="ml-auto text-[11px] text-slate-400">
                                {new Date(submittedSession.submittedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                            <div className="flex items-center gap-2">
                              <Clock3 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="text-xs text-slate-500 font-medium">Duration</span>
                              <span className="ml-auto font-mono text-sm font-semibold text-slate-800">
                                {(() => {
                                  const s = submittedSession.durationSeconds ?? 0
                                  const h = Math.floor(s / 3600)
                                  const m = Math.floor((s % 3600) / 60)
                                  const sec = s % 60
                                  return `${h}h ${m}m ${sec}s`
                                })()}
                              </span>
                            </div>
                            {(submittedSession.submissionLink || submittedSession.files?.length > 0) && (
                              <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="text-xs text-slate-500 font-medium">Submitted Docs</span>
                                </div>
                                <ul className="space-y-1">
                                  {submittedSession.submissionLink && (
                                    <li className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800">
                                      <Link className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                      <a
                                        href={submittedSession.submissionLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate text-blue-600 hover:underline"
                                        title={submittedSession.submissionLink}
                                      >
                                        {submittedSession.submissionLink}
                                      </a>
                                    </li>
                                  )}
                                  {submittedSession.files?.map((f, i) => (
                                    <li key={i} className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800">
                                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                      <span className="truncate" title={f.fileName}>{f.fileName}</span>
                                      {f.sizeBytes && (
                                        <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                                          {f.sizeBytes > 1024 * 1024
                                            ? `${(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                                            : `${Math.round(f.sizeBytes / 1024)} KB`}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {!isRetail ? (
                        <div className="mt-4 border-t border-slate-200 pt-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-700">Sign Rows</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSignRows((prev) => [...prev, { tNo: '', no: '', signType: '', planCode: '', estQty: '', qsQty: '', areaZone: '', levelParcel: '', sequence: '', status: '', comment: '', contRef: '' }])}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                              >
                                + Add Row
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveSignRows}
                                disabled={signRowsSaving}
                                className="rounded-md bg-[#10a6e3] px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-[#0f96cd] disabled:opacity-60"
                              >
                                {signRowsSaving ? 'Saving…' : 'Save Rows'}
                              </button>
                            </div>
                          </div>
                          <div className="overflow-auto rounded-md border border-slate-200">
                            <table className="w-full text-[11px]">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  {['T.No','No','Sign Type','Plan Code','Est QTY','Qs QTY','Area/Zone','Level/Parcel','Sequence','Status','Comment','Cont.Ref',''].map((h) => (
                                    <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {signRows.length === 0 ? (
                                  <tr><td colSpan={13} className="px-3 py-6 text-center text-slate-500">No rows yet. Click + Add Row.</td></tr>
                                ) : null}
                                {signRows.map((row, idx) => (
                                  <tr key={row.id ?? idx} className="hover:bg-slate-50">
                                    {['tNo','no','signType','planCode','estQty','qsQty','areaZone','levelParcel','sequence','status','comment','contRef'].map((field) => (
                                      <td key={field} className="px-1 py-0.5">
                                        <input
                                          value={row[field] ?? ''}
                                          onChange={(e) => setSignRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: e.target.value } : r))}
                                          className="h-6 w-full min-w-[60px] rounded border border-slate-200 px-1.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none"
                                        />
                                      </td>
                                    ))}
                                    <td className="px-1 py-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setSignRows((prev) => prev.filter((_, i) => i !== idx))}
                                        className="text-slate-400 hover:text-red-500"
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : isRetail ? (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <DatePickerField
                          id="retail-issued"
                          label="Date of Issued"
                          selected={dateIssued}
                          onChange={setDateIssued}
                          minDate={today}
                        />
                        <DatePickerField
                          id="retail-submission"
                          label="Date of Submission"
                          selected={dateSubmission}
                          onChange={setDateSubmission}
                          minDate={dateIssued && dateIssued > tomorrow ? dateIssued : tomorrow}
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
                  ) : (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <DatePickerField id="project-issued" label="Date of Issued" selected={dateIssued} onChange={setDateIssued} minDate={today} />
                        <DatePickerField
                          id="project-submission"
                          label="Date of Submission"
                          selected={dateSubmission}
                          onChange={setDateSubmission}
                          minDate={dateIssued && dateIssued > tomorrow ? dateIssued : tomorrow}
                        />
                      </div>
                      <ProjectDetailsTable />
                      <div className="mt-2.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setProjectCreateModalOpen(true)}
                          className="rounded-md bg-[#10a6e3] px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  )}

                  {(isCreationRoute || !hasExistingTask) && isRetail ? (
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
                  ) : null}
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

              {activeTab === 'team' && isCreationRoute && !isRetail ? (
                <div className="mt-3 space-y-2.5">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <FormFieldWithPencil id="team-technical-head" label="Technical Head" value={technicalHead} onChange={setTechnicalHead} placeholder="" />
                    <FormFieldWithPencil id="team-team-lead" label="Team Lead" value={teamLead} onChange={setTeamLead} placeholder="" />
                    <FormFieldWithPencil id="team-sub-team-lead" label="Sub Team Lead" value={subTeamLead} onChange={setSubTeamLead} placeholder="" />
                    <FormFieldWithPencil id="team-designers" label="Designers" value={designers} onChange={setDesigners} placeholder="" />
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
                    <p className="text-[11px] text-slate-400">Team will be assigned when the task is created.</p>
                    <button
                      type="button"
                      onClick={() => setProjectCreateModalOpen(true)}
                      className="rounded-md bg-[#10a6e3] px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Create
                    </button>
                  </div>
                </div>
              ) : null}

              {activeTab === 'chatter' ? (
                <div className="mt-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <label htmlFor="chatter-input" className="text-xs font-semibold text-slate-700">
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
                      {!projectId && !resolvingProjectId ? (
                        <p className="text-[11px] text-amber-600">No project linked — chatter unavailable</p>
                      ) : resolvingProjectId ? (
                        <p className="text-[11px] text-slate-400">Resolving project…</p>
                      ) : resolvingTaskId ? (
                        <p className="text-[11px] text-slate-400">Preparing chatter…</p>
                      ) : !taskIdReady && projectId ? (
                        <p className="text-[11px] text-slate-400">Posting to project discussion</p>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={handlePostChatter}
                        disabled={!canPostChatter || chatterSubmitting || resolvingProjectId || resolvingTaskId}
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
        {resolveEmbeddedChatterTitle(entry, record?.opNo, record?.projectNo)}
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
        resolvingProjectId={resolvingProjectId}
        onPick={handleProjectFilesPicked}
        onAddLink={handleProjectFileLinkAdd}
        onDelete={handleDeleteProjectFile}
      />
            </aside>
          </div>
        </div>
      </main>

      <CreateTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(task) => {
          setCreateModalOpen(false)
          if (task?.taskNo ?? task?.id) setCreatedTasks((prev) => [...prev, task?.taskNo ?? task?.id])
        }}
        submissionDate={dateSubmission}
        record={record}
      />
      <ProjectCreateTaskModal
        open={projectCreateModalOpen}
        onClose={() => setProjectCreateModalOpen(false)}
        onCreated={async (task) => {
          setProjectCreateModalOpen(false)
          if (task?.taskNo ?? task?.id) setCreatedTasks((prev) => [...prev, task?.taskNo ?? task?.id])
          const newTaskId = task?.id
          if (newTaskId && (technicalHead || teamLead || subTeamLead || designers)) {
            try {
              await apiClient.patch(`/tasks/${newTaskId}`, { technicalHead, teamLead, subTeamLead, designers })
            } catch {
              toast.error('Task created but team assignment failed — please edit the task to retry.')
            }
          }
        }}
        submissionDate={dateSubmission}
        record={record}
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


