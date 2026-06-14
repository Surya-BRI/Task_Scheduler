import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High']
const REVISION_PATTERN = /^R\d+$/

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
    bim: false,
    deadline: '',
  }
}

function buildRowsFromApi(groups) {
  return groups.map((group) =>
    emptyWorkFields({
      id: `family-${group.signFmilyId ?? group.signfamily}`,
      signType: group.signfamily,
      quantity: null,
      area: null,
      description: '',
      estimationStatus: '',
      children: group.signTypes.map((st) =>
        emptyWorkFields({
          id: `sign-${st.signTypeId}`,
          signType: st.signCode,
          quantity: st.quantity,
          area: st.area,
          description: st.description,
          estimationStatus: st.estimationStatus,
        }),
      ),
    }),
  )
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

export function ProjectCreateTaskModal({ open, onClose, onCreated, submissionDate, record }) {
  const titleId = useId()
  const revisionFetched = useRef(false)
  const [rows, setRows] = useState([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [rowsError, setRowsError] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedSignType, setSelectedSignType] = useState('')
  const [planCode, setPlanCode] = useState('')
  const [priorityLevel, setPriorityLevel] = useState('Medium')
  const [hoursRequired, setHoursRequired] = useState('')
  const [localDeadline, setLocalDeadline] = useState(null)
  const [revisionCode, setRevisionCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

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
    setRevisionCode('')
    setPriorityLevel('Medium')
    setHoursRequired('')
    setLocalDeadline(submissionDate instanceof Date && !Number.isNaN(submissionDate.getTime()) ? submissionDate : null)
    setSelectedSignType('')
    setPlanCode('')
    setExpanded(new Set())
    setFieldErrors({})
    setTouched({})
    setSubmitAttempted(false)
    setError('')
  }, [open, submissionDate])

  // Fetch sign types from live DB when modal opens
  useEffect(() => {
    if (!open || !record) return
    const opNo = String(record.opNo ?? '').trim()
    if (!opNo) {
      setRows([])
      setRowsError('No OP code found for this project — cannot load sign types.')
      return
    }
    let alive = true
    setRowsLoading(true)
    setRowsError('')
    apiClient
      .get(`/design-list/project-sign-types?salesForceCode=${encodeURIComponent(opNo)}`)
      .then((groups) => {
        if (!alive) return
        const list = Array.isArray(groups) ? groups : []
        const built = buildRowsFromApi(list)
        setRows(built)
        if (built.length === 0) setRowsError('No approved sign types found for this project in the ERP.')
      })
      .catch((err) => {
        if (!alive) return
        setRowsError(err instanceof Error ? err.message : 'Failed to load sign types from ERP.')
        setRows([])
      })
      .finally(() => { if (alive) setRowsLoading(false) })
    return () => { alive = false }
  }, [open, record])

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

  if (!open) return null

  function rowHasSelection(r) {
    return (
      r.artwork || r.technical || r.location || r.asBuilt || r.bim ||
      String(r.artHours ?? '').trim() !== '' ||
      String(r.techHours ?? '').trim() !== '' ||
      String(r.locationHours ?? '').trim() !== '' ||
      String(r.asBuiltHours ?? '').trim() !== ''
    )
  }

  const selectedCount = rows.reduce((count, row) => {
    let c = rowHasSelection(row) ? 1 : 0
    for (const child of row.children ?? []) {
      if (rowHasSelection(child)) c += 1
    }
    return count + c
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

  function updateRowField(rowId, field, value) {
    setRows((prev) => prev.map((row) => row.id === rowId ? { ...row, [field]: value } : row))
  }

  function updateChildField(rowId, childId, field, value) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, children: row.children.map((child) => child.id === childId ? { ...child, [field]: value } : child) }
          : row,
      ),
    )
  }

  function clearNeeds() {
    setSelectedSignType('')
    setPlanCode('')
    setHoursRequired('')
    setRows((prev) =>
      prev.map((row) => ({
        ...emptyWorkFields(row),
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
    setFieldErrors({})
    setError('')
    setSubmitting(true)
    try {
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

      const details = []
      for (const row of rows) {
        if (rowHasSelection(row)) {
          details.push({
            signType: row.signType || undefined,
            planCode: planCode || undefined,
            area: undefined,
            level: undefined,
            artwork: !!row.artwork,
            artworkHours: row.artHours ? Number(row.artHours) : undefined,
            technical: !!row.technical,
            technicalHours: row.techHours ? Number(row.techHours) : undefined,
            location: !!row.location,
            locationHours: row.locationHours ? Number(row.locationHours) : undefined,
            asBuilt: !!row.asBuilt,
            asBuiltHours: row.asBuiltHours ? Number(row.asBuiltHours) : undefined,
            bim: !!row.bim,
            deadline: resolveDeadline(row.deadline),
          })
        }
        for (const child of row.children ?? []) {
          if (rowHasSelection(child)) {
            details.push({
              signType: child.signType || undefined,
              planCode: planCode || undefined,
              area: undefined,
              level: undefined,
              artwork: !!child.artwork,
              artworkHours: child.artHours ? Number(child.artHours) : undefined,
              technical: !!child.technical,
              technicalHours: child.techHours ? Number(child.techHours) : undefined,
              location: !!child.location,
              locationHours: child.locationHours ? Number(child.locationHours) : undefined,
              asBuilt: !!child.asBuilt,
              asBuiltHours: child.asBuiltHours ? Number(child.asBuiltHours) : undefined,
              bim: !!child.bim,
              deadline: resolveDeadline(child.deadline),
            })
          }
        }
      }

      const payload = {
        designType: 'Project',
        task: {
          revisionCode: normalizedRevision,
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

      const created = await apiClient.post('/tasks/extended', payload)
      if (onCreated) onCreated(created)
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
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Revision <span className="text-red-600">*</span>
            </label>
            <input
              value={revisionCode}
              onChange={(e) => {
                setRevisionCode(e.target.value.toUpperCase())
                setFieldErrors((prev) => ({ ...prev, revisionCode: '' }))
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, revisionCode: true }))}
              placeholder="R0"
              required
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            {((submitAttempted || touched.revisionCode) && !REVISION_PATTERN.test(revisionCode.trim().toUpperCase())) || fieldErrors.revisionCode ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.revisionCode || 'Revision must be like R0, R1, R2'}</p>
            ) : null}
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
              <label className="mb-1 block text-xs font-semibold text-slate-600">Hours Required</label>
              <input
                type="number"
                min="0"
                value={hoursRequired}
                onChange={(e) => setHoursRequired(e.target.value)}
                placeholder="0"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSignType}
              onChange={(e) => setSelectedSignType(e.target.value)}
              className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option>Select sign type</option>
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

          {rowsLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-slate-200 py-16 text-sm text-slate-500">
              Loading sign types from ERP…
            </div>
          ) : rowsError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
              {rowsError}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.5fr_1fr] bg-slate-700 text-xs font-semibold text-white">
                <div className="bg-emerald-600 px-3 py-2">Sign Type</div>
                <div className="px-2 py-2">Artwork</div>
                <div className="px-2 py-2">Hours</div>
                <div className="px-2 py-2">Technical</div>
                <div className="px-2 py-2">Hours</div>
                <div className="px-2 py-2">Location</div>
                <div className="px-2 py-2">Hours</div>
                <div className="px-2 py-2">As Built</div>
                <div className="px-2 py-2">Hours</div>
                <div className="px-2 py-2">BIM</div>
                <div className="bg-amber-500 px-2 py-2">Deadline</div>
              </div>
              <div className="max-h-[360px] overflow-auto">
                {rows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">No sign types available.</div>
                ) : rows.map((row) => (
                  <div key={row.id} id={`sign-row-${row.id}`} className="border-b border-slate-200">
                    {/* parent row = sign family */}
                    <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.5fr_1fr] items-center bg-white text-sm">
                      <button type="button" onClick={() => toggleExpand(row.id)} className="flex items-center gap-1 px-3 py-1.5 text-left font-semibold text-slate-800">
                        {(row.children ?? []).length > 0
                          ? (expanded.has(row.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                          : <span className="h-3.5 w-3.5" />}
                        {row.signType}
                      </button>
                      <div className="px-2 py-1.5 text-center"><TickBox checked={row.artwork} onChange={(v) => updateRowField(row.id, 'artwork', v)} /></div>
                      <div className="px-1 py-1.5"><TableInput type="number" value={row.artHours} onChange={(v) => updateRowField(row.id, 'artHours', v)} /></div>
                      <div className="px-2 py-1.5 text-center"><TickBox checked={row.technical} onChange={(v) => updateRowField(row.id, 'technical', v)} /></div>
                      <div className="px-1 py-1.5"><TableInput type="number" value={row.techHours} onChange={(v) => updateRowField(row.id, 'techHours', v)} /></div>
                      <div className="px-2 py-1.5 text-center"><TickBox checked={row.location} onChange={(v) => updateRowField(row.id, 'location', v)} /></div>
                      <div className="px-1 py-1.5"><TableInput type="number" value={row.locationHours} onChange={(v) => updateRowField(row.id, 'locationHours', v)} /></div>
                      <div className="px-2 py-1.5 text-center"><TickBox checked={row.asBuilt} onChange={(v) => updateRowField(row.id, 'asBuilt', v)} /></div>
                      <div className="px-1 py-1.5"><TableInput type="number" value={row.asBuiltHours} onChange={(v) => updateRowField(row.id, 'asBuiltHours', v)} /></div>
                      <div className="px-2 py-1.5 text-center"><TickBox checked={row.bim} onChange={(v) => updateRowField(row.id, 'bim', v)} /></div>
                      <div className="px-2 py-1.5"><TableInput type="date" value={row.deadline} onChange={(v) => updateRowField(row.id, 'deadline', v)} /></div>
                    </div>

                    {/* child rows = individual sign codes with real ERP data */}
                    {expanded.has(row.id) && (row.children ?? []).map((child) => (
                      <div key={child.id} className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.8fr_0.6fr_0.5fr_1fr] items-center border-t border-slate-100 bg-slate-50/80 text-xs">
                        <div className="px-8 py-1.5 font-medium text-slate-700" title={child.description || ''}>{child.signType}</div>
                        <div className="px-2 py-1.5 text-center"><TickBox checked={child.artwork} onChange={(v) => updateChildField(row.id, child.id, 'artwork', v)} /></div>
                        <div className="px-1 py-1.5"><TableInput type="number" value={child.artHours} onChange={(v) => updateChildField(row.id, child.id, 'artHours', v)} /></div>
                        <div className="px-2 py-1.5 text-center"><TickBox checked={child.technical} onChange={(v) => updateChildField(row.id, child.id, 'technical', v)} /></div>
                        <div className="px-1 py-1.5"><TableInput type="number" value={child.techHours} onChange={(v) => updateChildField(row.id, child.id, 'techHours', v)} /></div>
                        <div className="px-2 py-1.5 text-center"><TickBox checked={child.location} onChange={(v) => updateChildField(row.id, child.id, 'location', v)} /></div>
                        <div className="px-1 py-1.5"><TableInput type="number" value={child.locationHours} onChange={(v) => updateChildField(row.id, child.id, 'locationHours', v)} /></div>
                        <div className="px-2 py-1.5 text-center"><TickBox checked={child.asBuilt} onChange={(v) => updateChildField(row.id, child.id, 'asBuilt', v)} /></div>
                        <div className="px-1 py-1.5"><TableInput type="number" value={child.asBuiltHours} onChange={(v) => updateChildField(row.id, child.id, 'asBuiltHours', v)} /></div>
                        <div className="px-2 py-1.5 text-center"><TickBox checked={child.bim} onChange={(v) => updateChildField(row.id, child.id, 'bim', v)} /></div>
                        <div className="px-2 py-1.5"><TableInput type="date" value={child.deadline} onChange={(v) => updateChildField(row.id, child.id, 'deadline', v)} /></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {selectedCount} tasks selected
            </div>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              onClick={handleCreateTasks}
              className="rounded-md bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
              disabled={
                rowsLoading ||
                selectedCount === 0 ||
                submitting ||
                !REVISION_PATTERN.test(revisionCode.trim().toUpperCase()) ||
                !(localDeadline instanceof Date) ||
                Number.isNaN(localDeadline.getTime())
              }
              title={selectedCount === 0 ? 'Select at least one work type or enter hours on a row' : undefined}
            >
              {submitting ? 'Creating...' : 'Create Tasks'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
