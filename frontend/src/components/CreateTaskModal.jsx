import { useEffect, useId, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

const DESIGN_OPTIONS = [
  { id: 'estimation', label: 'Estimation Purpose' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'client', label: 'Client Submission' },
  { id: 'technical', label: 'Technical Drawing' },
]
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High']

function getPriorityClasses(level) {
  if (level === 'High') return 'text-red-700 font-semibold'
  if (level === 'Medium') return 'text-orange-600 font-semibold'
  return 'text-emerald-700 font-semibold'
}

export function CreateTaskModal({ open, onClose, submissionDate, record }) {
  const titleId = useId()
  const fileInputRef = useRef(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [hod, setHod] = useState('')
  const [designs, setDesigns] = useState(() => ({
    estimation: false,
    presentation: false,
    client: false,
    technical: false,
  }))
  const [priorityLevel, setPriorityLevel] = useState('Medium')
  const [taskName, setTaskName] = useState('')
  const [hoursRequired, setHoursRequired] = useState('')
  const [comment, setComment] = useState('')
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
    setTaskName('')
    setFieldErrors({})
    setTouched({})
    setSubmitAttempted(false)
  }, [open])

  if (!open) return null

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const validSubmissionDate =
    submissionDate instanceof Date && !Number.isNaN(submissionDate.getTime()) ? submissionDate : null
  const startOfDeadline = validSubmissionDate ? new Date(validSubmissionDate) : null
  if (startOfDeadline) startOfDeadline.setHours(0, 0, 0, 0)
  const daysFromToday =
    startOfDeadline ? Math.max(0, Math.ceil((startOfDeadline.getTime() - startOfToday.getTime()) / 86400000)) : null
  const formattedDeadline =
    validSubmissionDate
      ? validSubmissionDate.toLocaleDateString('en-GB')
      : ''

  function toggleDesign(id) {
    setDesigns((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!record) return
    setSubmitAttempted(true)
    const normalizedTaskName = taskName.trim()
    const nextFieldErrors = {}
    if (normalizedTaskName.length < 2) {
      nextFieldErrors.taskName = 'Task Name is required'
    }
    if (!hod.trim()) {
      nextFieldErrors.hod = 'HOD is required'
    }
    if (!validSubmissionDate) {
      nextFieldErrors.deadline = 'Deadline for Task Submission is required'
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setError('Please fill required fields')
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

      const selectedDesignTypes = Object.entries(designs)
        .filter(([, checked]) => checked)
        .map(([key]) => key)
      const payload = {
        designType: 'Retail',
        task: {
          title: normalizedTaskName,
          opNo: record.opNo ?? undefined,
          description: comment || undefined,
          priority: priorityLevel,
          dueDate: validSubmissionDate ? validSubmissionDate.toISOString() : undefined,
          projectNo: record.projectNo ?? record.projectId ?? undefined,
        },
        retailDetails: [
          {
            providedFile: allUploaded.map((file) => file.fileName).join(', ') || undefined,
            fileKey: allUploaded[0]?.key,
            hodName: hod || undefined,
            designTypes: selectedDesignTypes,
            hoursRequired: hoursRequired ? Number(hoursRequired) : undefined,
            comment: comment || undefined,
            signFamily: undefined,
            signType: undefined,
            planCode: undefined,
            contractRef: undefined,
            quantity: undefined,
            deadline: validSubmissionDate ? validSubmissionDate.toISOString() : undefined,
            attachments: allUploaded.map((file) => ({
              fileKey: file.key,
              fileName: file.fileName,
              mimeType: file.mimeType,
              size: file.size,
            })),
          },
        ],
      }
      await apiClient.post('/tasks/extended', payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create retail task')
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
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-task-name">
              Task Name <span className="text-red-600">*</span>
            </label>
            <input
              id="create-task-name"
              value={taskName}
              onChange={(e) => {
                setTaskName(e.target.value)
                setFieldErrors((prev) => ({ ...prev, taskName: '' }))
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, taskName: true }))}
              placeholder="Enter task name"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            {((submitAttempted || touched.taskName) && taskName.trim().length < 2) || fieldErrors.taskName ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.taskName || 'Task Name is required'}</p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-provided-files">
              Task Files
            </label>
            <div className="mt-1.5 flex gap-2">
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
            {selectedFiles.length > 0 ? (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
                {selectedFiles.map((file) => file.name).join(', ')}
              </div>
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
              <option value="hod-1">A. Khan</option>
              <option value="hod-2">M. Rahman</option>
            </select>
            {((submitAttempted || touched.hod) && !hod.trim()) || fieldErrors.hod ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.hod || 'HOD is required'}</p>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-600">Select which designs are required</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DESIGN_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={designs[opt.id]}
                    onChange={() => toggleDesign(opt.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

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
                min={0}
                value={hoursRequired}
                onChange={(e) => setHoursRequired(e.target.value)}
                placeholder="0"
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="create-deadline">
              Deadline for Task Submission <span className="text-red-600">*</span>
            </label>
            <input
              id="create-deadline"
              value={formattedDeadline}
              readOnly
              required
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              {daysFromToday == null ? 'Select Date of Submission on details page' : `${daysFromToday} day(s) from today`}
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
              disabled={submitting || taskName.trim().length < 2 || !hod.trim() || !validSubmissionDate}
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
