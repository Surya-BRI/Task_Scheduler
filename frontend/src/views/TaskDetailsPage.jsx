import { useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, CircleCheck, Clock3, FileText, Flag, Hourglass, Info, Pencil, Shield, Trash2, Upload } from 'lucide-react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import DatePicker from 'react-datepicker'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { ProjectCreateTaskModal } from '../components/ProjectCreateTaskModal'
import { Navbar } from '../components/Navbar'
import { apiClient } from '@/lib/api-client'
import { fetchProjectActivities, fetchTaskActivities } from '@/features/team-activity/services/activities.api'
import { createChatterComment, createChatterPost, listChatterPosts } from '@/features/chatter/services/chatter-posts.api'

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

function FilesPanel({ projectId, files, uploading, resolvingProjectId, onPick, onDelete }) {
  const fileInputRef = useRef(null)

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Files</h2>
      <button
        type="button"
        disabled={!projectId || uploading || resolvingProjectId}
        onClick={openFilePicker}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload className="h-3.5 w-3.5" />
        {resolvingProjectId ? 'Preparing Project...' : uploading ? 'Uploading...' : 'Upload Project Files'}
      </button>
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

function mapTaskToRecord(task) {
  if (!task) return null
  const project = task.project ?? {}
  return {
    id: task.id,
    opNo: task.opNo ?? '-',
    projectNo: project.projectNo ?? '-',
    projectId: project.id ?? null,
    projectName: project.name ?? project.projectNo ?? 'Task',
    name: task.title ?? 'Task',
    designType: project.category ?? 'Project',
    businessUnit: project.category ?? 'Project',
    salesPerson: project.salesPerson ?? 'Unassigned',
    created: formatDdMmYyyy(task.createdAt),
    deadline: formatDdMmYyyy(task.dueDate ?? task.createdAt),
    clientName: null,
    client: null,
  }
}

function mapProjectListRowToRecord(row) {
  const createdOn = row?.created ?? row?.createdOn ?? new Date().toISOString()
  const createdDate = createdOn ? new Date(createdOn) : new Date()
  const dd = String(createdDate.getDate()).padStart(2, '0')
  const mm = String(createdDate.getMonth() + 1).padStart(2, '0')
  const yyyy = createdDate.getFullYear()
  const dateLabel = `${dd}/${mm}/${yyyy}`
  return {
    id: String(row?.id ?? ''),
    taskId: null,
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
  const from = searchParams.get('from')
  const recordId = routeId
  const [record, setRecord] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [projectCreateModalOpen, setProjectCreateModalOpen] = useState(false)
  const [chatterMessage, setChatterMessage] = useState('')
  const [chatterPosts, setChatterPosts] = useState([])
  const [chatterLoading, setChatterLoading] = useState(false)
  const [chatterError, setChatterError] = useState('')
  const [chatterSubmitting, setChatterSubmitting] = useState(false)
  const [commentByPostId, setCommentByPostId] = useState({})
  const [commentSubmittingPostId, setCommentSubmittingPostId] = useState('')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const [dateIssued, setDateIssued] = useState(today)
  const [dateSubmission, setDateSubmission] = useState(tomorrow)
  const [technicalHead, setTechnicalHead] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [subTeamLead, setSubTeamLead] = useState('')
  const [designers, setDesigners] = useState('')
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [projectFiles, setProjectFiles] = useState([])
  const [uploadingProjectFiles, setUploadingProjectFiles] = useState(false)
  const [resolvingProjectId, setResolvingProjectId] = useState(false)
  const [activityMode, setActivityMode] = useState('task')
  const [activityItems, setActivityItems] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityCursor, setActivityCursor] = useState(null)
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [projectHistoryItems, setProjectHistoryItems] = useState([])
  const [fieldHistoryItems, setFieldHistoryItems] = useState([])

  const isCreateRequested = searchParams.get('create') === '1'

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
        if (!task) {
          const projectLookupKey = lookupProjectCode || lookupOpNo || rawId
          if (projectLookupKey) {
            const projectRowsResponse = await apiClient.get(
              `/design-list/projects-list?page=1&limit=30&q=${encodeURIComponent(projectLookupKey)}`,
            )
            const projectRows = Array.isArray(projectRowsResponse?.data) ? projectRowsResponse.data : []
            const projectRow =
              projectRows.find((row) => String(row?.projectCode ?? row?.projectNo ?? '') === projectLookupKey) ??
              projectRows.find((row) => String(row?.salesForceCode ?? row?.opNo ?? '') === projectLookupKey) ??
              null
            if (projectRow) {
              if (!alive) return
              setRecord(mapProjectListRowToRecord(projectRow))
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
  }, [recordId, queryOpNo, queryProjectCode, from])

  useEffect(() => {
    if (!record) return
    if (!isCreateRequested) return
    const next = new URLSearchParams(searchParams.toString())
    next.delete('create')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [isCreateRequested, record, searchParams, pathname, router])

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
  const tabs = isRetail ? TABS : [...TABS, PROJECT_TAB]
  const backPath =
    from === 'project-design'
      ? '/project-design'
      : from === 'projects-list'
        ? '/projects-list'
        : from === 'design-scheduler'
          ? '/design-scheduler'
          : from === 'designer-queue' || from === 'designer-design-list'
            ? '/design-list/my-work'
          : '/design-list'
  const resolvedProjectName = record?.projectName ?? record?.name ?? ''
  const resolvedOpCode = String(record?.salesForceCode ?? record?.opNo ?? '').trim()
  const pageTitleCore = `${resolvedProjectName.toUpperCase()} @ ${(record?.businessUnit ?? '').toUpperCase()}`
  const pageTitle = resolvedOpCode ? `${resolvedOpCode} - ${pageTitleCore}` : pageTitleCore
  const canPostChatter = chatterMessage.trim().length > 0
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
      const raw = record?.taskId ?? record?.id
      if (raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
        setTaskId(raw)
        return
      }
      const opNo = record?.opNo
      if (!opNo) return
      try {
        const result = await apiClient.get(`/tasks?search=${encodeURIComponent(opNo)}&limit=20`)
        const rows = result?.data ?? []
        const exact = rows.find((task) => task.opNo === opNo && (!projectId || task.projectId === projectId))
        if (!alive) return
        setTaskId(exact?.id ?? rows[0]?.id ?? '')
      } catch {
        if (!alive) return
        setTaskId('')
      }
    }
    resolveTaskId()
    return () => {
      alive = false
    }
  }, [record?.taskId, record?.id, record?.opNo, projectId])

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
        const response = await fetchProjectActivities(projectId, { limit: 30 })
        const items = response?.data ?? []
        if (!alive) return
        setProjectHistoryItems(items.slice(0, 6))
        const fieldActions = new Set(['TASK_CREATED', 'ASSIGNED_TASK', 'STATUS_CHANGED'])
        setFieldHistoryItems(items.filter((item) => fieldActions.has(item.action)).slice(0, 6))
      } catch {
        if (!alive) return
        setProjectHistoryItems([])
        setFieldHistoryItems([])
      }
    }
    fetchSidebarHistory()
    return () => {
      alive = false
    }
  }, [projectId])

  const fetchChatterPosts = useCallback(async () => {
    if (!projectId) {
      setChatterPosts([])
      return
    }
    setChatterLoading(true)
    setChatterError('')
    try {
      const posts = await listChatterPosts({ projectId, limit: 200 })
      const normalized = Array.isArray(posts) ? [...posts] : []
      normalized.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setChatterPosts(normalized)
    } catch (error) {
      setChatterError(error instanceof Error ? error.message : 'Failed to load chatter')
      setChatterPosts([])
    } finally {
      setChatterLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (activeTab !== 'chatter') return
    fetchChatterPosts()
  }, [activeTab, fetchChatterPosts])

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

  async function handlePostChatter() {
    const message = chatterMessage.trim()
    if (!message || !projectId) return
    setChatterSubmitting(true)
    setChatterError('')
    try {
      await createChatterPost({
        message,
        postType: 'Posts',
        taskId: taskId || undefined,
      })
      setChatterMessage('')
      await fetchChatterPosts()
    } catch (error) {
      setChatterError(error instanceof Error ? error.message : 'Failed to post chatter')
    } finally {
      setChatterSubmitting(false)
    }
  }

  async function handlePostComment(postId) {
    const message = String(commentByPostId[postId] ?? '').trim()
    if (!postId || !message) return
    setCommentSubmittingPostId(postId)
    setChatterError('')
    try {
      await createChatterComment(postId, message)
      setCommentByPostId((prev) => ({ ...prev, [postId]: '' }))
      await fetchChatterPosts()
    } catch (error) {
      setChatterError(error instanceof Error ? error.message : 'Failed to post comment')
    } finally {
      setCommentSubmittingPostId('')
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

          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {STAGE_ITEMS.map((item) => (
              <StagePill key={item.id} item={item} />
            ))}
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

                  {isRetail ? (
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

                  {isRetail ? (
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
                  mode={activityMode}
                  onModeChange={(next) => {
                    setActivityMode(next)
                    setActivityCursor(null)
                  }}
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
                    <label htmlFor="chatter-input" className="text-xs font-semibold text-slate-700">
                      Message
                    </label>
                    <textarea
                      id="chatter-input"
                      value={chatterMessage}
                      onChange={(event) => setChatterMessage(event.target.value)}
                      rows={3}
                      placeholder="Type your comment..."
                      className="mt-1.5 w-full resize-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                    />
                    <div className="mt-1.5 flex justify-end">
                      <button
                        type="button"
                        onClick={handlePostChatter}
                        disabled={!canPostChatter || chatterSubmitting}
                        className="rounded-md bg-[#10a6e3] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f96cd] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {chatterSubmitting ? 'Posting...' : 'Post'}
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
                        <article key={entry.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800">
  <div className="flex items-start justify-between gap-2">
    <p className="text-[11px] font-semibold text-slate-800">
      {entry.authorName ? `${entry.authorName}${entry.authorRole ? ` (${entry.authorRole})` : ''}` : (entry.authorId ? `User ${entry.authorId.slice(0, 8)}` : 'Unknown')}
    </p>
    <p className="shrink-0 text-[10px] text-slate-500">{formatChatterDateTime(entry.createdAt)}</p>
  </div>
  <p className="mt-1">{entry.message}</p>
  <div className="mt-2 space-y-1">
    {(entry.comments ?? []).map((comment) => (
      <div key={comment.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold text-slate-700">
            {comment.authorName ? `${comment.authorName}${comment.authorRole ? ` (${comment.authorRole})` : ''}` : (comment.authorId ? `User ${comment.authorId.slice(0, 8)}` : 'Unknown')}
          </p>
          <p className="shrink-0 text-[10px] text-slate-500">{formatChatterDateTime(comment.createdAt)}</p>
        </div>
        <p className="mt-1">{comment.message}</p>
      </div>
    ))}
  </div>
  <div className="mt-2 flex gap-2">
                            <input
                              value={String(commentByPostId[entry.id] ?? '')}
                              onChange={(event) => setCommentByPostId((prev) => ({ ...prev, [entry.id]: event.target.value }))}
                              placeholder="Write a comment..."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handlePostComment(entry.id)}
                              disabled={commentSubmittingPostId === entry.id}
                              className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                            >
                              {commentSubmittingPostId === entry.id ? '...' : 'Reply'}
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === 'team' && !isRetail ? (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <FormFieldWithPencil id="team-technical-head" label="Technical Head" value={technicalHead} onChange={setTechnicalHead} placeholder="" />
                    <FormFieldWithPencil id="team-team-lead" label="Team Lead" value={teamLead} onChange={setTeamLead} placeholder="" />
                    <FormFieldWithPencil id="team-sub-team-lead" label="Sub Team Lead" value={subTeamLead} onChange={setSubTeamLead} placeholder="" />
                    <FormFieldWithPencil id="team-designers" label="Designers" value={designers} onChange={setDesigners} placeholder="" />
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
              ) : null}
            </section>

            <aside className="space-y-2.5">
              {activeTab !== 'chatter' ? (
                <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                  <h2 className="text-xs font-semibold text-slate-900">Project History</h2>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {projectHistoryItems.length === 0 ? (
                      <li className="text-slate-500">No history yet.</li>
                    ) : projectHistoryItems.map((entry) => (
                      <li key={entry.id} className="border-b border-slate-100 pb-1.5 last:border-b-0">
                        <p className="text-[10px] text-slate-500">{new Date(entry.occurredAt).toLocaleDateString('en-CA')}</p>
                        <p>{entry.summary}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                  <h2 className="text-xs font-semibold text-slate-900">Field History</h2>
                  <ul className="mt-2 space-y-2 text-xs text-slate-700">
                    {fieldHistoryItems.length === 0 ? (
                      <li className="text-slate-500">No field changes yet.</li>
                    ) : fieldHistoryItems.map((entry) => (
                      <li key={entry.id}>
                        <p className="text-xs text-slate-500">{new Date(entry.occurredAt).toLocaleDateString('en-CA')}</p>
                        <p>{entry.summary}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

      <FilesPanel
        projectId={projectId}
        files={projectFiles}
        uploading={uploadingProjectFiles}
        resolvingProjectId={resolvingProjectId}
        onPick={handleProjectFilesPicked}
        onDelete={handleDeleteProjectFile}
      />
            </aside>
          </div>
        </div>
      </main>

      <CreateTaskModal
        open={createModalOpen || (isCreateRequested && isRetail)}
        onClose={() => setCreateModalOpen(false)}
        submissionDate={dateSubmission}
        record={record}
      />
      <ProjectCreateTaskModal
        open={projectCreateModalOpen || (isCreateRequested && !isRetail)}
        onClose={() => setProjectCreateModalOpen(false)}
        submissionDate={dateSubmission}
        record={record}
      />
    </div>
  )
}


