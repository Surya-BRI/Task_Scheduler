import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Ban, Calendar, CheckCircle2, ChevronDown, ChevronLeft, CircleCheck, Clock3, ExternalLink, FileText, Flag, Hourglass, Info, Link, Pause, Pencil, RotateCcw, Shield, Trash2, Upload } from 'lucide-react'
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
  listChatterPostsForTask,
  normalizePriority,
  resolveEmbeddedChatterTitle,
} from '@/features/chatter/services/chatter-posts.api'
import { MentionTextarea } from '@/features/chatter/components/MentionTextarea'
import { EmbeddedChatterCommentComposer } from '@/features/chatter/components/EmbeddedChatterCommentComposer'
import { ChatterMentionText } from '@/features/chatter/components/ChatterMentionText'
import { parseMentionUserIdsFromMessage, resolveMentionUsersForDisplay } from '@/features/chatter/utils/mention-utils'
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
import { normalizeStatusCode, getStatusLabel } from '@/features/design-list/task-view-model'
import {
  FROM_DESIGN_LIST,
  FROM_DESIGNER_QUEUE,
  FROM_DESIGN_SCHEDULER,
  taskViewPathForRecord,
} from '@/lib/design-list-routes'
import { getSession } from '@/lib/mock-auth'

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

function friendlyError(error, fallback) {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('should not be empty') || msg.includes('must be an integer') || msg.includes('must be a number')) {
    return 'Please fill all required fields in each row before saving.'
  }
  return msg || fallback
}

function normalizeOptionalInteger(value, label, rowNumber) {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const number = Number(text)
  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be a whole number in row ${rowNumber}.`)
  }
  return number
}

const SIGN_ROW_SUBMIT_REQUIRED = [
  ['tNo', 'T.No'],
  ['no', 'No'],
  ['signType', 'Sign Type'],
  ['planCode', 'Plan Code'],
  ['estQty', 'Est QTY'],
  ['qsQty', 'QS QTY'],
  ['areaZone', 'Area/Zone'],
  ['levelParcel', 'Level/Parcel'],
  ['sequence', 'Sequence'],
  ['status', 'Status'],
  ['contRef', 'Cont.Ref'],
]

function normalizeSignRow(row, index) {
  return {
    id: row.id || undefined,
    tNo: String(row.tNo ?? '').trim(),
    no: String(row.no ?? '').trim(),
    signType: String(row.signType ?? '').trim(),
    planCode: String(row.planCode ?? '').trim(),
    estQty: normalizeOptionalInteger(row.estQty, 'Est QTY', index + 1),
    qsQty: normalizeOptionalInteger(row.qsQty, 'QS QTY', index + 1),
    areaZone: String(row.areaZone ?? '').trim(),
    levelParcel: String(row.levelParcel ?? '').trim(),
    sequence: String(row.sequence ?? '').trim(),
    status: String(row.status ?? '').trim(),
    comment: String(row.comment ?? '').trim() || undefined,
    contRef: String(row.contRef ?? '').trim(),
    signFamily: String(row.signFamily ?? '').trim() || undefined,
  }
}

function normalizeSignRowsForSave(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Add at least one sign row before saving.')
  }
  return rows.map((row, index) => normalizeSignRow(row, index))
}

function normalizeSignRowsForSubmit(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Add at least one complete sign row before submitting.')
  }
  return rows.map((row, index) => {
    for (const [field, label] of SIGN_ROW_SUBMIT_REQUIRED) {
      const value = row[field]
      if (value === null || value === undefined || String(value).trim() === '') {
        throw new Error(`${label} is required in row ${index + 1}.`)
      }
    }
    return normalizeSignRow(row, index)
  })
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
  CLIENT_ACCEPTED:  { label: 'Client Accepted', hint: 'Task accepted by client',       icon: CheckCircle2, border: 'border-emerald-400', bg: 'bg-emerald-50', iconBg: 'bg-emerald-500', text: 'text-emerald-800', hint2: 'text-emerald-600' },
  CLIENT_REJECTED:  { label: 'Client Rejected', hint: 'Rejected by client',           icon: Ban,          border: 'border-red-400',     bg: 'bg-red-50',     iconBg: 'bg-red-500',     text: 'text-red-800',     hint2: 'text-red-500' },
  ON_HOLD:          { label: 'On Hold',          hint: 'Task paused',                  icon: Pause,        border: 'border-amber-400',   bg: 'bg-amber-50',   iconBg: 'bg-amber-500',   text: 'text-amber-800',   hint2: 'text-amber-600' },
}

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'activity', label: 'Activity' },
  { id: 'chatter', label: 'Chatter' },
]
const PROJECT_TAB = { id: 'team', label: 'Team' }
const REWORK_TAB = { id: 'rework', label: 'Rework Instructions' }


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

function FieldSelect({ id, label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-2.5 text-[13px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
      >
        <option value="">— Select —</option>
        {options.map((u) => (
          <option key={u.id} value={u.fullName}>{u.fullName}</option>
        ))}
      </select>
    </div>
  )
}

function FieldMultiSelect({ id, label, value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function toggleOption(fullName) {
    if (value.includes(fullName)) {
      onChange(value.filter((v) => v !== fullName))
    } else {
      onChange([...value, fullName])
    }
  }

  return (
    <div ref={containerRef}>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-2.5 text-[13px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
      >
        <span className={`truncate text-left ${value.length === 0 ? 'text-slate-400' : ''}`}>
          {value.length > 0 ? value.join(', ') : '— Select —'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-slate-300 bg-white shadow-lg">
          {options.length === 0 ? (
            <p className="px-2.5 py-1.5 text-[12px] text-slate-400">No designers available</p>
          ) : (
            options.map((u) => (
              <label key={u.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-slate-800 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.includes(u.fullName)}
                  onChange={() => toggleOption(u.fullName)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/25"
                />
                {u.fullName}
              </label>
            ))
          )}
        </div>
      ) : null}
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
      <div className="mt-2 inline-flex rounded-md border border-blue-500 bg-blue-50 p-1 text-xs">
        <button type="button" onClick={() => setMode('link')} className={`rounded px-2 py-1 font-semibold transition-colors ${mode === 'link' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Paste Link</button>
        <button type="button" onClick={() => setMode('browse')} className={`rounded px-2 py-1 font-semibold transition-colors ${mode === 'browse' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Browse Files</button>
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
                      {item.task.hodName ? (
                        <p>
                          <span className="font-semibold text-slate-800">HOD:</span> {hodDisplayName(item.task.hodName)}
                        </p>
                      ) : null}
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
    status: normalizeStatusCode(task.status ?? 'PENDING'),
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
    assignedTo: task.assignee?.fullName
      || (task.taskDesigners?.length > 0 ? task.taskDesigners.map(d => d.designer.fullName).join(', ') : 'Unassigned'),
    projectDetails: task.projectDetails ?? [],
    disciplineType: task.disciplineType ?? null,
    signType: task.signType ?? null,
    signFamily: task.signFamily ?? null,
    reworkNote: task.reworkNote ?? null,
    reworkAttachmentUrl: task.reworkAttachmentUrl ?? null,
    reworkAttachmentName: task.reworkAttachmentName ?? null,
    reworkLinkUrl: task.reworkLinkUrl ?? null,
    reworkLinkName: task.reworkLinkName ?? null,
    previousRevisionTaskId: task.previousRevisionTaskId ?? null,
  }
}

function mapProjectListRowToRecord(row) {
  const createdOn = row?.created ?? row?.createdOn ?? null
  const dateLabel = formatDdMmYyyy(createdOn)
  return {
    id: String(row?.id ?? ''),
    taskId: row?.taskId ?? null,
    fromTaskApi: false,
    opNo: row?.salesForceCode ?? row?.opNo ?? row?.projectCode ?? row?.projectNo ?? '-',
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

function getTaskStatusBadgeClass(normalizedStatus) {
  switch (normalizedStatus) {
    case 'IN_PROGRESS':      return 'bg-blue-100 text-blue-700'
    case 'DESIGN_COMPLETED': return 'bg-emerald-100 text-emerald-700'
    case 'CLIENT_ACCEPTED':  return 'bg-emerald-100 text-emerald-700'
    case 'HOD_REVIEW':       return 'bg-violet-100 text-violet-700'
    case 'SALES_REVIEW':     return 'bg-indigo-100 text-indigo-700'
    case 'REWORK':           return 'bg-red-100 text-red-700'
    case 'ON_HOLD':          return 'bg-amber-100 text-amber-700'
    case 'DESIGN_PLANNED':   return 'bg-sky-100 text-sky-700'
    default:                 return 'bg-slate-100 text-slate-600'
  }
}

const DISCIPLINE_PILL_CLASSES = {
  Artwork:   'bg-blue-100 text-blue-700',
  Technical: 'bg-orange-100 text-orange-700',
  Location:  'bg-green-100 text-green-700',
  'As-Built':'bg-purple-100 text-purple-700',
  BIM:       'bg-teal-100 text-teal-700',
}

function DisciplinePill({ type }) {
  if (!type) return <span className="text-slate-400">—</span>
  const cls = DISCIPLINE_PILL_CLASSES[type] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {type}
    </span>
  )
}

function ProjectTaskList({ tasks, loading, onView }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700">Task List</h3>
        <span className="text-[11px] text-slate-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-200">
        <div className="grid grid-cols-[1.2fr_0.5fr_1fr_0.9fr_1fr_1fr_80px_44px] bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
          <div>Task No</div>
          <div>Revision</div>
          <div>Sign Family</div>
          <div>Type</div>
          <div>Status</div>
          <div>Designer</div>
          <div>Due Date</div>
          <div />
        </div>
        {loading ? (
          <div className="space-y-1.5 px-3 py-3">
            <div className="h-7 animate-pulse rounded bg-slate-100" />
            <div className="h-7 animate-pulse rounded bg-slate-100" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-3 py-5 text-center text-xs text-slate-500">No tasks yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const normalized = normalizeStatusCode(task.status)
              return (
                <li
                  key={task.id}
                  className="grid grid-cols-[1.2fr_0.5fr_1fr_0.9fr_1fr_1fr_80px_44px] items-center px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{task.taskNo || '—'}</span>
                    {task.signType && <span className="block truncate text-[10px] text-slate-400">{task.signType}</span>}
                  </span>
                  <span>{task.revisionCode || '—'}</span>
                  <span className="truncate text-slate-600">{task.signFamily || '—'}</span>
                  <span><DisciplinePill type={task.disciplineType} /></span>
                  <span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${getTaskStatusBadgeClass(normalized)}`}>
                      {getStatusLabel(task.status)}
                    </span>
                  </span>
                  <span className="truncate">
                    {task.assignee?.fullName ||
                      (task.taskDesigners?.length > 0
                        ? task.taskDesigners.map(d => d.designer.fullName).join(', ')
                        : 'Unassigned')}
                  </span>
                  <span className="text-slate-500">{task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB') : '—'}</span>
                  <button
                    type="button"
                    onClick={() => onView(task)}
                    className="mr-2 w-fit rounded-md bg-[#10a6e3] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#0f96cd]"
                  >
                    View
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

const TASK_TAB_IDS = ['details', 'activity', 'chatter', 'team', 'rework']
const DESIGN_WORKFLOW_SOURCES = new Set([
  FROM_DESIGN_LIST,
  FROM_DESIGNER_QUEUE,
  FROM_DESIGN_SCHEDULER,
  'designer-design-list',
])
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
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false)
  const [reworkNote, setReworkNote] = useState('')
  const [reworkSubmitting, setReworkSubmitting] = useState(false)
  const [reworkFile, setReworkFile] = useState(null) // { url, name } | null
  const [reworkFileUploading, setReworkFileUploading] = useState(false)
  const [reworkLink, setReworkLink] = useState({ url: '', name: '' })
  const [reworkRefMode, setReworkRefMode] = useState('file') // 'file' | 'link'
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
  const [dateSubmission, setDateSubmission] = useState(tomorrow)
  const [technicalHead, setTechnicalHead] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [subTeamLead, setSubTeamLead] = useState('')
  const [selectedDesigners, setSelectedDesigners] = useState([])
  const [savedTeamSnapshot, setSavedTeamSnapshot] = useState(null)
  const [teamSaving, setTeamSaving] = useState(false)
  const [hodUsers, setHodUsers] = useState([])
  const [designerUsers, setDesignerUsers] = useState([])
  const [signRows, setSignRows] = useState([])
  const [signRowsLoading, setSignRowsLoading] = useState(false)
  const [signRowsSaving, setSignRowsSaving] = useState(false)
  const [qsStatus, setQsStatus] = useState(null)
  const [qsSubmitting, setQsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { idx, family }
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [projectFiles, setProjectFiles] = useState([])
  const [uploadingProjectFiles, setUploadingProjectFiles] = useState(false)
  const [projectTasks, setProjectTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
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
  const [prevRevisionSession, setPrevRevisionSession] = useState(null)
  const [prevRevisionLoading, setPrevRevisionLoading] = useState(false)

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
          try {
            task = await apiClient.get(`/tasks/${encodeURIComponent(rawId)}`)
          } catch {
            const project = await apiClient.get(`/projects/${encodeURIComponent(rawId)}`)
            const projectTasks = Array.isArray(project?.tasks) ? project.tasks : []
            const reviewTask = projectTasks[0] ?? null
            if (reviewTask?.id) {
              task = await apiClient.get(`/tasks/${encodeURIComponent(reviewTask.id)}`)
            } else if (project?.id) {
              if (!alive) return
              setRecord(mapProjectListRowToRecord({
                ...project,
                projectCode: project.projectNo,
                projectName: project.name,
                category: project.category,
              }))
              return
            }
          }
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

  const handleStatusChange = useCallback(async (newStatus, reworkNote, reworkFileArg, reworkLinkArg) => {
    if (!taskId) return
    try {
      const res = await apiClient.patch(`/tasks/${taskId}/status`, {
        status: newStatus,
        ...(reworkNote ? { reworkNote } : {}),
        ...(reworkFileArg?.url ? { reworkAttachmentUrl: reworkFileArg.url, reworkAttachmentName: reworkFileArg.name } : {}),
        ...(reworkLinkArg?.url ? { reworkLinkUrl: reworkLinkArg.url, reworkLinkName: reworkLinkArg.name } : {}),
      })
      if (newStatus === 'REWORK' && res?.newRevisionTaskNo) {
        toast.success(`Rework issued — revision ${res.newRevisionTaskNo} created and queued for assignment.`)
      } else if (newStatus === 'REWORK') {
        toast.error('Rework issued but revision task creation failed — check backend logs.')
      }
      setTaskRefreshCounter((c) => c + 1)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Status update failed'
      toast.error(msg)
      setTaskRefreshCounter((c) => c + 1)
    }
  }, [taskId])

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
        : from === 'qs'
          ? '/qs/projects'
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
  const isTerminalStatus = taskStatus === 'CLIENT_ACCEPTED' || taskStatus === 'CLIENT_REJECTED'
  const isPostSubmitStatus = ['DESIGN_COMPLETED', 'HOD_REVIEW', 'SALES_REVIEW', 'REWORK', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ON_HOLD'].includes(taskStatus)
  const TIMER_ACTIVE_STATUSES = ['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK']
  const showTimer = !isCreationRoute && hasExistingTask && Boolean(taskId) && TIMER_ACTIVE_STATUSES.includes(taskStatus) && (from === 'designer-queue' || from === 'designer-design-list')
  const _session = getSession()
  const isHod = ['HOD', 'ADMIN', 'PROJECT_MANAGER'].includes(_session?.role ?? '')
  const isSales = _session?.role === 'SALESPERSON'
  const isDesigner = _session?.role === 'DESIGNER'
  const normalizedQsStatus = String(qsStatus?.status ?? '').trim().toLowerCase()
  const isQsCompleted = normalizedQsStatus === 'completed'
  const isQs = _session?.role === 'QS'
  const isQsReadOnly = isQsCompleted || !isQs
  const isProjectTeamComplete =
    Boolean(technicalHead.trim()) &&
    Boolean(teamLead.trim()) &&
    Boolean(subTeamLead.trim()) &&
    selectedDesigners.length > 0
  const isProjectTeamSaved =
    Boolean(savedTeamSnapshot) &&
    savedTeamSnapshot.technicalHead === technicalHead &&
    savedTeamSnapshot.teamLead === teamLead &&
    savedTeamSnapshot.subTeamLead === subTeamLead &&
    savedTeamSnapshot.designers.length === selectedDesigners.length &&
    savedTeamSnapshot.designers.every((d) => selectedDesigners.includes(d))
  const canCreateProjectTasks = isProjectTeamComplete && isProjectTeamSaved
  const projectTaskCreateGateMessage = canCreateProjectTasks
    ? 'Team assigned. You can create tasks now.'
    : 'Set and save the full team before creating tasks.'
  const hasReworkInstructions = Boolean(record?.previousRevisionTaskId)
  const showWorkflowStatusBlocks =
    DESIGN_WORKFLOW_SOURCES.has(from) || Boolean(pathname?.startsWith('/task-summary/'))
  const baseTabs = isCreationRoute && !isRetail ? [...TABS, PROJECT_TAB] : TABS
  const tabs = hasReworkInstructions ? [...baseTabs, REWORK_TAB] : baseTabs
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
        if (isCreationRoute && !isRetail) {
          const loadedTechnicalHead = project?.technicalHead ?? ''
          const loadedTeamLead = project?.teamLead ?? ''
          const loadedSubTeamLead = project?.subTeamLead ?? ''
          const loadedDesigners = String(project?.designers ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          setTechnicalHead(loadedTechnicalHead)
          setTeamLead(loadedTeamLead)
          setSubTeamLead(loadedSubTeamLead)
          setSelectedDesigners(loadedDesigners)
          setSavedTeamSnapshot({
            technicalHead: loadedTechnicalHead,
            teamLead: loadedTeamLead,
            subTeamLead: loadedSubTeamLead,
            designers: loadedDesigners,
          })
        }
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
    if (!isCreationRoute || isQs) return
    apiClient
      .get('/users?role=HOD&limit=200')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        setHodUsers(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
    apiClient
      .get('/users?role=DESIGNER&limit=200')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        setDesignerUsers(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
  }, [isCreationRoute, isQs])

  const leadOptions = useMemo(() => {
    const seen = new Set()
    const merged = []
    for (const u of [...hodUsers, ...designerUsers]) {
      if (!u?.id || seen.has(u.id)) continue
      seen.add(u.id)
      merged.push(u)
    }
    return merged
  }, [hodUsers, designerUsers])

  useEffect(() => {
    let alive = true
    async function resolveTaskId() {
      const routeTaskId = routeId && isUuid(String(routeId).trim()) ? String(routeId).trim() : null
      if (!record) {
        if (alive) setTaskId(routeTaskId ?? '')
        return
      }
      setResolvingTaskId(true)
      try {
        const foundId = await resolveTaskIdForChatter({
          taskId: record.taskId ?? routeTaskId,
          recordId: record.id,
          opNo: record.opNo,
          projectId,
          fromTaskApi: Boolean(record.fromTaskApi),
        })
        if (!alive) return
        setTaskId(foundId ?? routeTaskId ?? '')
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
  }, [record?.taskId, record?.id, record?.opNo, record?.fromTaskApi, projectId, routeId])

  useEffect(() => {
    if (!record || isCreationRoute) return
    setTechnicalHead(record.technicalHead ?? '')
    setTeamLead(record.teamLead ?? '')
    setSubTeamLead(record.subTeamLead ?? '')
  }, [record, isCreationRoute])

  const resolvedOpNo = String(record?.salesForceCode ?? record?.opNo ?? '').trim() || null

  useEffect(() => {
    if (!projectId) {
      setSignRows([])
      setQsStatus(null)
      return
    }
    let alive = true
    setSignRowsLoading(true)
    Promise.all([
      apiClient.get(`/projects/${projectId}/sign-rows`).catch(() => []),
      apiClient.get(`/projects/${projectId}/qs-status`).catch(() => null),
    ]).then(async ([rows, status]) => {
      if (!alive) return
      let initialRows = Array.isArray(rows) ? rows : []

      if (initialRows.length === 0 && resolvedOpNo && isQs) {
        try {
          const groups = await apiClient.get(`/design-list/project-sign-types?salesForceCode=${encodeURIComponent(resolvedOpNo)}`)
          if (alive && Array.isArray(groups) && groups.length > 0) {
            let idx = 1
            initialRows = []
            for (const group of groups) {
              for (const st of group.signTypes ?? []) {
                initialRows.push({
                  no: String(idx++),
                  signFamily: group.signfamily ?? '',
                  signType: st.signCode ?? '',
                  estQty: st.quantity ?? '',
                  areaZone: st.area ? String(st.area) : '',
                  status: st.estimationStatus ?? '',
                  comment: st.description ?? '',
                  tNo: '',
                  planCode: '',
                  qsQty: '',
                  levelParcel: '',
                  sequence: '',
                  contRef: '',
                })
              }
            }
          }
        } catch {
          // leave empty if ERP unavailable
        }
      }

      setSignRows(initialRows)
      setQsStatus(status)
      if (alive) setSignRowsLoading(false)
    })
    return () => {
      alive = false
    }
  }, [projectId, resolvedOpNo])

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
    if (!taskId || !isPostSubmitStatus) { setSubmittedSession(null); return }
    let alive = true
    apiClient.get(`/tasks/${taskId}/submitted-session`)
      .then((data) => { if (alive) setSubmittedSession(data) })
      .catch(() => { if (alive) setSubmittedSession(null) })
    return () => { alive = false }
  }, [taskId, isPostSubmitStatus])

  useEffect(() => {
    const prevId = record?.previousRevisionTaskId
    if (!prevId) { setPrevRevisionSession(null); return }
    let alive = true
    setPrevRevisionLoading(true)
    apiClient.get(`/tasks/${prevId}/submitted-session`)
      .then((data) => { if (alive) setPrevRevisionSession(data ?? null) })
      .catch(() => { if (alive) setPrevRevisionSession(null) })
      .finally(() => { if (alive) setPrevRevisionLoading(false) })
    return () => { alive = false }
  }, [record?.previousRevisionTaskId])

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
  const recordOpNo = record?.opNo ?? null

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
      let posts
      if (queryTaskId) {
        posts = await listChatterPostsForTask({
          taskId: queryTaskId,
          projectId,
          taskOpNo: recordOpNo,
          limit: 200,
        })
      } else {
        const res = await listChatterPosts({ projectId, limit: 200 })
        posts = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
      }
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
  }, [projectId, taskId, recordOpNo])

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

  const fetchProjectTasks = useCallback(async () => {
    if (!projectId) return
    setTasksLoading(true)
    try {
      const result = await apiClient.get(`/tasks?projectId=${projectId}&limit=100&page=1`)
      setProjectTasks(result?.data ?? [])
    } catch {
      setProjectTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchProjectTasks()
  }, [fetchProjectTasks])

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
    if (!projectId) return
    setTeamSaving(true)
    try {
      const designersValue = selectedDesigners.join(', ')
      await apiClient.patch(`/projects/${projectId}`, {
        technicalHead,
        teamLead,
        subTeamLead,
        designers: designersValue,
      })
      setSavedTeamSnapshot({ technicalHead, teamLead, subTeamLead, designers: [...selectedDesigners] })
      toast.success('Team saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save team')
    } finally {
      setTeamSaving(false)
    }
  }

  async function handleSaveSignRows() {
    if (!projectId) return
    if (isQsReadOnly) {
      toast.error('Completed QS projects are read-only.')
      return
    }
    setSignRowsSaving(true)
    try {
      const rows = normalizeSignRowsForSave(signRows)
      const saved = await apiClient.put(`/projects/${projectId}/sign-rows`, {
        rows,
      })
      const verified = await apiClient.get(`/projects/${projectId}/sign-rows`)
      const status = await apiClient.get(`/projects/${projectId}/qs-status`).catch(() => null)
      const nextRows = Array.isArray(verified) ? verified : (Array.isArray(saved) ? saved : [])
      setSignRows(nextRows)
      if (status) setQsStatus(status)
      if (nextRows.length !== rows.length) {
        throw new Error('Sign Family rows were saved but could not be verified. Please refresh and check again.')
      }
      toast.success(`Sign Family rows saved (${nextRows.length}).`)
      await fetchActivities({ append: false, cursor: null })
    } catch (error) {
      toast.error(friendlyError(error, 'Failed to save sign rows'))
    } finally {
      setSignRowsSaving(false)
    }
  }

  async function handleSubmitQsUpdate() {
    if (!projectId) return
    if (isQsReadOnly) {
      toast.error('This QS update has already been submitted.')
      return
    }
    setQsSubmitting(true)
    try {
      const rows = normalizeSignRowsForSubmit(signRows)
      const response = await apiClient.post(`/projects/${projectId}/qs-submit`, { rows })
      const nextRows = Array.isArray(response?.rows) ? response.rows : await apiClient.get(`/projects/${projectId}/sign-rows`)
      setSignRows(Array.isArray(nextRows) ? nextRows : [])
      setQsStatus(response?.qsStatus ?? { status: response?.status ?? 'Completed' })
      toast.success('QS update submitted. Project is now read-only.')
      await fetchActivities({ append: false, cursor: null })
    } catch (error) {
      toast.error(friendlyError(error, 'Failed to submit QS update'))
    } finally {
      setQsSubmitting(false)
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

          {showWorkflowStatusBlocks ? (
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
          ) : null}


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
                          <DetailRow
                            label="Assigned Hours"
                            value={(() => {
                              if (record.hoursRequired > 0) return `${record.hoursRequired}h`
                              const total = Array.isArray(record.projectDetails)
                                ? record.projectDetails.reduce((sum, d) =>
                                    sum + (Number(d.artworkHours) || 0) + (Number(d.technicalHours) || 0) +
                                    (Number(d.locationHours) || 0) + (Number(d.asBuiltHours) || 0), 0)
                                : 0
                              return total > 0 ? `${total}h` : '-'
                            })()}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <DetailRow label="Created Date" value={record.created ?? '-'} />
                          <DetailRow label="Deadline" value={record.deadline ?? '-'} />
                          <DetailRow label="Created By (HOD)" value={taskAuditInfo.createdByHod} />
                          <DetailRow label="Reviewer HOD" value={record.reviewerHod ?? '-'} />
                          <DetailRow label="Assigned To" value={record.assignedTo ?? 'Unassigned'} />
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
                          onStatusChange={() => setTaskRefreshCounter((c) => c + 1)}
                        />
                      ) : null}
                      {isPostSubmitStatus && submittedSession ? (
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
                                      {f.fileUrl ? (
                                        <a
                                          href={f.fileUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="truncate text-blue-600 hover:underline"
                                          title={f.fileName}
                                        >
                                          {f.fileName}
                                        </a>
                                      ) : (
                                        <span className="truncate" title={f.fileName}>{f.fileName}</span>
                                      )}
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
                      {/* HOD action panel — any active stage except SALES_REVIEW (which belongs to salesperson) */}
                      {isHod && !isTerminalStatus &&
                        taskStatus !== 'SALES_REVIEW' &&
                        !(taskStatus === 'ON_HOLD' && record?.holdPreviousStatus === 'SALES_REVIEW')
                      && (
                        <div className="mt-4 pt-3 border-t border-slate-200">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Move Status</p>
                          <div className="flex flex-wrap gap-2">
                            {taskStatus === 'DESIGN_COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange('HOD_REVIEW')}
                                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
                              >
                                Start HOD Review
                              </button>
                            )}
                            {taskStatus === 'HOD_REVIEW' && (<>
                              <button type="button" onClick={() => handleStatusChange('SALES_REVIEW')} className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition-colors">Send to Sales</button>
                            </>)}
                            {taskStatus === 'ON_HOLD' && (
                              <button type="button" onClick={() => handleStatusChange(record?.holdPreviousStatus || 'HOD_REVIEW')} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors">Resume</button>
                            )}
                            {taskStatus !== 'ON_HOLD' && (
                              <button type="button" onClick={() => handleStatusChange('ON_HOLD')} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Put On Hold</button>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Salesperson action panel — SALES_REVIEW, CLIENT_REJECTED, and ON_HOLD parked from SALES_REVIEW */}
                      {isSales && (
                        taskStatus === 'SALES_REVIEW' ||
                        taskStatus === 'CLIENT_REJECTED' ||
                        (taskStatus === 'ON_HOLD' && record?.holdPreviousStatus === 'SALES_REVIEW')
                      ) && (
                        <div className="mt-4 pt-3 border-t border-slate-200">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Sales Review Actions</p>
                          <div className="flex flex-wrap gap-2">
                            {taskStatus === 'SALES_REVIEW' && (<>
                              <button type="button" onClick={() => handleStatusChange('CLIENT_ACCEPTED')} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">Client Accepted</button>
                              <button type="button" onClick={() => handleStatusChange('CLIENT_REJECTED')} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors">Client Rejected</button>
                              <button type="button" onClick={() => { setReworkNote(''); setReworkFile(null); setReworkLink({ url: '', name: '' }); setReworkRefMode('file'); setReworkDialogOpen(true); }} className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors">Request Rework</button>
                              <button type="button" onClick={() => handleStatusChange('ON_HOLD')} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Put On Hold</button>
                            </>)}
                            {taskStatus === 'CLIENT_REJECTED' && (
                              <button type="button" onClick={() => { setReworkNote(''); setReworkFile(null); setReworkLink({ url: '', name: '' }); setReworkRefMode('file'); setReworkDialogOpen(true); }} className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors">Issue Rework</button>
                            )}
                            {taskStatus === 'ON_HOLD' && (
                              <button type="button" onClick={() => handleStatusChange(record?.holdPreviousStatus || 'SALES_REVIEW')} className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition-colors">Resume</button>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Designer action panel — resubmit from REWORK back to HOD */}
                      {isDesigner && taskStatus === 'REWORK' && (
                        <div className="mt-4 pt-3 border-t border-slate-200">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Rework Actions</p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleStatusChange('HOD_REVIEW')} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors">Submit for HOD Review</button>
                          </div>
                        </div>
                      )}
                      {(record?.projectDetails?.length ?? 0) > 0 && (
                        <div className="mt-4 border-t border-slate-200 pt-3">
                          <p className="mb-2 text-xs font-semibold text-slate-700">Work Scope</p>
                          <div className="space-y-2">
                            {record.projectDetails.map((detail, idx) => {
                              const DISC_HOURS = [
                                { key: 'artwork',   label: 'Artwork',   hours: detail.artworkHours },
                                { key: 'technical', label: 'Technical', hours: detail.technicalHours },
                                { key: 'location',  label: 'Location',  hours: detail.locationHours },
                                { key: 'asBuilt',   label: 'As-Built',  hours: detail.asBuiltHours },
                                { key: 'bim',       label: 'BIM',       hours: null },
                              ]
                              const activeDiscipline =
                                DISC_HOURS.find(d => d.label === record.disciplineType) ??
                                DISC_HOURS.find(d => detail[d.key])
                              return (
                                <div key={detail.id ?? idx} className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                                    {(detail.signType || record.signType) && (
                                      <span className="text-slate-500">Sign Type: <span className="font-semibold text-slate-800">{detail.signType || record.signType}</span></span>
                                    )}
                                    {record.signFamily && (
                                      <span className="text-slate-500">Sign Family: <span className="font-semibold text-slate-800">{record.signFamily}</span></span>
                                    )}
                                    {detail.planCode && (
                                      <span className="text-slate-500">Plan Code: <span className="font-semibold text-slate-800">{detail.planCode}</span></span>
                                    )}
                                    {detail.deadline && (
                                      <span className="text-slate-500">Deadline: <span className="font-semibold text-slate-800">{new Date(detail.deadline).toLocaleDateString('en-GB')}</span></span>
                                    )}
                                  </div>
                                  {activeDiscipline && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <DisciplinePill type={activeDiscipline.label} />
                                      {activeDiscipline.hours != null && activeDiscipline.hours > 0 && (
                                        <span className="text-xs text-slate-500">{activeDiscipline.hours}h estimated</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isRetail ? (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <DatePickerField
                          id="retail-submission"
                          label="Date of Submission"
                          selected={dateSubmission}
                          onChange={setDateSubmission}
                          minDate={today}
                        />
                      </div>
                      {!isQs && (
                      <div className="mt-2.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setCreateModalOpen(true)}
                          className="rounded-md bg-[#10a6e3] px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          Create
                        </button>
                      </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <DatePickerField
                          id="project-submission"
                          label="Date of Submission"
                          selected={dateSubmission}
                          onChange={setDateSubmission}
                          minDate={today}
                        />
                      </div>
                      {!isQs && (
                      <div className="mt-2.5 flex items-center justify-end gap-2.5">
                        <p className="text-[11px] text-slate-400">{projectTaskCreateGateMessage}</p>
                        <button
                          type="button"
                          onClick={() => setProjectCreateModalOpen(true)}
                          disabled={!canCreateProjectTasks}
                          className="rounded-md bg-[#10a6e3] px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#10a6e3]"
                        >
                          Create
                        </button>
                      </div>
                      )}
                    </div>
                  )}

                  {isCreationRoute && !isRetail && projectId ? (
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      {!isQs && !isQsCompleted ? (
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-slate-700">Sign Rows</p>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Awaiting QS Submission
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold text-slate-700">Sign Rows</p>
                              {isQsReadOnly ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Completed - Read Only
                                </span>
                              ) : qsStatus?.status ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                  QS {qsStatus.status}
                                </span>
                              ) : null}
                            </div>
                            {!isQsReadOnly ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveSignRows}
                                  disabled={signRowsSaving || qsSubmitting}
                                  className="rounded-md bg-[#10a6e3] px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-[#0f96cd] disabled:opacity-60"
                                >
                                  {signRowsSaving ? 'Saving…' : 'Save Rows'}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSubmitQsUpdate}
                                  disabled={signRowsSaving || qsSubmitting}
                                  className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {qsSubmitting ? 'Submitting…' : 'Submit QS Update'}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="overflow-auto rounded-md border border-slate-200">
                            <table className="w-full text-[11px]">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  {['Sign Type','No','T.No','Est QTY','Qs QTY','Seq','Status','Cont.Ref',
                                      'Plan Code','Area/Zone','Level/Parcel','Comment',''].map((h) => (
                                    <th key={h} className="px-1.5 py-0.5 text-left text-[9px] font-semibold whitespace-nowrap border-r border-slate-200 last:border-r-0">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {signRowsLoading ? (
                                  Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                      {Array.from({ length: 13 }).map((__, j) => (
                                        <td key={j} className="px-1 py-1.5">
                                          <div className="h-5 rounded bg-slate-200" />
                                        </td>
                                      ))}
                                    </tr>
                                  ))
                                ) : signRows.length === 0 ? (
                                  <tr><td colSpan={13} className="px-3 py-6 text-center text-slate-500">No rows yet. Click + Add Row.</td></tr>
                                ) : (() => {
                                  const signRowGroups = signRows.reduce((acc, row, idx) => {
                                    const family = String(row.signFamily ?? '').trim() || 'Other'
                                    let g = acc.find((x) => x.family === family)
                                    if (!g) { g = { family, rows: [] }; acc.push(g) }
                                    g.rows.push({ ...row, _idx: idx })
                                    return acc
                                  }, [])
                                  return signRowGroups.map(({ family, rows }) => (
                                    <React.Fragment key={`fam-${family}`}>
                                      <tr>
                                        <td className="pl-0 pr-2 py-1 bg-white">
                                          <span className="inline-flex items-center border-l-4 border-l-blue-500 bg-slate-50 pl-2 pr-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                                            {family}
                                          </span>
                                        </td>
                                        <td colSpan={12} className="bg-white" />
                                      </tr>
                                      {rows.map((row) => (
                                        <tr key={row.id ?? row._idx} className="hover:bg-slate-50">
                                          {['signType','no','tNo','estQty','qsQty','sequence','status','contRef',
                                              'planCode','areaZone','levelParcel','comment'].map((field) => (
                                            <td key={field} className={`p-0 border-r border-slate-300 last:border-r-0${field === 'signType' ? ' relative group' : ''}`}>
                                              <input
                                                value={row[field] ?? ''}
                                                onChange={(e) => setSignRows((prev) => prev.map((r, i) => i === row._idx ? { ...r, [field]: e.target.value } : r))}
                                                disabled={isQsReadOnly}
                                                className="h-6 w-full border border-slate-400 px-1.5 text-[11px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300"
                                              />
                                              {field === 'signType' && row[field] && (
                                                <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden max-w-[260px] rounded border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-800 shadow-lg group-hover:block">
                                                  {row[field]}
                                                </div>
                                              )}
                                            </td>
                                          ))}
                                          <td className="px-1 py-0.5">
                                            {!isQsReadOnly ? (
                                              <button
                                                type="button"
                                                onClick={() => setDeleteConfirm({ idx: row._idx, family })}
                                                className="flex items-center justify-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-500 transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white"
                                              >
                                                Delete
                                              </button>
                                            ) : null}
                                          </td>
                                        </tr>
                                      ))}
                                      {!isQsReadOnly ? (
                                        <tr>
                                          <td colSpan={13} className="px-0 py-0.5 bg-white">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setSignRows((prev) => {
                                                  const lastInGroup = rows[rows.length - 1]
                                                  const insertAt = lastInGroup ? lastInGroup._idx + 1 : prev.length
                                                  const newRow = { tNo: '', no: '', signType: '', planCode: '', estQty: '', qsQty: '',
                                                    areaZone: '', levelParcel: '', sequence: '', status: '', comment: '', contRef: '', signFamily: family === 'Other' ? '' : family }
                                                  const next = [...prev]
                                                  next.splice(insertAt, 0, newRow)
                                                  return next
                                                })
                                              }
                                              className="float-right mr-1 my-0.5 rounded px-2 py-0.5 text-[10px] font-semibold text-white bg-[#10a6e3] hover:bg-[#0f96cd]"
                                            >
                                              + Add Row
                                            </button>
                                          </td>
                                        </tr>
                                      ) : null}
                                    </React.Fragment>
                                  ))
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

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

                  {isCreationRoute && projectId ? (
                    <ProjectTaskList
                      tasks={projectTasks}
                      loading={tasksLoading}
                      onView={(task) =>
                        router.push(taskViewPathForRecord({ id: task.id, designType: task.designType ?? task.project?.category }))
                      }
                    />
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

              {activeTab === 'team' && isCreationRoute && !isRetail && !isQs ? (
                <div className="mt-3 space-y-2.5">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <FieldSelect id="team-technical-head" label="Technical Head" value={technicalHead} onChange={setTechnicalHead} options={hodUsers} />
                    <FieldSelect id="team-team-lead" label="Team Lead" value={teamLead} onChange={setTeamLead} options={leadOptions} />
                    <FieldSelect id="team-sub-team-lead" label="Sub Team Lead" value={subTeamLead} onChange={setSubTeamLead} options={leadOptions} />
                    <FieldMultiSelect id="team-designers" label="Designer" value={selectedDesigners} onChange={setSelectedDesigners} options={designerUsers} />
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
                    <p className="text-[11px] text-slate-400">{projectTaskCreateGateMessage}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTeam}
                        disabled={!isProjectTeamComplete || teamSaving}
                        className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {teamSaving ? 'Saving…' : 'Save Team'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectCreateModalOpen(true)}
                        disabled={!canCreateProjectTasks}
                        className="rounded-md bg-[#10a6e3] px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#10a6e3]"
                      >
                        Create
                      </button>
                    </div>
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
  <ChatterMentionText
    message={entry.message}
    users={resolveMentionUsersForDisplay(entry.message, entry.mentionedUsers, chatterMentionDirectory)}
    className="mt-1 block"
  />
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
        <ChatterMentionText
          message={comment.message}
          users={resolveMentionUsersForDisplay(comment.message, comment.mentionedUsers, chatterMentionDirectory)}
          className="mt-1 block"
        />
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

              {activeTab === 'rework' ? (
                <div className="mt-3 space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Flag className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-800">Sales Instructions</p>
                    </div>
                    {record?.reworkNote ? (
                      <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">{record.reworkNote}</p>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No written instructions were provided.</p>
                    )}
                    {record?.reworkAttachmentUrl && (
                      <a
                        href={record.reworkAttachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-blue-700 hover:bg-slate-50 hover:underline"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate font-medium">{record.reworkAttachmentName || 'Reference File'}</span>
                      </a>
                    )}
                    {record?.reworkLinkUrl && (
                      <a
                        href={record.reworkLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-blue-700 hover:bg-slate-50 hover:underline"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate font-medium">{record.reworkLinkName || record.reworkLinkUrl}</span>
                      </a>
                    )}
                  </div>

                  {!record?.reworkNote && !record?.reworkAttachmentUrl && !record?.reworkLinkUrl && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No rework instructions were attached to this revision.
                    </div>
                  )}

                  {/* Previous Submission */}
                  <div className="mt-2 pt-5 border-t border-slate-200">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-800">Previous Submission</p>
                    </div>
                    {prevRevisionLoading ? (
                      <p className="text-sm text-slate-400 italic">Loading…</p>
                    ) : prevRevisionSession ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2.5 text-xs text-slate-600">
                          {prevRevisionSession.submittedBy && (
                            <span><span className="font-semibold text-slate-500">Submitted by: </span>{prevRevisionSession.submittedBy}</span>
                          )}
                          {prevRevisionSession.submittedAt && (
                            <span><span className="font-semibold text-slate-500">Date: </span>{new Date(prevRevisionSession.submittedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                          {prevRevisionSession.durationSeconds > 0 && (
                            <span><span className="font-semibold text-slate-500">Duration: </span>{Math.floor(prevRevisionSession.durationSeconds / 3600)}h {Math.floor((prevRevisionSession.durationSeconds % 3600) / 60)}m</span>
                          )}
                        </div>
                        {prevRevisionSession.files?.length > 0 && (
                          <div className="px-3 py-2.5 space-y-1.5">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Files</p>
                            {prevRevisionSession.files.map((f, i) => (
                              <a key={i} href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-blue-700 hover:bg-slate-50 hover:underline">
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                <span className="truncate font-medium">{f.fileName}</span>
                                {f.sizeBytes && <span className="ml-auto shrink-0 text-xs text-slate-400">{(Number(f.sizeBytes) / 1024).toFixed(1)} KB</span>}
                              </a>
                            ))}
                          </div>
                        )}
                        {prevRevisionSession.submissionLink && (
                          <div className="px-3 py-2.5">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Submitted Docs</p>
                            <a href={prevRevisionSession.submissionLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-blue-700 hover:bg-slate-50 hover:underline">
                              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate">{prevRevisionSession.submissionLink}</span>
                            </a>
                          </div>
                        )}
                        {!prevRevisionSession.files?.length && !prevRevisionSession.submissionLink && (
                          <div className="px-3 py-2.5 text-sm text-slate-500 italic">No files or links were submitted.</div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 italic">No submission found for the previous revision.</p>
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
          fetchProjectTasks()
        }}
        submissionDate={dateSubmission}
        record={record}
      />
      <ProjectCreateTaskModal
        open={projectCreateModalOpen}
        onClose={() => setProjectCreateModalOpen(false)}
        onCreated={(tasks) => {
          setProjectCreateModalOpen(false)
          const taskList = Array.isArray(tasks) ? tasks : (tasks ? [tasks] : [])
          for (const t of taskList) {
            if (t?.taskNo ?? t?.id) setCreatedTasks((prev) => [...prev, t?.taskNo ?? t?.id])
          }
          fetchProjectTasks()
          const count = taskList.length
          if (count > 0) toast.success(`${count} task${count !== 1 ? 's' : ''} created successfully`)
        }}
        submissionDate={dateSubmission}
        record={record}
        signRows={signRows}
        isQsSignRegisterComplete={isQsCompleted}
      />
      {historyDialog && (
        <HistoryDialog
          title={historyDialog.title}
          projectId={projectId}
          type={historyDialog.type}
          onClose={() => setHistoryDialog(null)}
        />
      )}

      {reworkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col gap-4 p-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Issue Rework</h2>
              <p className="mt-1 text-xs text-slate-500">A new revision task will be created with these instructions. The original task stays in its current status.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700">Rework Instructions <span className="text-red-500">*</span></label>
              <textarea
                className="w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                rows={4}
                placeholder="e.g. Please revise the sign dimensions on sheet 3 and update the colour palette to match the revised brief..."
                value={reworkNote}
                onChange={(e) => setReworkNote(e.target.value)}
                autoFocus
              />
            </div>
            {/* Reference — toggled */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Reference <span className="text-slate-400 font-normal">(optional)</span></label>
                <div className="inline-flex rounded-md border border-blue-500 bg-blue-50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => { setReworkRefMode('file'); setReworkLink({ url: '', name: '' }) }}
                    className={`rounded px-2.5 py-1 font-semibold transition-colors ${reworkRefMode === 'file' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Select File
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReworkRefMode('link'); setReworkFile(null) }}
                    className={`rounded px-2.5 py-1 font-semibold transition-colors ${reworkRefMode === 'link' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Add Link
                  </button>
                </div>
              </div>

              {reworkRefMode === 'file' ? (
                reworkFile ? (
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <FileText size={13} className="text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-700 flex-1 truncate">{reworkFile.name}</span>
                    <button type="button" onClick={() => setReworkFile(null)} className="text-slate-400 hover:text-red-500 text-xs transition-colors">✕</button>
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${reworkFileUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload size={13} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-500">{reworkFileUploading ? 'Uploading…' : 'Click to attach a file'}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setReworkFileUploading(true)
                        try {
                          const form = new FormData()
                          form.append('file', file)
                          const res = await apiClient.post('/tasks/upload-file', form)
                          setReworkFile({ url: res.fileUrl, name: res.fileName })
                        } catch {
                          toast.error('File upload failed')
                        } finally {
                          setReworkFileUploading(false)
                          e.target.value = ''
                        }
                      }}
                    />
                  </label>
                )
              ) : (
                <div className="flex gap-2">
                  <input
                    type="url"
                    className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="https://…"
                    value={reworkLink.url}
                    onChange={(e) => setReworkLink((l) => ({ ...l, url: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="Label"
                    value={reworkLink.name}
                    onChange={(e) => setReworkLink((l) => ({ ...l, name: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReworkDialogOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reworkNote.trim() || reworkSubmitting || reworkFileUploading}
                onClick={async () => {
                  setReworkSubmitting(true)
                  await handleStatusChange('REWORK', reworkNote.trim(), reworkFile, reworkLink.url ? reworkLink : null)
                  setReworkDialogOpen(false)
                  setReworkSubmitting(false)
                }}
                className="rounded-md bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {reworkSubmitting ? 'Creating revision…' : 'Issue Rework'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-slate-800">Delete Row?</p>
            <p className="mt-1 text-xs text-slate-500">
              Are you sure you want to delete this row from{' '}
              <span className="font-semibold text-blue-600">{deleteConfirm.family}</span>?
              This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignRows((prev) => prev.filter((_, i) => i !== deleteConfirm.idx))
                  setDeleteConfirm(null)
                }}
                className="rounded bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


