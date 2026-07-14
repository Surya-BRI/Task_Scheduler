import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'

function isValidHttpUrl(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}
function deriveFileNameFromUrl(url) {
  try { const p = new URL(url).pathname; return decodeURIComponent(p.split('/').filter(Boolean).pop() || url) } catch { return url }
}
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High']
const REVISION_PATTERN = /^R\d+$/

const DISCIPLINES = [
  { key: 'artwork',   label: 'Artwork',   hoursKey: 'artHours' },
  { key: 'technical', label: 'Technical', hoursKey: 'techHours' },
  { key: 'location',  label: 'Location',  hoursKey: 'locationHours' },
  { key: 'asBuilt',   label: 'As-Built',  hoursKey: 'asBuiltHours' },
]

function getPriorityClasses(level) {
  if (level === 'High') return 'text-red-700 font-semibold'
  if (level === 'Medium') return 'text-orange-600 font-semibold'
  return 'text-emerald-700 font-semibold'
}

function emptyWorkFields(base) {
  return {
    ...base,
    artwork: false,
    artHours: '',
    technical: false,
    techHours: '',
    location: false,
    locationHours: '',
    asBuilt: false,
    asBuiltHours: '',
    deadline: '',
  }
}

function buildRowsFromSignRows(signRows) {
  const familyOrder = []
  const byFamily = new Map()
  for (const row of signRows ?? []) {
    const family = row.signFamily || 'Other'
    if (!byFamily.has(family)) {
      byFamily.set(family, [])
      familyOrder.push(family)
    }
    byFamily.get(family).push(
      emptyWorkFields({
        id: `sign-${row.id}`,
        signType: row.signType || '',
        quantity: row.qsQty ?? '',
        area: row.areaZone || '',
        description: row.comment || '',
        estimationStatus: row.status || '',
      }),
    )
  }
  return familyOrder.map((family) => ({
    id: `family-${family}`,
    signType: family,
    children: byFamily.get(family),
  }))
}

function TableInput({ value, onChange, type = 'text', placeholder = '' }) {
  return (
    <input
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-full border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-blue-400 ${type === 'date' ? 'h-7' : 'h-6'}`}
    />
  )
}

function TickBox({ checked, onChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-blue-600"
    />
  )
}

export function ProjectCreateTaskModal({ open, onClose, onCreated, submissionDate, record, signRows, isQsSignRegisterComplete }) {
  const titleId = useId()
  const revisionFetched = useRef(false)
  const phaseFetched = useRef(false)
  const fileInputRef = useRef(null)
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedSignType, setSelectedSignType] = useState('')
  const [planCode, setPlanCode] = useState('')
  const [priorityLevel, setPriorityLevel] = useState('Medium')
  const [localDeadline, setLocalDeadline] = useState(null)
  const [revisionCode, setRevisionCode] = useState('')
  const [phaseContext, setPhaseContext] = useState({ maxPhase: 0, bySignType: {} })
  const [phaseContextFailed, setPhaseContextFailed] = useState(false)
  const [phase, setPhase] = useState(1)
  const [phaseTouched, setPhaseTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [fileMode, setFileMode] = useState('link')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [linkAttachments, setLinkAttachments] = useState([])
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDeadline = localDeadline instanceof Date && !Number.isNaN(localDeadline.getTime())
    ? new Date(localDeadline)
    : null
  if (startOfDeadline) startOfDeadline.setHours(0, 0, 0, 0)
  const daysFromToday = startOfDeadline
    ? Math.max(0, Math.ceil((startOfDeadline.getTime() - startOfToday.getTime()) / 86400000))
    : null
  const deadlineInputValue = localDeadline instanceof Date && !Number.isNaN(localDeadline.getTime())
    ? localDeadline.toISOString().slice(0, 10)
    : ''

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    revisionFetched.current = false
    phaseFetched.current = false
    setRevisionCode('')
    setPhaseContext({ maxPhase: 0, bySignType: {} })
    setPhaseContextFailed(false)
    setPhase(1)
    setPhaseTouched(false)
    setPriorityLevel('Medium')
    setLocalDeadline(submissionDate instanceof Date && !Number.isNaN(submissionDate.getTime()) ? submissionDate : null)
    setSelectedSignType('')
    setPlanCode('')
    setExpanded(new Set())
    setFieldErrors({})
    setTouched({})
    setSubmitAttempted(false)
    setError('')
    setFileMode('link')
    setSelectedFiles([])
    setUploadedFiles([])
    setLinkAttachments([])
    setLinkUrl('')
    setLinkError('')
  }, [open, submissionDate])

  // Build sign types from the QS-submitted sign register (passed in as a prop —
  // task creation is gated on QS having already saved this data).
  useEffect(() => {
    if (!open) return
    const built = buildRowsFromSignRows(signRows)
    setRows(built)
    setExpanded(new Set(built.filter((r) => (r.children?.length ?? 0) > 0).map((r) => r.id)))
  }, [open, signRows])

  // Fetch next revision code
  useEffect(() => {
    if (!open || !record || revisionFetched.current) return
    const opNo = String(record.opNo ?? '').trim()
    const projectNo = String(record.projectNo ?? record.projectId ?? '').trim()
    if (!opNo || !projectNo) return
    revisionFetched.current = true
    const qs = new URLSearchParams({ opNo, projectNo, designType: 'Project' }).toString()
    apiClient
      .get(`/tasks/next-revision?${qs}`)
      .then((res) => setRevisionCode(res?.revisionCode ?? 'R0'))
      .catch(() => {})
  }, [open, record])

  // Fetch project-wide phase history (for the smart phase suggestion)
  useEffect(() => {
    if (!open || !record || phaseFetched.current) return
    const opNo = String(record.opNo ?? '').trim()
    const projectNo = String(record.projectNo ?? record.projectId ?? '').trim()
    if (!opNo || !projectNo) return
    phaseFetched.current = true
    const qs = new URLSearchParams({ opNo, projectNo, designType: 'Project' }).toString()
    apiClient
      .get(`/tasks/next-phase?${qs}`)
      .then((res) => setPhaseContext({ maxPhase: res?.maxPhase ?? 0, bySignType: res?.bySignType ?? {} }))
      .catch(() => setPhaseContextFailed(true))
  }, [open, record])

  // Sign types with at least one ticked discipline right now
  const checkedSignTypes = rows.flatMap((row) =>
    (row.children ?? [])
      .filter((child) => DISCIPLINES.some((d) => child[d.key]))
      .map((child) => child.signType)
      .filter(Boolean),
  )
  const checkedSignTypesKey = Array.from(new Set(checkedSignTypes)).sort().join('|')

  // Live "smart" phase suggestion: continue a checked sign type's own lineage
  // (its last phase + 1) when it has history, otherwise fall back to the
  // project-wide next phase. Stops recomputing once the HOD picks manually.
  useEffect(() => {
    if (!open || phaseTouched) return
    const distinctSignTypes = Array.from(new Set(checkedSignTypes))
    const lineages = distinctSignTypes
      .map((st) => phaseContext.bySignType?.[st]?.maxPhase)
      .filter((v) => typeof v === 'number')
    const suggested = lineages.length > 0 ? Math.max(...lineages) + 1 : (phaseContext.maxPhase || 0) + 1
    setPhase(suggested)
  }, [open, checkedSignTypesKey, phaseContext, phaseTouched])

  const phaseHint = (() => {
    if (phaseTouched) return null
    const distinctSignTypes = Array.from(new Set(checkedSignTypes))
    const withHistory = distinctSignTypes.filter((st) => typeof phaseContext.bySignType?.[st]?.maxPhase === 'number')
    if (withHistory.length === 0) return 'No prior tasks for these sign types in this project — starting a new phase.'
    if (withHistory.length === 1) {
      const st = withHistory[0]
      return `Sign type ${st} was last used in Phase ${phaseContext.bySignType[st].maxPhase}.`
    }
    return 'Multiple sign types have different phase histories — showing the continuation from the most recent one.'
  })()

  if (!open) return null

  function rowHasSelection(r) {
    return (
      r.artwork || r.technical || r.location || r.asBuilt ||
      String(r.artHours ?? '').trim() !== '' ||
      String(r.techHours ?? '').trim() !== '' ||
      String(r.locationHours ?? '').trim() !== '' ||
      String(r.asBuiltHours ?? '').trim() !== ''
    )
  }

  // Count ticked discipline checkboxes — each tick = one task
  const selectedCount = rows.reduce((count, row) => {
    for (const child of row.children ?? []) {
      for (const disc of DISCIPLINES) {
        if (child[disc.key]) count += 1
      }
    }
    return count
  }, 0)

  const totalHoursRequired = rows.reduce((sum, row) => {
    for (const child of row.children ?? []) {
      if (child.artwork) sum += Number(child.artHours) || 0
      if (child.technical) sum += Number(child.techHours) || 0
      if (child.location) sum += Number(child.locationHours) || 0
      if (child.asBuilt) sum += Number(child.asBuiltHours) || 0
    }
    return sum
  }, 0)

  function handleSearch() {
    if (!selectedSignType || selectedSignType === 'Select sign type') return
    const match = rows.find((r) => r.signType === selectedSignType)
    if (!match) return
    setExpanded((prev) => { const next = new Set(prev); next.add(match.id); return next })
    setTimeout(() => {
      document.getElementById(`sign-row-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateChildField(rowId, childId, field, value) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              children: row.children.map((child) => {
                if (child.id !== childId) return child
                const updates = { [field]: value }
                if (field === 'artwork' && value && !child.artHours) updates.artHours = '1'
                if (field === 'technical' && value && !child.techHours) updates.techHours = '1'
                if (field === 'location' && value && !child.locationHours) updates.locationHours = '1'
                if (field === 'asBuilt' && value && !child.asBuiltHours) updates.asBuiltHours = '1'
                const isDisciplineToggle = DISCIPLINES.some((d) => d.key === field)
                if (isDisciplineToggle && value && !child.deadline && deadlineInputValue) {
                  updates.deadline = deadlineInputValue
                }
                return { ...child, ...updates }
              }),
            }
          : row,
      ),
    )
  }

  function clearNeeds() {
    setSelectedSignType('')
    setPlanCode('')
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        children: (row.children ?? []).map((child) => emptyWorkFields(child)),
      })),
    )
  }

  async function handleCreateTasks() {
    if (!record) return
    setSubmitAttempted(true)
    const normalizedRevision = revisionCode.trim().toUpperCase()
    const nextFieldErrors = {}
    if (!REVISION_PATTERN.test(normalizedRevision)) {
      nextFieldErrors.revisionCode = 'Revision must be like R0, R1, R2'
    }
    if (!Number.isInteger(Number(phase)) || Number(phase) < 1) {
      nextFieldErrors.phase = 'Phase must be a positive whole number'
    }
    if (!(localDeadline instanceof Date) || Number.isNaN(localDeadline.getTime())) {
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
    const disciplineMap = [
      { flag: 'artwork', hours: 'artHours', label: 'Artwork' },
      { flag: 'technical', hours: 'techHours', label: 'Technical' },
      { flag: 'location', hours: 'locationHours', label: 'Location' },
      { flag: 'asBuilt', hours: 'asBuiltHours', label: 'As-Built' },
    ]
    // Validate only child rows
    for (const row of rows) {
      for (const child of row.children ?? []) {
        for (const { flag, hours, label } of disciplineMap) {
          if (child[flag]) {
            const h = Number(child[hours])
            if (!child[hours] || Number.isNaN(h) || h < 1) {
              toast.error(`${label} hours must be a number (min 1) for all checked disciplines`)
              return
            }
          }
        }
        const hasAnyDiscipline = DISCIPLINES.some((d) => child[d.key])
        if (hasAnyDiscipline && !child.deadline) {
          toast.error(`Deadline is required for "${child.signType || 'sign type'}"`)
          return
        }
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
        ...allUploaded.map((f) => ({ fileKey: f.key, fileName: f.fileName, mimeType: f.mimeType, size: f.size })),
        ...linkAttachments.map((item) => ({ fileKey: item.url, fileName: item.fileName, mimeType: null, size: undefined })),
      ]

      const fallbackDeadline =
        localDeadline instanceof Date && !Number.isNaN(localDeadline.getTime())
          ? localDeadline.toISOString()
          : undefined

      // Resolve the app-DB UUID for this project (auto-hydrates if not yet imported)
      const projectNo = String(record.projectNo ?? record.projectCode ?? '').trim()
      let resolvedProjectId = undefined
      if (projectNo) {
        try {
          const proj = await apiClient.get(`/projects/by-project-no/${encodeURIComponent(projectNo)}`)
          resolvedProjectId = proj?.id ?? undefined
        } catch {
          // non-fatal — backend will reject if truly missing
        }
      }

      function resolveDeadline(rowDeadline) {
        if (rowDeadline) return new Date(rowDeadline).toISOString()
        return fallbackDeadline
      }

      // One entry per ticked discipline per sign type — each entry becomes its own task
      const details = []
      for (const row of rows) {
        for (const child of row.children ?? []) {
          for (const disc of DISCIPLINES) {
            if (!child[disc.key]) continue
            details.push({
              signType: child.signType || undefined,
              signFamily: row.signType || undefined,
              planCode: planCode || undefined,
              disciplineType: disc.label,
              artwork:        disc.key === 'artwork',
              artworkHours:   disc.key === 'artwork' && disc.hoursKey ? Number(child[disc.hoursKey]) : undefined,
              technical:      disc.key === 'technical',
              technicalHours: disc.key === 'technical' && disc.hoursKey ? Number(child[disc.hoursKey]) : undefined,
              location:       disc.key === 'location',
              locationHours:  disc.key === 'location' && disc.hoursKey ? Number(child[disc.hoursKey]) : undefined,
              asBuilt:        disc.key === 'asBuilt',
              asBuiltHours:   disc.key === 'asBuilt' && disc.hoursKey ? Number(child[disc.hoursKey]) : undefined,
              deadline:       resolveDeadline(child.deadline),
              attachments:    allAttachments.length > 0 ? allAttachments : undefined,
            })
          }
        }
      }

      const payload = {
        designType: 'Project',
        task: {
          revisionCode: normalizedRevision,
          phase: Number(phase),
          designType: 'Project',
          opNo: record.opNo ?? undefined,
          projectId: resolvedProjectId ?? undefined,
          projectNo: record.projectNo ?? undefined,
          projectName: record.projectName ?? undefined,
          description: undefined,
          priority: priorityLevel,
          dueDate: fallbackDeadline,
        },
        projectDetails: details,
      }

      const result = await apiClient.post('/tasks/extended', payload)
      const tasks = result?.tasks ?? []
      if (onCreated) onCreated(tasks)
      else onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-16">
      <button type="button" className="absolute inset-0" aria-label="Close dialog" onClick={onClose} />
      <div className="ui-surface relative z-10 w-full max-w-[1200px] overflow-hidden shadow-xl">
        <div className="flex items-start justify-between gap-3 bg-slate-800 px-5 py-4 text-white">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/15">
              <Pencil className="h-4 w-4" />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-semibold leading-tight">Create Task</h2>
              <p className="mt-0.5 text-sm text-slate-200">Get things moving</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Revision <span className="text-red-600">*</span>
              </label>
              <input
                value={revisionCode}
                readOnly
                aria-readonly="true"
                title="Revision is assigned automatically"
                placeholder="R0"
                required
                className="h-10 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none"
              />
              {((submitAttempted || touched.revisionCode) && !REVISION_PATTERN.test(revisionCode.trim().toUpperCase())) || fieldErrors.revisionCode ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.revisionCode || 'Revision must be like R0, R1, R2'}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Phase <span className="text-red-600">*</span>
              </label>
              {phaseContextFailed ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={phase}
                  onChange={(e) => { setPhaseTouched(true); setPhase(e.target.value) }}
                  placeholder="1"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              ) : (
                <select
                  value={phase}
                  onChange={(e) => { setPhaseTouched(true); setPhase(Number(e.target.value)) }}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {Array.from({ length: (phaseContext.maxPhase || 0) + 1 }, (_, i) => i + 1).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === (phaseContext.maxPhase || 0) + 1 ? `Phase ${opt} (New)` : `Phase ${opt}`}
                    </option>
                  ))}
                </select>
              )}
              {fieldErrors.phase ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.phase}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  {phaseContextFailed ? "Couldn't load existing phases — enter manually." : phaseHint}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Deadline for Task Submission <span className="text-red-600">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={deadlineInputValue}
                onChange={(e) => {
                  const d = e.target.value ? new Date(e.target.value) : null
                  setLocalDeadline(d)
                  setFieldErrors((prev) => ({ ...prev, deadline: '' }))
                }}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              {daysFromToday != null && (
                <span className="text-sm text-slate-500">{daysFromToday} day(s) from today</span>
              )}
            </div>
            {(submitAttempted && (!(localDeadline instanceof Date) || Number.isNaN(localDeadline.getTime()))) || fieldErrors.deadline ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.deadline || 'Deadline for Task Submission is required'}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Priority Level</label>
              <select
                value={priorityLevel}
                onChange={(e) => setPriorityLevel(e.target.value)}
                className={`h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${getPriorityClasses(priorityLevel)}`}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Total Hours Required</label>
              <input
                type="number"
                readOnly
                value={totalHoursRequired}
                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none cursor-default"
              />
            </div>
          </div>

          {/* Task Files toggle */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-slate-600">Task Files</label>
              <div className={`inline-flex rounded-md border p-1 text-xs ${fileMode === 'link' || fileMode === 'browse' ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}>
                <button type="button" onClick={() => setFileMode('link')} className={`rounded px-2 py-1 font-semibold transition-colors ${fileMode === 'link' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Paste Link</button>
                <button type="button" onClick={() => setFileMode('browse')} className={`rounded px-2 py-1 font-semibold transition-colors ${fileMode === 'browse' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Browse Files</button>
              </div>
            </div>
            {fileMode === 'link' ? (
              <div className="mt-2 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={linkUrl}
                    onChange={(e) => { setLinkUrl(e.target.value); setLinkError('') }}
                    placeholder="Paste Google Drive/S3/HTTP link"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = linkUrl.trim()
                      if (!isValidHttpUrl(url)) { setLinkError('Enter a valid http/https URL'); return }
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
                  value={selectedFiles.length === 0 ? '' : `${selectedFiles.length} file(s) selected`}
                  readOnly
                  placeholder="Select task files"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
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
              onChange={(e) => { setSelectedFiles(Array.from(e.target.files ?? [])); setUploadedFiles([]) }}
            />
            {(selectedFiles.length > 0 || linkAttachments.length > 0) && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
                {[...selectedFiles.map((f) => f.name), ...linkAttachments.map((i) => i.fileName)].join(', ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSignType}
              onChange={(e) => setSelectedSignType(e.target.value)}
              className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Select sign family</option>
              {rows.map((row) => (
                <option key={row.id} value={row.signType}>{row.signType}</option>
              ))}
            </select>
            <input
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className="h-10 w-40 rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Enter Plan Code"
            />
            <button type="button" onClick={handleSearch} className="h-10 rounded-md bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700">Search</button>
            <button type="button" onClick={clearNeeds} className="h-10 rounded-md border border-slate-300 px-5 text-sm text-slate-700 transition hover:bg-slate-50">Reset / Clear</button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
              {/* Table header */}
              <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_1fr] bg-slate-700 text-xs font-semibold text-white">
                <div className="bg-emerald-600 px-3 py-2">Sign Type</div>
                <div className="px-2 py-2 text-center">Artwork</div>
                <div className="px-2 py-2 text-center">Hours</div>
                <div className="px-2 py-2 text-center">Technical</div>
                <div className="px-2 py-2 text-center">Hours</div>
                <div className="px-2 py-2 text-center">Location</div>
                <div className="px-2 py-2 text-center">Hours</div>
                <div className="px-2 py-2 text-center">As Built</div>
                <div className="px-2 py-2 text-center">Hours</div>
                <div className="bg-amber-500 px-2 py-2">Deadline</div>
              </div>
              <div className="max-h-[360px] overflow-auto">
                {!isQsSignRegisterComplete ? (
                  <div className="px-4 py-10 text-center text-sm text-red-600">Sign types pending from QS.</div>
                ) : rows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">No sign types available.</div>
                ) : rows.map((row) => {
                  const hasChildren = (row.children?.length ?? 0) > 0
                  return (
                    <div key={row.id} id={`sign-row-${row.id}`} className="border-b border-slate-200">
                      {/* Sign family header — expand/collapse only, no checkboxes */}
                      <button
                        type="button"
                        onClick={() => hasChildren && toggleExpand(row.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold ${hasChildren ? 'bg-slate-100 text-slate-800 hover:bg-slate-150 cursor-pointer' : 'bg-slate-50 text-slate-400 cursor-default'}`}
                      >
                        {hasChildren
                          ? (expanded.has(row.id) ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)
                          : <span className="h-3.5 w-3.5 shrink-0" />}
                        {row.signType}
                        <span className="ml-auto text-xs font-normal text-slate-400">
                          {hasChildren ? `${row.children.length} sign type${row.children.length !== 1 ? 's' : ''}` : '(no sign types)'}
                        </span>
                      </button>

                      {/* Child rows — individual sign types, each gets its own task */}
                      {expanded.has(row.id) && (row.children ?? []).map((child) => (
                        <div
                          key={child.id}
                          id={`sign-row-child-${child.id}`}
                          className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_1fr] items-center border-t border-slate-100 bg-white text-xs"
                        >
                          <div className="px-6 py-1.5 font-medium text-slate-700" title={child.description || ''}>{child.signType}</div>
                          <div className="px-2 py-1.5 text-center"><TickBox checked={child.artwork} onChange={(v) => updateChildField(row.id, child.id, 'artwork', v)} /></div>
                          <div className="px-1 py-1.5"><TableInput type="number" value={child.artHours} onChange={(v) => updateChildField(row.id, child.id, 'artHours', v)} /></div>
                          <div className="px-2 py-1.5 text-center"><TickBox checked={child.technical} onChange={(v) => updateChildField(row.id, child.id, 'technical', v)} /></div>
                          <div className="px-1 py-1.5"><TableInput type="number" value={child.techHours} onChange={(v) => updateChildField(row.id, child.id, 'techHours', v)} /></div>
                          <div className="px-2 py-1.5 text-center"><TickBox checked={child.location} onChange={(v) => updateChildField(row.id, child.id, 'location', v)} /></div>
                          <div className="px-1 py-1.5"><TableInput type="number" value={child.locationHours} onChange={(v) => updateChildField(row.id, child.id, 'locationHours', v)} /></div>
                          <div className="px-2 py-1.5 text-center"><TickBox checked={child.asBuilt} onChange={(v) => updateChildField(row.id, child.id, 'asBuilt', v)} /></div>
                          <div className="px-1 py-1.5"><TableInput type="number" value={child.asBuiltHours} onChange={(v) => updateChildField(row.id, child.id, 'asBuiltHours', v)} /></div>
                          <div className="px-2 py-1.5">
                            <input
                              type="date"
                              value={child.deadline}
                              onChange={(e) => updateChildField(row.id, child.id, 'deadline', e.target.value)}
                              className={`w-full rounded-full border px-2 text-xs text-slate-700 outline-none focus:border-blue-400 h-7 ${
                                DISCIPLINES.some((d) => child[d.key]) && !child.deadline
                                  ? 'border-red-400 bg-red-50'
                                  : 'border-slate-200 bg-slate-50'
                              }`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

          <div className="flex items-center justify-between pt-2">
            <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} selected
            </div>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              onClick={handleCreateTasks}
              className="rounded-md bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
              disabled={
                !isQsSignRegisterComplete ||
                selectedCount === 0 ||
                submitting ||
                !REVISION_PATTERN.test(revisionCode.trim().toUpperCase()) ||
                !Number.isInteger(Number(phase)) || Number(phase) < 1 ||
                !(localDeadline instanceof Date) ||
                Number.isNaN(localDeadline.getTime())
              }
              title={selectedCount === 0 ? 'Select at least one sign type row with a discipline checked' : undefined}
            >
              {submitting ? 'Creating...' : `Create ${selectedCount > 1 ? `${selectedCount} Tasks` : 'Task'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
