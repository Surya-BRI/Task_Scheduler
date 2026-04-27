import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, CircleCheck, Clock3, Flag, Hourglass, Info, Pencil, Shield, Upload } from 'lucide-react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { ProjectCreateTaskModal } from '../components/ProjectCreateTaskModal'
import { Navbar } from '../components/Navbar'
import { useDesignListStore } from '../state/DesignListContext'

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

const PROJECT_HISTORY = [
  'Designer viewed the task',
  'HOD reviewed and assigned to Designer',
  'Filled the details and assigned to HOD',
  'Got request from the client',
]

const FIELD_HISTORY = [
  'Opportunity Owner changed by Rigvender Singh',
  'Total Opportunity Value updated by Lara Thompson',
  'Stage changed to Estimation/BOQ by Ahmed Khalil',
]

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

function FormFieldWithPencil({ id, label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-2.5 pr-9 text-[13px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400" aria-hidden>
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

function FilesPanel() {
  const fileInputRef = useRef(null)

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Files</h2>
      <button
        type="button"
        onClick={openFilePicker}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload Files
      </button>
      <input ref={fileInputRef} type="file" className="hidden" />
      <div className="mt-2 rounded-md border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">
        Drag &amp; drop files here or click to browse.
        <span className="mt-1 block text-xs text-slate-400">Supported: Audio, MP4 Files.</span>
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

const TASK_TAB_IDS = ['details', 'activity', 'chatter', 'team']

export function TaskDetailsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { taskId } = useParams()
  const { records } = useDesignListStore()
  const record = records.find((item) => item.id === taskId)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [projectCreateModalOpen, setProjectCreateModalOpen] = useState(false)
  const [chatterMessage, setChatterMessage] = useState('')
  const [chatterEntries, setChatterEntries] = useState([])
  const [priorityLevel, setPriorityLevel] = useState('')
  const [hoursRequired, setHoursRequired] = useState('')
  const [dateIssued, setDateIssued] = useState('')
  const [dateSubmission, setDateSubmission] = useState('')
  const [technicalHead, setTechnicalHead] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [subTeamLead, setSubTeamLead] = useState('')
  const [designers, setDesigners] = useState('')

  useEffect(() => {
    if (!record) {
      router.replace('/design-list')
    }
  }, [record, router])

  const isCreateRequested = searchParams.get('create') === '1'

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

  if (!record) {
    return null
  }

  const isRetail = record.designType === 'Retail'
  const rawTab = searchParams.get('tab')
  const activeTab =
    TASK_TAB_IDS.includes(rawTab) && !(rawTab === 'team' && isRetail)
      ? rawTab
      : 'details'
  const tabs = isRetail ? TABS : [...TABS, PROJECT_TAB]
  const from = searchParams.get('from')
  const backPath =
    from === 'project-design'
      ? '/project-design'
      : from === 'projects-list'
        ? '/projects-list'
        : '/design-list'
  const pageTitle = `${record.name.toUpperCase()} — ${record.clientName ?? record.businessUnit} @ ${record.businessUnit.toUpperCase()}`
  const canPostChatter = chatterMessage.trim().length > 0

  function handlePostChatter() {
    const normalized = chatterMessage.trim()
    if (!normalized) return
    setChatterEntries((prev) => [{ id: Date.now(), text: normalized }, ...prev])
    setChatterMessage('')
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

          <h1 className="text-base font-semibold leading-tight tracking-tight text-slate-900 sm:text-lg">
            {pageTitle}
          </h1>
          <p className="text-xs text-slate-500">
            Retail tasks use CreateTaskModal; project tasks use ProjectCreateTaskModal.
          </p>

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
                <p className="text-[11px] text-slate-500">OP NO: {record.opNo.replace('OP- ', 'OP-')}</p>
              </div>

              {activeTab === 'details' ? (
                <>
                  <div className="mt-2.5 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-0.5">
                      <DetailRow label="Project Name" value={`${record.name} — ${record.clientName ?? record.businessUnit}`} />
                      <DetailRow label="OP No" value={record.opNo.replace(/^OP-\s*/, 'OP')} />
                      <DetailRow label="Project No" value={record.projectNo} />
                    </div>
                    <div className="space-y-0.5">
                      <DetailRow label="Project Location" value={`${record.businessUnit.toUpperCase()} — main site`} />
                      <DetailRow label="Business Unit" value={record.businessUnit} />
                      <DetailRow label="Sales Person" value={record.salesPerson} />
                    </div>
                  </div>

                  {isRetail ? (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <FormFieldWithPencil
                          id="retail-priority"
                          label="Priority Level"
                          value={priorityLevel}
                          onChange={setPriorityLevel}
                          placeholder=""
                        />
                        <FormFieldWithPencil
                          id="retail-hours"
                          label="Hours Required"
                          value={hoursRequired}
                          onChange={setHoursRequired}
                          placeholder=""
                        />
                        <FormFieldWithPencil
                          id="retail-issued"
                          label="Date of Issued"
                          value={dateIssued}
                          onChange={setDateIssued}
                          placeholder=""
                        />
                        <FormFieldWithPencil
                          id="retail-submission"
                          label="Date of Submission"
                          value={dateSubmission}
                          onChange={setDateSubmission}
                          placeholder=""
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
                        <FormFieldWithPencil id="project-priority" label="Priority Level" value={priorityLevel} onChange={setPriorityLevel} placeholder="" />
                        <FormFieldWithPencil id="project-hours" label="Hours Required" value={hoursRequired} onChange={setHoursRequired} placeholder="" />
                        <FormFieldWithPencil id="project-issued" label="Date of Issued" value={dateIssued} onChange={setDateIssued} placeholder="" />
                        <FormFieldWithPencil id="project-submission" label="Date of Submission" value={dateSubmission} onChange={setDateSubmission} placeholder="" />
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
                <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No activity entries yet.
                </div>
              ) : null}

              {activeTab === 'chatter' ? (
                <div className="mt-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <label htmlFor="chatter-input" className="text-xs font-semibold text-slate-700">
                      Enter a chatter message
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
                        disabled={!canPostChatter}
                        className="rounded-md bg-[#10a6e3] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f96cd] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Post
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 max-h-[210px] space-y-1.5 overflow-auto pr-1">
                    {chatterEntries.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">
                        No chatter messages yet.
                      </div>
                    ) : (
                      chatterEntries.map((entry) => (
                        <article key={entry.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800">
                          {entry.text}
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
                    {PROJECT_HISTORY.map((entry, idx) => (
                      <li key={entry} className="border-b border-slate-100 pb-1.5 last:border-b-0">
                        <p className="text-[10px] text-slate-500">2026-02-0{idx + 1}</p>
                        <p>{entry}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                  <h2 className="text-xs font-semibold text-slate-900">Field History</h2>
                  <ul className="mt-2 space-y-2 text-xs text-slate-700">
                    {FIELD_HISTORY.map((entry, idx) => (
                      <li key={entry}>
                        <p className="text-xs text-slate-500">202{idx + 4}-02-1{idx + 2}</p>
                        <p>{entry}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <FilesPanel />
            </aside>
          </div>
        </div>
      </main>

      <CreateTaskModal
        open={createModalOpen || (isCreateRequested && isRetail)}
        onClose={() => setCreateModalOpen(false)}
      />
      <ProjectCreateTaskModal
        open={projectCreateModalOpen || (isCreateRequested && !isRetail)}
        onClose={() => setProjectCreateModalOpen(false)}
      />
    </div>
  )
}
