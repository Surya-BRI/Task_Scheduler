// @ts-nocheck
import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'

const AREA_OPTIONS = ['Area A', 'Area B', 'Area C', 'Area D']
const LEVEL_OPTIONS = ['Level 1', 'Level 2', 'Level 3', 'Level 4']

const SIGN_TYPE_ROWS = [
  {
    id: 'b315',
    signType: 'B315',
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
    children: [
      { id: 'b315-1', signType: 'CP-2-348', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b315-2', signType: 'CP-2-347', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b315-3', signType: 'CP-2-346', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b315-4', signType: 'CP-2-345', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b316',
    signType: 'B316',
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
    children: [
      { id: 'b316-1', signType: 'CP-3-110', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b316-2', signType: 'CP-3-111', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b316-3', signType: 'CP-3-112', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b317',
    signType: 'B317',
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
    children: [
      { id: 'b317-1', signType: 'CP-4-210', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b317-2', signType: 'CP-4-211', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b318',
    signType: 'B318',
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
    children: [
      { id: 'b318-1', signType: 'CP-5-300', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b318-2', signType: 'CP-5-301', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b319',
    signType: 'B319',
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
    children: [
      { id: 'b319-1', signType: 'CP-6-420', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b319-2', signType: 'CP-6-421', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b320',
    signType: 'B320',
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
    children: [
      { id: 'b320-1', signType: 'CP-7-510', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b320-2', signType: 'CP-7-511', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b321',
    signType: 'B321',
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
    children: [
      { id: 'b321-1', signType: 'CP-8-610', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b321-2', signType: 'CP-8-611', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b322',
    signType: 'B322',
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
    children: [
      { id: 'b322-1', signType: 'CP-9-710', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b322-2', signType: 'CP-9-711', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
  {
    id: 'b323',
    signType: 'B323',
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
    children: [
      { id: 'b323-1', signType: 'CP-10-810', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
      { id: 'b323-2', signType: 'CP-10-811', artwork: false, artHours: '', technical: false, techHours: '', location: false, locationHours: '', asBuilt: false, asBuiltHours: '', bim: false, deadline: '' },
    ],
  },
]

function TableInput({ value, onChange, type = 'text', placeholder = '' }) {
  return (
    <input
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-6 w-full rounded-full border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-blue-400"
    />
  )
}

function TickBox({ checked, onChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-blue-600"
    />
  )
}

export function ProjectCreateTaskModal({ open, onClose }) {
  const titleId = useId()
  const [rows, setRows] = useState(() => structuredClone(SIGN_TYPE_ROWS))
  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedSignType, setSelectedSignType] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedLevel, setSelectedLevel] = useState('')
  const [planCode, setPlanCode] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  function rowHasSelection(r) {
    const hasFlag =
      r.artwork || r.technical || r.location || r.asBuilt || r.bim
    const hasHours = [r.artHours, r.techHours, r.locationHours, r.asBuiltHours].some(
      (h) => String(h ?? '').trim() !== '',
    )
    return hasFlag || hasHours
  }

  /** Count sign-type lines (parent row + child rows) that have any work type or hours — not BIM-only. */
  const selectedCount = rows.reduce((count, row) => {
    let c = 0
    if (rowHasSelection(row)) c += 1
    for (const child of row.children) {
      if (rowHasSelection(child)) c += 1
    }
    return count + c
  }, 0)

  if (!open) return null

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateRowField(rowId, field, value) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    )
  }

  function updateChildField(rowId, childId, field, value) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              children: row.children.map((child) =>
                child.id === childId ? { ...child, [field]: value } : child,
              ),
            }
          : row,
      ),
    )
  }

  function emptyWorkFields(r) {
    return {
      ...r,
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

  function clearNeeds() {
    setSelectedSignType('')
    setSelectedArea('')
    setSelectedLevel('')
    setPlanCode('')
    setRows((prev) =>
      prev.map((row) => ({
        ...emptyWorkFields(row),
        children: row.children.map((child) => emptyWorkFields(child)),
      })),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-16">
      <button type="button" className="absolute inset-0" aria-label="Close dialog" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[1200px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 bg-[#0f4a7a] px-5 py-4 text-white">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/15">
              <Pencil className="h-4 w-4" />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-semibold leading-tight">
                Create Task
              </h2>
              <p className="mt-0.5 text-sm text-blue-100">Get things moving</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto_auto] gap-4">
            <select
              value={selectedSignType}
              onChange={(event) => setSelectedSignType(event.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option>Select sign type</option>
              {rows.map((row) => (
                <option key={row.id} value={row.signType}>
                  {row.signType}
                </option>
              ))}
            </select>
            <input
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              placeholder="Enter Plan Code"
            />
            <select
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Select Area</option>
              {AREA_OPTIONS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <select
              value={selectedLevel}
              onChange={(event) => setSelectedLevel(event.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Select Level</option>
              {LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <button type="button" className="h-10 rounded-md bg-[#1f3b68] px-8 text-sm font-semibold text-white">Search</button>
            <button type="button" onClick={clearNeeds} className="h-10 rounded-md border border-slate-300 px-6 text-sm">Reset / Clear</button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.8fr_1.1fr] bg-[#334b6f] text-xs font-semibold text-white">
              <div className="bg-[#16a34a] px-3 py-2">Sign Type</div>
              <div className="px-3 py-2">Artwork</div>
              <div className="px-3 py-2">Hours</div>
              <div className="px-3 py-2">Technical</div>
              <div className="px-3 py-2">Hours</div>
              <div className="px-3 py-2">Location</div>
              <div className="px-3 py-2">Hours</div>
              <div className="px-3 py-2">AS Built</div>
              <div className="px-3 py-2">Hours</div>
              <div className="px-3 py-2">BIM</div>
              <div className="bg-[#f59e0b] px-3 py-2">Deadline</div>
            </div>

            <div className="max-h-[360px] overflow-auto">
              {rows.map((row) => (
                <div key={row.id} className="border-b border-slate-200">
                  <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.8fr_1.1fr] items-center bg-white text-sm">
                    <button type="button" onClick={() => toggleExpand(row.id)} className="flex items-center gap-1 px-3 py-1.5 text-left font-semibold">
                      {expanded.has(row.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {row.signType}
                    </button>
                    <div className="px-3 py-1.5 text-center"><TickBox checked={row.artwork} onChange={(value) => updateRowField(row.id, 'artwork', value)} /></div>
                    <div className="px-2 py-1.5"><TableInput type="number" value={row.artHours} onChange={(value) => updateRowField(row.id, 'artHours', value)} /></div>
                    <div className="px-3 py-1.5 text-center"><TickBox checked={row.technical} onChange={(value) => updateRowField(row.id, 'technical', value)} /></div>
                    <div className="px-2 py-1.5"><TableInput type="number" value={row.techHours} onChange={(value) => updateRowField(row.id, 'techHours', value)} /></div>
                    <div className="px-3 py-1.5 text-center"><TickBox checked={row.location} onChange={(value) => updateRowField(row.id, 'location', value)} /></div>
                    <div className="px-2 py-1.5"><TableInput type="number" value={row.locationHours} onChange={(value) => updateRowField(row.id, 'locationHours', value)} /></div>
                    <div className="px-3 py-1.5 text-center"><TickBox checked={row.asBuilt} onChange={(value) => updateRowField(row.id, 'asBuilt', value)} /></div>
                    <div className="px-2 py-1.5"><TableInput type="number" value={row.asBuiltHours} onChange={(value) => updateRowField(row.id, 'asBuiltHours', value)} /></div>
                    <div className="px-3 py-1.5 text-center">
                      <TickBox checked={row.bim} onChange={(value) => updateRowField(row.id, 'bim', value)} />
                    </div>
                    <div className="px-3 py-1.5"><TableInput value={row.deadline} onChange={(value) => updateRowField(row.id, 'deadline', value)} placeholder="DD-MM-YYYY" /></div>
                  </div>

                  {expanded.has(row.id) &&
                    row.children.map((child) => (
                      <div key={child.id} className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.8fr_1.1fr] items-center border-t border-slate-100 bg-slate-50/80 text-xs">
                        <div className="px-8 py-1.5 text-slate-700">{child.signType}</div>
                        <div className="px-3 py-1.5 text-center"><TickBox checked={child.artwork} onChange={(value) => updateChildField(row.id, child.id, 'artwork', value)} /></div>
                        <div className="px-2 py-1.5"><TableInput type="number" value={child.artHours} onChange={(value) => updateChildField(row.id, child.id, 'artHours', value)} /></div>
                        <div className="px-3 py-1.5 text-center"><TickBox checked={child.technical} onChange={(value) => updateChildField(row.id, child.id, 'technical', value)} /></div>
                        <div className="px-2 py-1.5"><TableInput type="number" value={child.techHours} onChange={(value) => updateChildField(row.id, child.id, 'techHours', value)} /></div>
                        <div className="px-3 py-1.5 text-center"><TickBox checked={child.location} onChange={(value) => updateChildField(row.id, child.id, 'location', value)} /></div>
                        <div className="px-2 py-1.5"><TableInput type="number" value={child.locationHours} onChange={(value) => updateChildField(row.id, child.id, 'locationHours', value)} /></div>
                        <div className="px-3 py-1.5 text-center"><TickBox checked={child.asBuilt} onChange={(value) => updateChildField(row.id, child.id, 'asBuilt', value)} /></div>
                        <div className="px-2 py-1.5"><TableInput type="number" value={child.asBuiltHours} onChange={(value) => updateChildField(row.id, child.id, 'asBuiltHours', value)} /></div>
                        <div className="px-3 py-1.5 text-center">
                          <TickBox checked={child.bim} onChange={(value) => updateChildField(row.id, child.id, 'bim', value)} />
                        </div>
                        <div className="px-3 py-1.5"><TableInput value={child.deadline} onChange={(value) => updateChildField(row.id, child.id, 'deadline', value)} placeholder="DD-MM-YYYY" /></div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {selectedCount} tasks selected
            </div>
            <button
              type="button"
              className="rounded-md bg-[#1f3b68] px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163056] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f3b68] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? 'Select at least one work type or enter hours on a row' : undefined}
            >
              Create Tasks
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
