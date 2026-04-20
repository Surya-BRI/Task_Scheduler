// @ts-nocheck
import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'

const SIGN_TYPE_ROWS = [
  {
    id: 'b315',
    signType: 'B315',
    artwork: '',
    artHours: '2',
    technical: '',
    techHours: '2',
    location: '',
    locationHours: '2',
    asBuilt: '',
    asBuiltHours: '2',
    deadline: 'DD-MM-YYYY',
    children: [
      { id: 'b315-1', signType: 'CP-2-348', artHours: '2', techHours: '2', locationHours: '2', asBuiltHours: '2' },
      { id: 'b315-2', signType: 'CP-2-347', artHours: '', techHours: '0', locationHours: '', asBuiltHours: '0' },
      { id: 'b315-3', signType: 'CP-2-346', artHours: '0', techHours: '0', locationHours: '0', asBuiltHours: '0' },
      { id: 'b315-4', signType: 'CP-2-345', artHours: '0', techHours: '0', locationHours: '0', asBuiltHours: '0' },
    ],
  },
  { id: 'b316', signType: 'B316', artwork: '', artHours: '2', technical: '', techHours: '2', location: '', locationHours: '2', asBuilt: '', asBuiltHours: '2', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b317', signType: 'B317', artwork: '', artHours: '', technical: '', techHours: '0', location: '', locationHours: '0', asBuilt: '', asBuiltHours: '0', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b318', signType: 'B318', artwork: '', artHours: '0', technical: '', techHours: '0', location: '', locationHours: '0', asBuilt: '', asBuiltHours: '0', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b319', signType: 'B319', artwork: '', artHours: '0', technical: '', techHours: '0', location: '', locationHours: '0', asBuilt: '', asBuiltHours: '0', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b320', signType: 'B320', artwork: '', artHours: '0', technical: '', techHours: '0', location: '', locationHours: '0', asBuilt: '', asBuiltHours: '0', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b321', signType: 'B321', artwork: '', artHours: '', technical: '', techHours: '0', location: '', locationHours: '0', asBuilt: '', asBuiltHours: '0', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b322', signType: 'B322', artwork: '', artHours: '0', technical: '', techHours: '0', location: '', locationHours: '0', asBuilt: '', asBuiltHours: '0', deadline: 'DD-MM-YYYY', children: [] },
  { id: 'b323', signType: 'B323', artwork: '', artHours: '2', technical: '', techHours: '2', location: '', locationHours: '2', asBuilt: '', asBuiltHours: '2', deadline: 'DD-MM-YYYY', children: [] },
]

function HoursInput({ value }) {
  return <input value={value} readOnly className="h-6 w-full rounded-full border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600" />
}

export function ProjectCreateTaskModal({ open, onClose }) {
  const titleId = useId()
  const [expanded, setExpanded] = useState(() => new Set(['b315']))
  const [selectedNeeds, setSelectedNeeds] = useState(() => new Set())

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

  const selectedCount = selectedNeeds.size
  const flatChildIds = useMemo(
    () => SIGN_TYPE_ROWS.flatMap((row) => row.children.map((child) => child.id)),
    [],
  )

  if (!open) return null

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleNeed(id) {
    setSelectedNeeds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearNeeds() {
    setSelectedNeeds(new Set())
  }

  function selectAllNeeds() {
    setSelectedNeeds(new Set(flatChildIds))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-16">
      <button type="button" className="absolute inset-0" aria-label="Close dialog" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[1200px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#1f3b68] px-6 py-5 text-white">
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-white/15">
              <Pencil className="h-4 w-4" />
            </span>
            <div>
              <h2 id={titleId} className="text-[36px] font-semibold leading-none tracking-tight">
                Create Task
              </h2>
              <p className="mt-1 text-3xl text-blue-100">Get things moving</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Close">
            <X className="h-8 w-8" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto_auto] gap-4">
            <select className="h-11 rounded border border-slate-400 px-3 text-base"><option>Select sign type</option></select>
            <input className="h-11 rounded border border-slate-400 px-3 text-base" placeholder="Enter Plan Code" />
            <select className="h-11 rounded border border-slate-400 px-3 text-base"><option>Select Area</option></select>
            <select className="h-11 rounded border border-slate-400 px-3 text-base"><option>Select Level</option></select>
            <button type="button" className="h-11 rounded bg-[#1f3b68] px-8 text-base font-semibold text-white">Search</button>
            <button type="button" onClick={clearNeeds} className="h-11 rounded border border-slate-400 px-6 text-base">Reset / Clear</button>
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
              <div className="px-3 py-2">Need</div>
              <div className="bg-[#f59e0b] px-3 py-2">Deadline</div>
            </div>

            <div className="max-h-[360px] overflow-auto">
              {SIGN_TYPE_ROWS.map((row) => (
                <div key={row.id} className="border-b border-slate-200">
                  <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.8fr_1.1fr] items-center bg-white text-sm">
                    <button type="button" onClick={() => toggleExpand(row.id)} className="flex items-center gap-1 px-3 py-1.5 text-left font-semibold">
                      {expanded.has(row.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {row.signType}
                    </button>
                    <div className="px-3 py-1.5" />
                    <div className="px-2 py-1.5"><HoursInput value={row.artHours} /></div>
                    <div className="px-3 py-1.5" />
                    <div className="px-2 py-1.5"><HoursInput value={row.techHours} /></div>
                    <div className="px-3 py-1.5" />
                    <div className="px-2 py-1.5"><HoursInput value={row.locationHours} /></div>
                    <div className="px-3 py-1.5" />
                    <div className="px-2 py-1.5"><HoursInput value={row.asBuiltHours} /></div>
                    <div className="px-3 py-1.5 text-center text-xs text-slate-400">-</div>
                    <div className="px-3 py-1.5"><input value={row.deadline} readOnly className="h-6 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-500" /></div>
                  </div>

                  {expanded.has(row.id) &&
                    row.children.map((child) => (
                      <div key={child.id} className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.9fr_0.8fr_0.8fr_1.1fr] items-center border-t border-slate-100 bg-slate-50/80 text-xs">
                        <div className="px-8 py-1.5 text-slate-700">{child.signType}</div>
                        <div className="px-3 py-1.5" />
                        <div className="px-2 py-1.5"><HoursInput value={child.artHours} /></div>
                        <div className="px-3 py-1.5" />
                        <div className="px-2 py-1.5"><HoursInput value={child.techHours} /></div>
                        <div className="px-3 py-1.5" />
                        <div className="px-2 py-1.5"><HoursInput value={child.locationHours} /></div>
                        <div className="px-3 py-1.5" />
                        <div className="px-2 py-1.5"><HoursInput value={child.asBuiltHours} /></div>
                        <div className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={selectedNeeds.has(child.id)} onChange={() => toggleNeed(child.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                        </div>
                        <div className="px-3 py-1.5"><input value="DD-MM-YYYY" readOnly className="h-6 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-500" /></div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={selectAllNeeds} className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {selectedCount} tasks selected
            </button>
            <button type="button" className="rounded-md bg-[#1f3b68] px-8 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={selectedCount === 0}>
              Create Tasks
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
