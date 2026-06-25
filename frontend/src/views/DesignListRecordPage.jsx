import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, Clock3, FileText, Link, Pencil } from 'lucide-react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Navbar } from '../components/Navbar'
import { ProjectTaskTimer } from '../components/ProjectTaskTimer'
import { useDesignListStore } from '../state/DesignListContext'
import { isAlexSessionActive } from '@/lib/alex-session'
import { apiClient } from '@/lib/api-client'

const ACTIVITY_TIMELINE = [
  {
    id: 'a1',
    title: '02-02-2026 — Request Received',
    subtitle: 'Request logged by Product Team — Feb 02, 2026 at 09:15 AM.',
    note: 'Initial expected turnaround: 2-3 days. Priority: Medium.',
  },
  {
    id: 'a2',
    title: '03-02-2026 — Details Completed & Sent to HOD',
    subtitle: 'Form completed by UX Analyst — Feb 03, 2026 at 10:40 AM. Attached wireframes and acceptance criteria.',
    note: 'Elapsed before HOD review: 2 hours 20 minutes (sent at 10:40 AM, HOD notified at 13:00 PM).',
  },
  {
    id: 'a3',
    title: '03-02-2026 — HOD Review & Assignment',
    subtitle: 'HOD reviewed at Feb 03, 2026 13:00 PM and assigned to Designer — Assigned duration before pickup: 8 hours.',
    note: 'Assigned to: Lead Designer — Assignment time logged: 03-02-2026 13:00 PM. Expected design work: 4 hours.',
  },
  {
    id: 'a4',
    title: '04-02-2026 — Designer Viewed & Started Work',
    subtitle: 'Designer opened task at Feb 04, 2026 09:30 AM. Time on hold from assignment: 20.5 hours.',
    note: 'Designer actual work logged: 3.5 hours (design + revisions). Review time by QA after submission: 2 hours 45 minutes.',
  },
]

const FIELD_HISTORY = [
  { id: 'f1', date: '2026-02-14', text: 'Opportunity Owner changed by Rigvender Singh' },
  { id: 'f2', date: '2026-01-28', text: 'Total Opportunity Value updated by Lara Thompson' },
  { id: 'f3', date: '2025-12-05', text: 'Stage changed to Estimation/BOQ by Ahmed Khalil' },
]

function RowField({ label, value }) {
  return (
    <div className="grid grid-cols-[130px_1fr_18px] items-center gap-2 py-0.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-[13px] text-slate-900">{value || '-'}</p>
      <Pencil className="h-3 w-3 text-slate-400" />
    </div>
  )
}

const RECORD_TAB_IDS = ['details', 'activity', 'chatter']

export function DesignListRecordPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fileInputRef = useRef(null)
  const params = useParams()
  const recordKey = params?.taskId ?? params?.id
  const { records } = useDesignListStore()
  const record = records.find((item) => item.id === recordKey)
  const [providedFile, setProvidedFile] = useState('Design.ZIP')
  const [submittedSession, setSubmittedSession] = useState(null)
  const isTerminalStatus = record?.status === 'CLIENT_ACCEPTED' || record?.status === 'CLIENT_REJECTED'
  const rawTab = searchParams.get('tab')
  const activeTab = RECORD_TAB_IDS.includes(rawTab) ? rawTab : 'details'
  const from = searchParams.get('from')
  const isAlexFlow = from === 'alex-design-list'

  useEffect(() => {
    if (!isAlexFlow) return
    if (isAlexSessionActive()) return
    router.replace('/alex-login')
  }, [isAlexFlow, router])

  useEffect(() => {
    if (!record) {
      router.replace('/design-list')
    }
  }, [record, router])

  useEffect(() => {
    if (!recordKey || !isTerminalStatus) { setSubmittedSession(null); return }
    let alive = true
    apiClient.get(`/tasks/${recordKey}/submitted-session`)
      .then((data) => { if (alive) setSubmittedSession(data) })
      .catch(() => { if (alive) setSubmittedSession(null) })
    return () => { alive = false }
  }, [recordKey, isTerminalStatus])

  const selectRecordTab = useCallback(
    (tab) => {
      const next = new URLSearchParams(searchParams.toString())
      if (tab === 'details') {
        next.delete('tab')
      } else {
        next.set('tab', tab)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const showTimerForSource =
    from === 'project-design' ||
    from === 'projects-list' ||
    from === 'designer-queue' ||
    from === 'alex-design-list'
  const backPath =
    from === 'design-scheduler'
      ? '/design-scheduler'
      : from === 'project-design'
        ? '/project-design'
        : from === 'projects-list'
          ? '/projects-list'
          : from === 'designer-queue'
            ? '/design-list/tasks'
            : from === 'alex-design-list'
              ? '/design-list/tasks'
            : '/design-list'

  const launchAutostart = searchParams.get('autostart') === '1'
  const launchPauseModal = searchParams.get('openPause') === '1'
  const launchCompleteModal = searchParams.get('openComplete') === '1'

  const clearTimerLaunchParams = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('autostart')
    next.delete('openPause')
    next.delete('openComplete')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    if (activeTab === 'details') return
    if (!launchAutostart && !launchPauseModal && !launchCompleteModal) return
    clearTimerLaunchParams()
  }, [activeTab, launchAutostart, launchPauseModal, launchCompleteModal, clearTimerLaunchParams])

  if (!record) return null
  if (isAlexFlow && !isAlexSessionActive()) return null

  const pageTitle = `${record.name.toUpperCase()} @ ${record.businessUnit.toUpperCase()}`

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <Navbar />
      <main className="px-3 py-3">
        <div className="mx-auto max-w-[1500px] space-y-3">
          <div>
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <h1 className="text-[34px] font-semibold text-slate-900">{pageTitle}</h1>

          <div className="grid gap-3 lg:grid-cols-[1fr_250px]">
            <section className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-4 text-sm">
                  {['details', 'activity', 'chatter'].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => selectRecordTab(tab)}
                      className={`border-b-2 pb-1 capitalize ${
                        activeTab === tab
                          ? 'border-slate-900 font-semibold text-slate-900'
                          : 'border-transparent text-slate-500'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">OP NO: {record.opNo.replace('OP- ', 'OP-')}</p>
              </div>

              {activeTab === 'details' ? (
                <>
                  <div className="mt-2 grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <RowField label="Project Name" value={record.name.toUpperCase()} />
                      <RowField label="Project No" value={record.projectNo} />
                      <RowField label="Business Unit" value={record.businessUnit} />
                      <RowField label="Project Manager" value={record.assignee?.name ?? 'Unassigned'} />
                      <RowField label="Priority Level" value={record.agingDays > 20 ? 'High' : 'Medium'} />
                      <RowField label="Date of Issued" value={record.created} />
                    </div>
                    <div className="space-y-1">
                      <RowField label="OP NO" value={record.opNo.replace('OP- ', 'OP-')} />
                      <RowField label="Project Location" value={`${record.businessUnit} — Retail Level 1, Kiosk DM1`} />
                      <RowField label="Sales Person" value={record.salesPerson} />
                      <RowField label="Technical Head" value="Vikram" />
                      <RowField label="Hours Required" value={String(Math.max(1, Number(record.hoursRequired) || 0))} />
                      <RowField label="Date of Submission" value={record.deadline} />
                    </div>
                  </div>

                  <div className="mt-2">
                    <label className="text-[11px] text-slate-500">Provided Assets</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        value={providedFile ?? ''}
                        readOnly
                        className="h-8 flex-1 rounded border border-slate-300 px-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 rounded border border-slate-300 px-2 text-xs"
                      >
                        Upload
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(event) => setProvidedFile(event.target.files?.[0]?.name ?? '')}
                      />
                    </div>
                  </div>

                  {showTimerForSource ? (
                    <ProjectTaskTimer
                      taskId={String(recordKey)}
                      taskStatus={record.status}
                      launchAutostart={launchAutostart}
                      launchPauseModal={launchPauseModal}
                      launchCompleteModal={launchCompleteModal}
                      onConsumedLaunchFlags={clearTimerLaunchParams}
                      onSubmitComplete={() => router.refresh()}
                    />
                  ) : null}
                  {isTerminalStatus && submittedSession ? (
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
                                  <a href={submittedSession.submissionLink} target="_blank" rel="noreferrer" className="truncate text-blue-600 hover:underline" title={submittedSession.submissionLink}>
                                    {submittedSession.submissionLink}
                                  </a>
                                </li>
                              )}
                              {submittedSession.files?.map((f, i) => (
                                <li key={i} className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800">
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  <span className="truncate" title={f.fileName}>{f.fileName}</span>
                                  {f.sizeBytes && (
                                    <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                                      {f.sizeBytes > 1024 * 1024 ? `${(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(f.sizeBytes / 1024)} KB`}
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

                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <div className="grid grid-cols-5 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      <div>Sign Family</div>
                      <div>Sign Type</div>
                      <div>Plan Code</div>
                      <div>Contract Reference</div>
                      <div>Quantity</div>
                    </div>
                    <div className="grid grid-cols-5 px-3 py-3 text-sm text-slate-800">
                      <div>-</div>
                      <div>B315</div>
                      <div>CP-2-2344</div>
                      <div>QE$294859876</div>
                      <div>11</div>
                    </div>
                  </div>
                </>
              ) : null}

              {activeTab === 'activity' ? (
                <div className="mt-3 space-y-5">
                  {ACTIVITY_TIMELINE.map((item) => (
                    <div key={item.id} className="grid grid-cols-[22px_1fr] gap-2">
                      <div className="relative flex justify-center">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#6b4f35]" />
                        <span className="absolute top-4 h-[calc(100%-4px)] w-px bg-slate-300" />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-0.5 text-[12px] text-slate-600">{item.subtitle}</p>
                        <div className="mt-2 rounded bg-slate-100 px-2 py-2 text-[12px] text-slate-700">
                          {item.note}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {activeTab === 'chatter' ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700"
                    >
                      Posts
                    </button>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>Sort by</span>
                      <select className="rounded border border-slate-300 px-2 py-1 text-xs">
                        <option>Latest Posts</option>
                      </select>
                    </div>
                  </div>

                  <article className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-[#1f4b7a]">RAMADA SIGNAGE FOR WORD OF ART@ JADDAF-</p>
                    <p className="text-xs text-slate-500">6m</p>
                    <p className="mt-2 text-sm text-[#1f4b7a]">@Delbin Delbin</p>
                    <p className="mt-1 text-sm text-slate-800">Please find the attached BRI design and prepare the quote</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      <button type="button">Like</button>
                      <button type="button">Comment</button>
                    </div>
                  </article>
                </div>
              ) : null}
            </section>

            <aside className="space-y-3">
              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  {activeTab === 'chatter' ? 'Field History' : 'Project History'}
                </h3>
                {activeTab === 'chatter' ? (
                  <ul className="mt-2 space-y-3 text-xs text-slate-700">
                    {FIELD_HISTORY.map((item) => (
                      <li key={item.id}>
                        <p className="text-slate-500">{item.date}</p>
                        <p>{item.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-2 space-y-2 text-xs text-slate-700">
                    <li>
                      <p className="text-slate-500">2026-02-04</p>
                      <p>Designer viewed the task</p>
                    </li>
                    <li>
                      <p className="text-slate-500">2026-02-03</p>
                      <p>HOD reviewed and assigned to Designer</p>
                    </li>
                    <li>
                      <p className="text-slate-500">2026-02-02</p>
                      <p>Filled the details and assigned to HOD</p>
                    </li>
                    <li>
                      <p className="text-slate-500">2026-02-01</p>
                      <p>Got request from the client</p>
                    </li>
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-sm font-semibold text-slate-900">Files</h3>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full rounded bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                >
                  Upload Files
                </button>
                <div className="mt-2 rounded border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">
                  Drag & drop files here or click to browse
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}

