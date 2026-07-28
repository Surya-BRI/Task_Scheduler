'use client'

import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { apiClient } from '@/lib/api-client'
import { useRoleGuard } from '@/lib/use-role-guard'
import { useDesignListStore } from '@/state/DesignListContext'

// ─── Sign row helpers (self-contained, no coupling to TaskDetailsPage) ───────

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

const SIGN_ROW_TRACKED_FIELDS = [
  'tNo', 'no', 'signType', 'planCode', 'estQty', 'qsQty',
  'areaZone', 'levelParcel', 'sequence', 'status', 'comment', 'contRef', 'signFamily',
]

// Stable serialization of user-editable fields, used to detect unsaved changes.
function serializeSignRows(rows) {
  return JSON.stringify(
    (Array.isArray(rows) ? rows : []).map((row) =>
      SIGN_ROW_TRACKED_FIELDS.map((field) => String(row?.[field] ?? '')),
    ),
  )
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[125px_1fr] gap-2 py-0.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-[13px] font-medium text-slate-900">{value ?? '-'}</p>
    </div>
  )
}

function friendlyError(error, fallback) {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('should not be empty') || msg.includes('must be an integer') || msg.includes('must be a number')) {
    return 'Please fill all required fields in each row before saving.'
  }
  return msg || fallback
}

// ─── Main page ────────────────────────────────────────────────────────────────

function QsProjectDetailContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setRecords } = useDesignListStore()

  const projectCode = decodeURIComponent(String(params.id ?? ''))
  const queryOp = searchParams.get('op') ?? ''

  // ── project meta ──
  const [projectId, setProjectId] = useState(null)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  // ── sign rows ──
  const [signRows, setSignRows] = useState([])
  // Snapshot of the rows as last loaded/saved; used to detect a dirty state.
  const [savedRowsSnapshot, setSavedRowsSnapshot] = useState(() => serializeSignRows([]))
  // Snapshot of the rows as loaded/last submitted. Save clears unsaved dirty state
  // but leaves this snapshot so Submit stays available for saved-but-unsubmitted work.
  const [submittedRowsSnapshot, setSubmittedRowsSnapshot] = useState(() => serializeSignRows([]))
  const [qsStatus, setQsStatus] = useState(null)
  const [signRowsLoading, setSignRowsLoading] = useState(false)
  const [signRowsSaving, setSignRowsSaving] = useState(false)
  const [qsSubmitting, setQsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { idx, family }
  // Sync locks so rapid clicks cannot fire duplicate requests before React re-renders.
  const signRowsSavingRef = useRef(false)
  const qsSubmittingRef = useRef(false)

  // ── resolve project UUID + meta ──
  useEffect(() => {
    if (!projectCode) return
    let alive = true
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    async function load() {
      setLoading(true)
      try {
        let proj
        if (UUID_RE.test(projectCode)) {
          proj = await apiClient.get(`/projects/${encodeURIComponent(projectCode)}`)
        } else {
          proj = await apiClient.get(`/projects/by-project-no/${encodeURIComponent(projectCode)}`)
        }
        if (!alive) return
        setProject(proj)
        setProjectId(proj?.id ?? null)
      } catch {
        if (!alive) return
        setProject({
          projectNo: projectCode,
          name: projectCode,
          salesForceCode: null,
          salesPerson: null,
          category: 'Project',
        })
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [projectCode])

  // ── fetch sign rows + QS status once projectId is known ──
  useEffect(() => {
    if (!projectId) return
    let alive = true
    setSignRowsLoading(true)

    const opNo = String(project?.salesForceCode ?? project?.opNo ?? queryOp ?? '').trim() || null

    Promise.all([
      apiClient.get(`/projects/${projectId}/sign-rows`).catch(() => []),
      apiClient.get(`/projects/${projectId}/qs-status`).catch(() => null),
    ]).then(async ([rows, status]) => {
      if (!alive) return
      let initialRows = Array.isArray(rows) ? rows : []

      // QS-only: pre-populate from ERP when DB is empty
      if (initialRows.length === 0 && opNo) {
        try {
          const groups = await apiClient.get(
            `/design-list/project-sign-types?salesForceCode=${encodeURIComponent(opNo)}`,
          )
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
                  tNo: '', planCode: '', qsQty: '',
                  levelParcel: '', sequence: '', contRef: '',
                })
              }
            }
          }
        } catch { /* leave empty */ }
      }

      if (alive) {
        setSignRows(initialRows)
        setSavedRowsSnapshot(serializeSignRows(initialRows))
        setSubmittedRowsSnapshot(serializeSignRows(initialRows))
        setQsStatus(status)
        setSignRowsLoading(false)
      }
    })

    return () => { alive = false }
  }, [projectId])

  // ── computed ──
  const normalizedQsStatus = String(qsStatus?.status ?? '').trim().toLowerCase()
  const isQsCompleted = normalizedQsStatus === 'completed'
  const isQsReadOnly = isQsCompleted
  // Approved rows cannot be deleted or have their status changed (also enforced server-side).
  const isApprovedRow = (row) => String(row?.status ?? '').trim().toLowerCase() === 'approved'
  const isLockedStatusField = (row, field) => field === 'status' && isApprovedRow(row)

  // Dirty when current rows differ from the last loaded/saved snapshot.
  const hasUnsavedChanges = useMemo(
    () => serializeSignRows(signRows) !== savedRowsSnapshot,
    [signRows, savedRowsSnapshot],
  )

  // True when current rows differ from load / last submission. After a successful
  // Save (and with no further edits), Submit is enabled; any new edit disables it
  // again until the latest changes are saved.
  const hasChangesSinceSubmit = useMemo(
    () => serializeSignRows(signRows) !== submittedRowsSnapshot,
    [signRows, submittedRowsSnapshot],
  )
  const canSubmitQsUpdate =
    !isQsReadOnly && !signRowsSaving && !qsSubmitting && hasChangesSinceSubmit && !hasUnsavedChanges

  const resolvedOpNo = String(project?.salesForceCode ?? project?.opNo ?? queryOp ?? '').trim()
  const resolvedName = project?.name ?? project?.projectName ?? projectCode
  const resolvedProjectName = resolvedName.toUpperCase()
  const resolvedBu = (project?.businessUnit ?? project?.category ?? 'Project').toUpperCase()
  const pageTitle = resolvedOpNo
    ? `${resolvedOpNo} - ${resolvedProjectName} @ ${resolvedBu}`
    : `${resolvedProjectName} @ ${resolvedBu}`

  // ── handlers ──
  async function handleSaveSignRows() {
    if (signRowsSavingRef.current || qsSubmittingRef.current) return
    if (!projectId || isQsReadOnly) {
      toast.error('Completed QS projects are read-only.', { id: 'qs-sign-rows-save' })
      return
    }
    signRowsSavingRef.current = true
    setSignRowsSaving(true)
    try {
      const rows = normalizeSignRowsForSave(signRows)
      const saved = await apiClient.put(`/projects/${projectId}/sign-rows`, { rows })
      const verified = await apiClient.get(`/projects/${projectId}/sign-rows`)
      const status = await apiClient.get(`/projects/${projectId}/qs-status`).catch(() => null)
      const nextRows = Array.isArray(verified) ? verified : (Array.isArray(saved) ? saved : [])
      setSignRows(nextRows)
      setSavedRowsSnapshot(serializeSignRows(nextRows))
      if (status) setQsStatus(status)
      if (nextRows.length !== rows.length) {
        throw new Error('Rows saved but could not be verified. Please refresh.')
      }
      toast.success('QS rows saved successfully.', { id: 'qs-sign-rows-save' })
    } catch (error) {
      toast.error(friendlyError(error, 'Failed to save sign rows'), { id: 'qs-sign-rows-save' })
    } finally {
      signRowsSavingRef.current = false
      setSignRowsSaving(false)
    }
  }

  async function handleSubmitQsUpdate() {
    if (qsSubmittingRef.current || signRowsSavingRef.current) return
    if (!projectId || isQsReadOnly) {
      toast.error('This QS update has already been submitted.', { id: 'qs-submit' })
      return
    }
    if (hasUnsavedChanges) {
      toast.error('Please save your changes before submitting.', { id: 'qs-submit' })
      return
    }
    if (!hasChangesSinceSubmit) {
      toast.error('Make at least one change before submitting a QS update.', { id: 'qs-submit' })
      return
    }
    qsSubmittingRef.current = true
    setQsSubmitting(true)
    try {
      const rows = normalizeSignRowsForSubmit(signRows)
      const response = await apiClient.post(`/projects/${projectId}/qs-submit`, { rows })
      const nextRows = Array.isArray(response?.rows)
        ? response.rows
        : await apiClient.get(`/projects/${projectId}/sign-rows`)
      const submittedRows = Array.isArray(nextRows) ? nextRows : []
      const nextStatus =
        response?.qsStatus ??
        (await apiClient.get(`/projects/${projectId}/qs-status`).catch(() => null)) ??
        { status: response?.status ?? 'Completed' }
      setSignRows(submittedRows)
      setSavedRowsSnapshot(serializeSignRows(submittedRows))
      setSubmittedRowsSnapshot(serializeSignRows(submittedRows))
      setQsStatus(nextStatus)
      const completedStatus = String(nextStatus?.status ?? 'Completed')
      setRecords((prev) =>
        prev.map((row) => {
          const matchesProject =
            row.id === projectId ||
            row.projectCode === project?.projectNo ||
            row.projectNo === project?.projectNo ||
            row.projectCode === projectCode ||
            row.projectNo === projectCode
          return matchesProject ? { ...row, status: completedStatus } : row
        }),
      )
      // Only confirm success after the backend accepted the submission.
      toast.success('QS Update submitted successfully.', { id: 'qs-submit', duration: 5000 })
    } catch (error) {
      toast.error(friendlyError(error, 'Failed to submit QS update'), { id: 'qs-submit' })
    } finally {
      qsSubmittingRef.current = false
      setQsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="w-full overflow-y-auto px-4 py-4 sm:px-6">
        <div className="w-full space-y-3">

          {/* Back button */}
          <button
            type="button"
            onClick={() => router.push('/qs/projects')}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {/* Page title */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {loading ? (
                <span className="inline-block h-7 w-80 animate-pulse rounded bg-slate-200" />
              ) : pageTitle}
            </h1>
            {resolvedOpNo && (
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                OP NO: {resolvedOpNo}
              </span>
            )}
          </div>

          {/* Details card */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-slate-200" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-0.5">
                  <DetailRow label="Project Code" value={project?.projectNo ?? projectCode} />
                  <DetailRow label="Project Name" value={resolvedName || '-'} />
                  <DetailRow label="OP Code" value={resolvedOpNo || '-'} />
                </div>
                <div className="space-y-0.5">
                  <DetailRow label="Sales Person" value={project?.salesPerson ?? '-'} />
                  <DetailRow label="Business Unit" value={project?.businessUnit ?? project?.category ?? '-'} />
                </div>
              </div>
            )}
          </div>

          {/* Sign rows section */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
              <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2" role="group" aria-label="Sign row actions: save first, then submit">
                <button
                  type="button"
                  onClick={handleSaveSignRows}
                  disabled={isQsReadOnly || signRowsSaving || qsSubmitting || !hasUnsavedChanges}
                  aria-busy={signRowsSaving}
                  aria-disabled={isQsReadOnly || signRowsSaving || qsSubmitting || !hasUnsavedChanges}
                  title={
                    isQsReadOnly
                      ? 'QS update already submitted'
                      : !hasUnsavedChanges
                        ? 'No unsaved changes'
                        : 'Save your changes (required before submit)'
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#10a6e3] px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#0f96cd] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10a6e3]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:hover:bg-slate-300"
                >
                  {signRowsSaving ? (
                    <>
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    'Save Rows'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitQsUpdate}
                  disabled={!canSubmitQsUpdate}
                  aria-busy={qsSubmitting}
                  aria-disabled={!canSubmitQsUpdate}
                  title={
                    isQsReadOnly
                      ? 'QS update already submitted'
                      : hasUnsavedChanges
                        ? 'Please save your changes before submitting'
                        : !hasChangesSinceSubmit
                          ? 'Make a change before submitting'
                          : 'Submit saved QS update'
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-slate-50"
                >
                  {qsSubmitting ? (
                    <>
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" aria-hidden />
                      Submitting…
                    </>
                  ) : isQsReadOnly ? (
                    'Submitted'
                  ) : (
                    'Submit QS Update'
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    {['Actions', 'Sign Type', 'No', 'T.No', 'Est QTY', 'Qs QTY', 'Seq', 'Status', 'Cont.Ref',
                      'Plan Code', 'Area/Zone', 'Level/Parcel', 'Comment'].map((h) => (
                      <th
                        key={h}
                        className={`px-1.5 py-0.5 text-left text-[9px] font-semibold whitespace-nowrap border-r border-slate-200 last:border-r-0${h === 'Sign Type' ? ' w-[220px] min-w-[220px]' : ''}${h === 'Actions' ? ' w-[72px] min-w-[72px]' : ''}`}
                      >
                        {h === 'Actions' ? <span className="sr-only">Actions</span> : h}
                        {h && h !== 'Comment' && h !== 'Actions' && <span className="ml-0.5 text-red-600" title="Required">*</span>}
                      </th>
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
                    <tr>
                      <td colSpan={13} className="px-4 py-10 text-center">
                        <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            No Sign Rows added yet
                          </p>
                          <p className="text-xs leading-relaxed text-slate-500">
                            Click{' '}
                            <span className="font-semibold text-slate-700">+ Add Row</span>
                            {' '}to create the first entry, then fill in the required QS/sign
                            details (sign type, quantities, plan code, area/zone, status, and related fields).
                          </p>
                          {!isQsReadOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                setSignRows([
                                  {
                                    tNo: '',
                                    no: '',
                                    signType: '',
                                    planCode: '',
                                    estQty: '',
                                    qsQty: '',
                                    areaZone: '',
                                    levelParcel: '',
                                    sequence: '',
                                    status: '',
                                    comment: '',
                                    contRef: '',
                                    signFamily: '',
                                  },
                                ])
                              }
                              className="mt-1 inline-flex items-center rounded-md bg-[#10a6e3] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0f96cd]"
                            >
                              + Add Row
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (() => {
                    const groups = signRows.reduce((acc, row, idx) => {
                      const family = String(row.signFamily ?? '').trim() || 'Other'
                      let g = acc.find((x) => x.family === family)
                      if (!g) { g = { family, rows: [] }; acc.push(g) }
                      g.rows.push({ ...row, _idx: idx })
                      return acc
                    }, [])
                    return groups.map(({ family, rows }) => (
                      <React.Fragment key={`fam-${family}`}>
                        <tr>
                          <td className="bg-white border-r border-slate-300" aria-hidden />
                          <td className="pl-0 pr-2 py-1 bg-white">
                            <span className="inline-flex items-center border-l-4 border-l-blue-500 bg-slate-50 pl-2 pr-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                              {family}
                            </span>
                          </td>
                          <td colSpan={11} className="bg-white" />
                        </tr>
                        {rows.map((row) => (
                          <tr key={row.id ?? row._idx} className="hover:bg-slate-50">
                            <td className="px-1 py-0.5 border-r border-slate-300 align-middle">
                              {!isQsReadOnly && !isApprovedRow(row) && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm({ idx: row._idx, family })}
                                  aria-label={`Delete row from ${family}`}
                                  className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                                >
                                  <Trash2 className="h-3 w-3 shrink-0" aria-hidden />
                                  Delete
                                </button>
                              )}
                            </td>
                            {['signType', 'no', 'tNo', 'estQty', 'qsQty', 'sequence', 'status', 'contRef',
                               'planCode', 'areaZone', 'levelParcel', 'comment'].map((field) => (
                              <td key={field} className={`p-0 border-r border-slate-300 last:border-r-0${field === 'signType' ? ' relative group w-[220px] min-w-[220px]' : ''}`}>
                                {isLockedStatusField(row, field) ? (
                                  <input
                                    value={row[field] ?? ''}
                                    readOnly
                                    tabIndex={-1}
                                    title="Approved status is locked and cannot be changed."
                                    className="h-6 w-full cursor-not-allowed border border-slate-400 bg-slate-50 px-1.5 text-[11px] text-slate-500 focus:outline-none"
                                  />
                                ) : (
                                <input
                                  value={row[field] ?? ''}
                                  onChange={(e) =>
                                    setSignRows((prev) =>
                                      prev.map((r, i) => (i === row._idx ? { ...r, [field]: e.target.value } : r)),
                                    )
                                  }
                                  disabled={isQsReadOnly}
                                  className="h-6 w-full border border-slate-400 px-1.5 text-[11px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-slate-50 disabled:text-slate-500"
                                />
                                )}
                                {field === 'signType' && row[field] && (
                                  <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden max-w-[260px] rounded border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-800 shadow-lg group-hover:block">
                                    {row[field]}
                                  </div>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!isQsReadOnly && (
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
                        )}
                      </React.Fragment>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>

      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Row?"
        size="sm"
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              autoFocus
              onClick={() => setDeleteConfirm(null)}
              className="px-3 py-1.5 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setSignRows((prev) => prev.filter((_, i) => i !== deleteConfirm.idx))
                setDeleteConfirm(null)
              }}
              className="px-3 py-1.5 text-xs"
            >
              Delete
            </Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete this row from{' '}
          <span className="font-semibold text-blue-600">{deleteConfirm?.family}</span>?
          This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

export default function QsProjectDetailPage() {
  const authorized = useRoleGuard(['QS'])
  if (!authorized) return null
  return (
    <Suspense fallback={null}>
      <QsProjectDetailContent />
    </Suspense>
  )
}
