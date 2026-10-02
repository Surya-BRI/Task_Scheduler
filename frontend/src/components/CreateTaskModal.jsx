import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, X, ChevronDown } from 'lucide-react'
import DatePicker from 'react-datepicker'
import { apiClient } from '@/lib/api-client'
import { assertHoursWithinDeadline } from '@/lib/task-deadline-hours'
import { toast } from 'sonner'

import { toUserFacingError } from '@/lib/api-error'
const DESIGN_OPTIONS = [
  { value: 'Estimation Purpose', label: 'Estimation Purpose' },
  { value: 'Presentation', label: 'Presentation' },
  { value: 'Client Submission', label: 'Client Submission' },
  { value: 'Technical Drawing', label: 'Technical Drawing' },
  { value: 'Production Release', label: 'Production Release' },
]
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High']
const REVISION_PATTERN = /^R\d+$/

function getPriorityClasses(level) {
  if (level === 'High') return 'text-red-700 font-semibold'
  if (level === 'Medium') return 'text-orange-600 font-semibold'
  return 'text-emerald-700 font-semibold'
}

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

// Native <select> popups are rendered by the browser, so they ignore CSS and can flip
// upward / show every option with no scrollbar when there isn't room below. This dropdown
// is a portal-rendered list we fully control: always opens downward, height capped to
// whatever space is actually available, scrollable past that.
function ReviewerDropdown({ id, value, onChange, onBlur, options, loading, errorMessage, disabled }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const spaceBelow = window.innerHeight - rect.bottom - 12
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(160, Math.min(240, spaceBelow)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    function closeMenu() {
      setMenuOpen(false)
      onBlur?.()
    }
    function onDocMouseDown(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      closeMenu()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, onBlur])

  const label = loading ? 'Loading Reviewers…' : errorMessage ? 'Failed to load Reviewers' : value || 'Select'

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setMenuOpen((v) => !v)}
        className={`mt-1.5 flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 ${value ? 'text-slate-900' : 'text-slate-400'}`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {menuOpen && !disabled && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle ?? undefined}
              className="z-50 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
            >
              {options.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => {
                    onChange(name)
                    setMenuOpen(false)
                    onBlur?.()
                  }}
                  className={`block w-full truncate px-3 py-1.5 text-left hover:bg-slate-50 ${name === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-800'}`}
                >
                  {name}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function CreateTaskModal({ open, onClose, onCreated, submissionDate, record }) {
  const titleId = useId()
  const fileInputRef = useRef(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [linkAttachments, setLinkAttachments] = useState([])
  const [fileMode, setFileMode] = useState('link')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const [hod, setHod] = useState('')
  const [designType, setDesignType] = useState('')
  const [priorityLevel, setPriorityLevel] = useState('Medium')
  const [revisionCode, setRevisionCode] = useState('')
  const [hoursRequired, setHoursRequired] = useState('1')
  const [comment, setComment] = useState('')
  const [localDeadline, setLocalDeadline] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [revisionFetchError, setRevisionFetchError] = useState('')
  const [hodUsers, setHodUsers] = useState([])
  const [hodUsersLoading, setHodUsersLoading] = useState(false)
  const [hodUsersError, setHodUsersError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    setHodUsersLoading(true)
    setHodUsersError('')
    apiClient
      .get('/users?role=HOD')
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        setHodUsers(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        if (!alive) return
        setHodUsers([])
        setHodUsersError(toUserFacingError(err, 'Could not load Reviewer list'))
      })
      .finally(() => {
        if (alive) setHodUsersLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setError('')
      setRevisionFetchError('')
      return
    }
    setRevisionCode('')
    setRevisionFetchError('')
    setDesignType('')
    setHod('')
    setPriorityLevel('Medium')
    setHoursRequired('1')
    setComment('')
    setSelectedFiles([])
    setUploadedFiles([])
    setLinkAttachments([])
    setFileMode('link')
    setLinkUrl('')
    setLinkError('')
    setFieldErrors({})
    setTouched({})
    setSubmitAttempted(false)
    setError('')
    const initDate = submissionDate instanceof Date && !Number.isNaN(submissionDate.getTime()) ? submissionDate : null
    setLocalDeadline(initDate)
  }, [open, submissionDate])

  // Reset revision when design type changes so the correct next revision is fetched
  useEffect(() => {
    if (!designType) return
    setRevisionCode('')
    setRevisionFetchError('')
  }, [designType])

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const validSubmissionDate = localDeadline instanceof Date && !Number.isNaN(localDeadline.getTime()) ? localDeadline : null
  const startOfDeadline = validSubmissionDate ? new Date(validSubmissionDate) : null
  if (startOfDeadline) startOfDeadline.setHours(0, 0, 0, 0)
  const daysFromToday =
    startOfDeadline ? Math.max(0, Math.ceil((startOfDeadline.getTime() - startOfToday.getTime()) / 86400000)) : null

  useEffect(() => {
    if (!open || !record || !designType) return
    const opNo = String(record.opNo ?? '').trim()
    const projectNo = String(record.projectNo ?? record.projectId ?? '').trim()
    if (!opNo || !projectNo) return
    const qs = new URLSearchParams({ opNo, projectNo, designType }).toString()
    apiClient
      .get(`/tasks/next-revision?${qs}`)
      .then((res) => {
        setRevisionFetchError('')
        if (!revisionCode.trim()) setRevisionCode(res?.revisionCode ?? 'R0')
      })
      .catch((err) => {
        const msg = toUserFacingError(err, 'Could not resolve revision')
        setRevisionFetchError(msg)
        setError(msg)
        setFieldErrors((prev) => {
          const next = { ...prev }
          delete next.revisionCode
          return next
        })
        toast.error(msg)
      })
  }, [open, record, designType, revisionCode])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!record) return
    setSubmitAttempted(true)
    const normalizedRevision = revisionCode.trim().toUpperCase()
    const nextFieldErrors = {}
    if (revisionFetchError) {
      setError(revisionFetchError)
      toast.error(revisionFetchError)
      return
    }
    if (!REVISION_PATTERN.test(normalizedRevision)) {
      nextFieldErrors.revisionCode = 'Revision must be like R0, R1, R2'
    }
    if (!designType.trim()) {
      nextFieldErrors.designType = 'Design Type is required'
    }
    if (!hod.trim()) {
      nextFieldErrors.hod = 'Reviewer is required'
    }
    if (!validSubmissionDate) {
      nextFieldErrors.deadline = 'Deadline for Task Submission is required'
    }
    if (!String(record?.projectName ?? '').trim()) {
      nextFieldErrors.projectName = 'Project Name is required from source project'
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      const firstMsg =
        nextFieldErrors.hod ||
        nextFieldErrors.revisionCode ||
        nextFieldErrors.designType ||
        nextFieldErrors.deadline ||
        nextFieldErrors.projectName ||
        'Please fill required fields'
      setError(firstMsg)
      toast.error(firstMsg)
      return
    }
    const parsedHours = Number(hoursRequired)

    if (validSubmissionDate && Number.isFinite(parsedHours) && parsedHours >= 1) {
      const hoursCheck = assertHoursWithinDeadline(parsedHours, validSubmissionDate)
      if (!hoursCheck.ok) {
        setError(hoursCheck.message)
        toast.error(hoursCheck.message)
        return
      }
    }

    setFieldErrors({})
    setError('')
    setSubmitting(true)
    try {
      const newlyUploaded = []
      for (const file of selectedFiles) {
        const formData = new FormData()
        formData.append('file', file)
        const uploaded = await apiClient.post('/tasks/upload-file', formData)
        newlyUploaded.push(uploaded)
      }
      const allUploaded = [...uploadedFiles, ...newlyUploaded]
      setUploadedFiles(allUploaded)
      const allAttachments = [
        ...allUploaded.map((file) => ({
          fileKey: file.key,
          fileName: file.fileName,
          mimeType: file.mimeType,
          size: file.size,
        })),
        ...linkAttachments.map((item) => ({
          fileKey: item.url,
          fileName: item.fileName,
          mimeType: null,
          size: undefined,
        })),
      ]

      const payload = {
        designType: 'Retail',
        task: {
          revisionCode: normalizedRevision,
          designType,
          opNo: record.opNo ?? undefined,
          projectName: record.projectName ?? undefined,
          description: comment || undefined,
          priority: priorityLevel,
          dueDate: validSubmissionDate ? validSubmissionDate.toISOString() : undefined,
          projectNo: record.projectNo ?? record.projectId ?? undefined,
        },
        retailDetails: [
          {
            providedFile: allAttachments.map((file) => file.fileName).join(', ') || undefined,
            fileKey: allUploaded[0]?.key,
            hodName: hod || undefined,
            designTypes: designType ? [designType] : undefined,
            hoursRequired: Number(hoursRequired),
            comment: comment || undefined,
            signFamily: undefined,
            signType: undefined,
            planCode: undefined,
            contractRef: undefined,
            quantity: undefined,
            deadline: validSubmissionDate ? validSubmissionDate.toISOString() : undefined,
            attachments: allAttachments,
          },
        ],
      }
      const created = await apiClient.post('/tasks/extended', payload)
      toast.success('Task created successfully')
      if (onCreated) {
        onCreated(created)
      } else {
        onClose()
      }
    } catch (err) {
      const msg = toUserFacingError(err, 'Failed to create task')
      setError(msg)
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.revisionCode
        return next
      })
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function handlePickFile() {
    fileInputRef.current?.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ui-surface relative z-10 w-full max-w-2xl overflow-hidden shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 bg-slate-800 px-5 py-3 text-white">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/15">
              <Pencil className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-semibold leading-tight">
                Create Task
              </h2>
              <p className="mt-0.5 text-sm text-slate-200">Get things moving</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-3 p-4" onSubmit={handleSubmit}>
          <fieldset>
            <legend className="text-xs font-semibold text-slate-600">Select design type <span className="text-red-600">*</span></legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {DESIGN_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="design-type"
                    checked={designType === opt.value}
                    onChange={() => {
                      setDesignType(opt.value)
                      setFieldErrors((prev) => ({ ...prev, designType: '' }))
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {(submitAttempted && !designType.trim()) || fieldErrors.designType ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.designType || 'Design Type is required'}</p>
            ) : null}
          </fieldset>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-provided-files">
                Task Files
              </label>
              <div className="inline-flex rounded-md border border-blue-500 bg-blue-50 p-1 text-xs">
                <button type="button" onClick={() => setFileMode('link')} className={`rounded px-2 py-1 font-semibold transition-colors ${fileMode === 'link' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Paste Link</button>
                <button type="button" onClick={() => setFileMode('browse')} className={`rounded px-2 py-1 font-semibold transition-colors ${fileMode === 'browse' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Browse Files</button>
              </div>
            </div>
            {fileMode === 'link' ? (
              <div className="mt-2 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    id="create-provided-files"
                    value={linkUrl}
                    onChange={(e) => {
                      setLinkUrl(e.target.value)
                      setLinkError('')
                    }}
                    placeholder="Paste Google Drive/S3/HTTP link"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = linkUrl.trim()
                      if (!isValidHttpUrl(url)) {
                        setLinkError('Enter a valid http/https URL')
                        return
                      }
                      setLinkAttachments((prev) => [...prev, { url, fileName: deriveFileNameFromUrl(url) }])
                      setLinkUrl('')
                    }}
                    className="rounded-md border border-blue-400 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    Add Link
                  </button>
                </div>
                {linkError ? <p className="text-xs text-red-600">{linkError}</p> : null}
              </div>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  id="create-provided-files"
                  value={
                    selectedFiles.length === 0
                      ? ''
                      : `${selectedFiles.length} file(s) selected`
                  }
                  readOnly
                  placeholder="Select task files"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={handlePickFile}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Browse
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                setSelectedFiles(files)
                setUploadedFiles([])
              }}
            />
            {selectedFiles.length > 0 || linkAttachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedFiles.map((file, idx) => (
                  <div key={`file-${idx}`} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    <span className="max-w-[160px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="shrink-0 text-red-500 hover:text-red-700"
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {linkAttachments.map((item, idx) => (
                  <div key={`link-${idx}`} className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="max-w-[160px] truncate text-blue-600 hover:underline">
                      {item.fileName}
                    </a>
                    <button
                      type="button"
                      onClick={() => setLinkAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="shrink-0 text-red-500 hover:text-red-700"
                      aria-label={`Remove ${item.fileName}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-revision-code">
                Revision <span className="text-red-600">*</span>
              </label>
              <input
                id="create-revision-code"
                value={revisionCode}
                readOnly
                aria-readonly="true"
                title="Revision is assigned automatically"
                placeholder="R0"
                className="mt-1.5 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
              />
              {((submitAttempted || touched.revisionCode) && !REVISION_PATTERN.test(revisionCode.trim().toUpperCase())) || fieldErrors.revisionCode ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.revisionCode || 'Must be R0, R1, R2…'}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-priority">
                Priority Level
              </label>
              <select
                id="create-priority"
                value={priorityLevel}
                onChange={(e) => setPriorityLevel(e.target.value)}
                className={`mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${getPriorityClasses(priorityLevel)}`}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-hours">
                Hours Required
              </label>
              <input
                id="create-hours"
                type="number"
                min={1}
                value={hoursRequired}
                onChange={(e) => {
                  setHoursRequired(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, hoursRequired: '' }))
                }}
                placeholder="1"
                className={`mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:ring-2 focus:ring-blue-500/20 ${fieldErrors.hoursRequired ? 'border-red-400 focus:border-red-400' : 'border-slate-300 focus:border-blue-500'}`}
              />
              {fieldErrors.hoursRequired && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.hoursRequired}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-600" htmlFor="create-deadline">
                Deadline for Task Submission <span className="text-red-600">*</span>
              </label>
              <DatePicker
                id="create-deadline"
                selected={localDeadline}
                onChange={(date) => {
                  setLocalDeadline(date)
                  setFieldErrors((prev) => ({ ...prev, deadline: '' }))
                }}
                minDate={startOfToday}
                dateFormat="dd/MM/yyyy"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                placeholderText="dd/mm/yyyy"
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                {daysFromToday == null ? 'Pick a submission date' : `${daysFromToday} day(s) from today`}
              </p>
              {(submitAttempted && !validSubmissionDate) || fieldErrors.deadline ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.deadline || 'Deadline for Task Submission is required'}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-hod">
                Select Reviewer <span className="text-red-600">*</span>
              </label>
              <ReviewerDropdown
                id="create-hod"
                value={hod}
                onChange={(name) => {
                  setHod(name)
                  setFieldErrors((prev) => ({ ...prev, hod: '' }))
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, hod: true }))}
                options={hodUsers.map((user) => String(user?.userName ?? '').trim()).filter(Boolean)}
                loading={hodUsersLoading}
                errorMessage={hodUsersError}
                disabled={hodUsersLoading || Boolean(hodUsersError)}
              />
              {hodUsersError ? (
                <p className="mt-1 text-xs text-red-600">{hodUsersError}</p>
              ) : null}
              {!hodUsersLoading && !hodUsersError && hodUsers.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">No Reviewer users found. Seed HOD accounts first.</p>
              ) : null}
              {((submitAttempted || touched.hod) && !hod.trim()) || fieldErrors.hod ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.hod || 'Reviewer is required'}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-comment">
              Comment
            </label>
            <textarea
              id="create-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="mt-1.5 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex justify-center pt-1">
            {error ? <p className="mr-3 self-center text-xs text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="cursor-pointer rounded-full bg-blue-600 px-10 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
