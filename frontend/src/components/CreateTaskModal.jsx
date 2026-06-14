import { useEffect, useId, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import DatePicker from 'react-datepicker'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

const DESIGN_OPTIONS = [
  { value: 'Estimation Purpose', label: 'Estimation Purpose' },
  { value: 'Presentation', label: 'Presentation' },
  { value: 'Client Submission', label: 'Client Submission' },
  { value: 'Technical Drawing', label: 'Technical Drawing' },
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
    if (!open) return
    setRevisionCode('')
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
    const initDate = submissionDate instanceof Date && !Number.isNaN(submissionDate.getTime()) ? submissionDate : null
    setLocalDeadline(initDate)
  }, [open, submissionDate])

  // Reset revision when design type changes so the correct next revision is fetched
  useEffect(() => {
    if (!designType) return
    setRevisionCode('')
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
        if (!revisionCode.trim()) setRevisionCode(res?.revisionCode ?? 'R0')
      })
      .catch(() => {})
  }, [open, record, designType, revisionCode])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!record) return
    setSubmitAttempted(true)
    const normalizedRevision = revisionCode.trim().toUpperCase()
    const nextFieldErrors = {}
    if (!REVISION_PATTERN.test(normalizedRevision)) {
      nextFieldErrors.revisionCode = 'Revision must be like R0, R1, R2'
    }
    if (!designType.trim()) {
      nextFieldErrors.designType = 'Design Type is required'
    }
    if (!hod.trim()) {
      nextFieldErrors.hod = 'HOD is required'
    }
    if (!validSubmissionDate) {
      nextFieldErrors.deadline = 'Deadline for Task Submission is required'
    }
    if (!String(record?.projectName ?? '').trim()) {
      nextFieldErrors.projectName = 'Project Name is required from source project'
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setError(nextFieldErrors.projectName || 'Please fill required fields')
      return
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
            hoursRequired: hoursRequired ? Number(hoursRequired) : undefined,
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
      const msg = err instanceof Error ? err.message : 'Failed to create task'
      setError(msg)
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
        className="ui-surface relative z-10 w-full max-w-lg overflow-hidden shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 bg-slate-800 px-5 py-4 text-white">
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

        <form className="space-y-4 p-5" onSubmit={handleSubmit}>
          <fieldset>
            <legend className="text-xs font-semibold text-slate-600">Select design type <span className="text-red-600">*</span></legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-1 text-xs">
                <button type="button" onClick={() => setFileMode('link')} className={`rounded px-2 py-1 font-semibold ${fileMode === 'link' ? 'bg-white text-slate-900' : 'text-slate-600'}`}>Paste Link</button>
                <button type="button" onClick={() => setFileMode('browse')} className={`rounded px-2 py-1 font-semibold ${fileMode === 'browse' ? 'bg-white text-slate-900' : 'text-slate-600'}`}>Browse Files</button>
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
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
                {[...selectedFiles.map((file) => file.name), ...linkAttachments.map((item) => item.fileName)].join(', ')}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-revision-code">
                Revision <span className="text-red-600">*</span>
              </label>
              <input
                id="create-revision-code"
                value={revisionCode}
                onChange={(e) => {
                  setRevisionCode(e.target.value.toUpperCase())
                  setFieldErrors((prev) => ({ ...prev, revisionCode: '' }))
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, revisionCode: true }))}
                placeholder="R0"
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              {((submitAttempted || touched.revisionCode) && !REVISION_PATTERN.test(revisionCode.trim().toUpperCase())) || fieldErrors.revisionCode ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.revisionCode || 'Must be R0, R1, R2…'}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="create-hod">
                Select HOD <span className="text-red-600">*</span>
              </label>
              <select
                id="create-hod"
                value={hod}
                onChange={(e) => {
                  setHod(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, hod: '' }))
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, hod: true }))}
                required
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select</option>
                <option value="Sarah Mitchell">Sarah Mitchell</option>
                <option value="A. Khan">A. Khan</option>
                <option value="M. Rahman">M. Rahman</option>
              </select>
              {((submitAttempted || touched.hod) && !hod.trim()) || fieldErrors.hod ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.hod || 'HOD is required'}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
                onChange={(e) => setHoursRequired(e.target.value)}
                placeholder="1"
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

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
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-comment">
              Comment
            </label>
            <textarea
              id="create-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="mt-1.5 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex justify-center pt-1">
            {error ? <p className="mr-3 self-center text-xs text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting || !REVISION_PATTERN.test(revisionCode.trim().toUpperCase()) || !designType.trim() || !hod.trim() || !validSubmissionDate}
              className="rounded-full bg-blue-600 px-10 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
