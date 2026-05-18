"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import StatsBar from "../components/StatsBar";
import { Clock3, FileClock, TimerReset, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

export default function RequestsClient({ designer }) {
  const router = useRouter();
  const REGULARIZATION_REASON_OPTIONS = [
    "Late Login",
    "Early Logout",
    "Break Extension",
    "System Issue",
    "Network Issue",
    "Client Call",
    "Meeting",
    "Personal Emergency",
    "Power Cut",
    "Other",
  ];

  const [stats, setStats] = useState(designer.stats);
  const [isHOD, setIsHOD] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [sessionErpId, setSessionErpId] = useState(null);

  useEffect(() => {
    import("@/lib/mock-auth").then(({ getSession }) => {
      const session = getSession();
      if (session?.role === "HOD") setIsHOD(true);
      if (session?.erpDesignerId && isUuidString(session.erpDesignerId)) {
        setSessionErpId(String(session.erpDesignerId).trim());
      } else if (session?.id && isUuidString(session.id)) {
        setSessionErpId(String(session.id).trim());
      }
    });
  }, []);

  const erpDesignerIdRaw =
    sessionErpId ??
    (designer?.erpDesignerId != null ? String(designer.erpDesignerId).trim() : "");
  const erpDesignerId = isUuidString(erpDesignerIdRaw) ? erpDesignerIdRaw : null;

  const [idleRequests, setIdleRequests] = useState([]);
  const [regularizationError, setRegularizationError] = useState(null);
  const [regularizationLoading, setRegularizationLoading] = useState(false);

  const [previousOtRequests, setPreviousOtRequests] = useState([]);
  const [overtimeError, setOvertimeError] = useState(null);
  const [overtimeLoading, setOvertimeLoading] = useState(false);

  const loadRegularization = async () => {
    if (erpDesignerId == null) {
      setIdleRequests([]);
      setRegularizationError(
        "Set erpDesignerId to the designer’s SQL uniqueidentifier (UUID string) in designer JSON or the requests page fallback — it must match ErpTSRegularizationRequest.designerId.",
      );
      return;
    }
    setRegularizationLoading(true);
    setRegularizationError(null);
    try {
      const rows = await apiClient.get(`/regularization-requests?designerId=${erpDesignerId}`);
      const list = Array.isArray(rows) ? rows : [];
      setIdleRequests(list);
      const pending = list.filter((r) => r.status === "Pending").length;
      setStats((prev) => ({ ...prev, pendingRegularization: pending }));
    } catch (e) {
      setIdleRequests([]);
      setRegularizationError(e?.message || "Could not load regularization requests.");
    } finally {
      setRegularizationLoading(false);
    }
  };

  const loadOvertime = async () => {
    if (erpDesignerId == null) {
      setPreviousOtRequests([]);
      return;
    }
    setOvertimeLoading(true);
    setOvertimeError(null);
    try {
      const rows = await apiClient.get(`/overtime-requests?designerId=${encodeURIComponent(erpDesignerId)}`);
      setPreviousOtRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setPreviousOtRequests([]);
      setOvertimeError(e?.message || "Could not load overtime requests.");
    } finally {
      setOvertimeLoading(false);
    }
  };

  useEffect(() => {
    void loadRegularization();
    void loadOvertime();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when ERP designer id changes
  }, [erpDesignerId]);

  const addIdleDraftRow = () => {
    setIdleRequests((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        localDraft: true,
        taskId: "",
        taskName: "",
        date: "",
        duration: "30 mins",
        reason: "",
        notes: "",
        status: "unsubmitted",
      },
    ]);
  };

  const handleIdleChange = (id, field, value) => {
    setIdleRequests((prev) => prev.map((req) => (req.id === id ? { ...req, [field]: value } : req)));
  };

  const handleSubmitIdleRow = async (id) => {
    const req = idleRequests.find((r) => r.id === id);
    if (!req || erpDesignerId == null) return;
    if (!req.date || !req.reason || (req.reason === "Other" && !String(req.notes ?? "").trim())) {
      alert("Please fill in the Date and Reason (Required).");
      return;
    }
    const taskId = String(req.taskId ?? "").trim();
    if (!isUuidString(taskId)) {
      alert("Please enter a valid Task UUID (same type as ErpTSRegularizationRequest.taskId).");
      return;
    }
    try {
      await apiClient.post("/regularization-requests", {
        designerId: erpDesignerId,
        taskId,
        date: req.date,
        duration: req.duration,
        reason: req.reason,
        notes: req.notes?.trim() || undefined,
        status: "Pending",
      });
      await loadRegularization();
      showToast("Regularization request submitted!");
    } catch (e) {
      alert(e?.message || "Submit failed");
    }
  };

  const handleApproveIdle = async (id) => {
    try {
      const approverId = process.env.NEXT_PUBLIC_REGULARIZATION_APPROVER_ID?.trim();
      const body = {
        status: "Approved",
        ...(approverId && isUuidString(approverId) ? { approverId } : {}),
      };
      await apiClient.patch(`/regularization-requests/${encodeURIComponent(id)}`, body);
      await loadRegularization();
      showToast("Regularization request approved!");
    } catch (e) {
      alert(e?.message || "Approve failed");
    }
  };

  const handleRejectIdle = async (id) => {
    try {
      await apiClient.patch(`/regularization-requests/${encodeURIComponent(id)}`, { status: "Rejected" });
      await loadRegularization();
      showToast("Regularization request rejected!");
    } catch (e) {
      alert(e?.message || "Reject failed");
    }
  };

  const handleRequestAllRegularization = async () => {
    const drafts = idleRequests.filter((r) => r.status === "unsubmitted" && r.localDraft);
    if (drafts.length === 0) {
      showToast("No draft regularization rows to submit. Use Add row first.");
      return;
    }
    if (drafts.some((r) => !r.date || !r.reason || (r.reason === "Other" && !String(r.notes ?? "").trim()))) {
      alert("Please fill in Date and Reason for all draft rows.");
      return;
    }
    if (drafts.some((r) => !isUuidString(String(r.taskId ?? "").trim()))) {
      alert("Please enter a valid Task UUID for every draft row.");
      return;
    }
    if (erpDesignerId == null) return;
    try {
      for (const r of drafts) {
        const taskId = String(r.taskId).trim();
        await apiClient.post("/regularization-requests", {
          designerId: erpDesignerId,
          taskId,
          date: r.date,
          duration: r.duration,
          reason: r.reason,
          notes: r.notes?.trim() || undefined,
          status: "Pending",
        });
      }
      await loadRegularization();
      showToast("All regularization requests submitted!");
    } catch (e) {
      alert(e?.message || "Bulk submit failed");
    }
  };

  // --- Overtime Request State ---
  const [otForm, setOtForm] = useState({
    taskId: "",
    date: "",
    estimatedRemaining: "4 hours",
    requestedHours: "2 hours",
    reason: "Unexpected scope change for animations",
  });

  const handleOtSubmit = async (e) => {
    e.preventDefault();
    if (erpDesignerId == null) {
      alert("Designer UUID is not configured.");
      return;
    }
    if (!isUuidString(String(otForm.taskId ?? "").trim())) {
      alert("Please enter a valid Task UUID (ErpTSOvertimeRequest.taskId).");
      return;
    }
    const m = /^(\d+)/.exec(otForm.requestedHours);
    if (m && Number(m[1]) > 4) {
      alert("Cannot exceed 4 hours allowed limit.");
      return;
    }
    if (!otForm.date) {
      alert("Please select a date.");
      return;
    }
    try {
      await apiClient.post("/overtime-requests", {
        designerId: erpDesignerId,
        taskId: String(otForm.taskId).trim(),
        date: otForm.date,
        estimatedRemaining: otForm.estimatedRemaining,
        requestedHours: otForm.requestedHours,
        reason: otForm.reason,
        status: "Pending",
      });
      await loadOvertime();
      showToast("Overtime request submitted successfully!");
      setOtForm((f) => ({ ...f, taskId: "", date: "" }));
    } catch (err) {
      alert(err?.message || "Submit failed");
    }
  };

  const handleApproveOt = async (id) => {
    const row = previousOtRequests.find((r) => r.id === id);
    try {
      await apiClient.patch(`/overtime-requests/${encodeURIComponent(id)}`, {
        status: "Approved",
        approvedHours: row?.requested ?? "0 hours",
      });
      await loadOvertime();
      showToast("Overtime request approved!");
    } catch (e) {
      alert(e?.message || "Approve failed");
    }
  };

  const handleRejectOt = async (id) => {
    try {
      await apiClient.patch(`/overtime-requests/${encodeURIComponent(id)}`, { status: "Rejected" });
      await loadOvertime();
      showToast("Overtime request rejected!");
    } catch (e) {
      alert(e?.message || "Reject failed");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Approved": return <span className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 text-center inline-block">Approved</span>;
      case "Pending Approval":
      case "Pending": return <span className="bg-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 text-center inline-block">Pending</span>;
      case "Rejected": return <span className="bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 text-center inline-block">Rejected</span>;
      default: return null;
    }
  };

  const getStatusColorTable = (status) => {
    switch (status) {
      case "Approved": return "bg-emerald-100 text-emerald-800";
      case "Pending Approval":
      case "Pending": return "bg-orange-100 text-orange-800";
      case "Rejected": return "bg-red-100 text-red-800";
      default: return "bg-slate-100 text-slate-800";
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 cursor-pointer";

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans bg-slate-50">
      <Navbar dateRangeText={designer.dateRange} />
      
      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-auto items-center gap-3 border-r border-slate-200 pr-6">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            {designer.avatar ? (
              <img src={designer.avatar} alt={designer.name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{designer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
            )}
          </div>
          {isHOD ? (
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-slate-500 mb-1">Creating Request For:</span>
              <select 
                className="text-sm font-semibold bg-slate-100 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-[#5d5baf]/20 cursor-pointer"
                value={designer.id}
                onChange={(e) => router.push(`/designer/${e.target.value}/requests`)}
              >
                <option value="d1">Alex Johnson</option>
                <option value="d2">Alexander Allen</option>
                <option value="d3">Benjamin Harris</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-slate-900">{designer.name}</span>
              <span className="text-[10px] leading-tight text-slate-500">{designer.designation}</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex px-6 items-center">
          <span className="font-bold text-slate-900">{designer.currentDay}</span>
        </div>
      </div>
      
      <StatsBar stats={stats} />

      <div className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="w-full space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Regularization & Overtime</h1>
              <p className="mt-1 text-sm text-slate-500">Submit and track your regularization and overtime requests.</p>
            </div>
            <button
              onClick={() => router.back()}
              className="ui-chip-button inline-flex items-center gap-2"
            >
              Back to Dashboard
            </button>
          </div>

          <section id="regularization" className="ui-surface scroll-mt-24">
            <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                <TimerReset className="h-4 w-4 text-slate-500" />
                Idle Time Regularization
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addIdleDraftRow}
                  disabled={erpDesignerId == null}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add row
                </button>
                <button
                  type="button"
                  onClick={() => void handleRequestAllRegularization()}
                  className="rounded-lg bg-[#5d5baf] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4b4991]"
                >
                  Request Regularization
                </button>
              </div>
            </div>
            {regularizationError ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">{regularizationError}</div>
            ) : null}
            {regularizationLoading ? (
              <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500 sm:px-5">Loading regularization…</div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm text-left">
                <thead className="ui-table-header">
                  <tr>
                    <th className="px-4 py-3">Completed Task</th>
                    <th className="px-4 py-3 text-center">Date</th>
                    <th className="px-4 py-3 text-center">Idle Duration</th>
                    <th className="px-4 py-3">Reason (Required)</th>
                    <th className="px-4 py-3">Optional Notes</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    {isHOD && <th className="px-4 py-3 text-center">Created By</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {idleRequests.length === 0 && !regularizationLoading ? (
                    <tr>
                      <td colSpan={isHOD ? 7 : 6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No regularization requests yet. Use Add row to create a draft, or load data from ERP when rows exist for this designer.
                      </td>
                    </tr>
                  ) : null}
                  {idleRequests.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {req.status === "unsubmitted" ? (
                          <div className="flex max-w-[220px] flex-col gap-1">
                            <label className="text-[10px] font-semibold uppercase text-slate-500">Task UUID (ERP)</label>
                            <input
                              type="text"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                              value={req.taskId === "" || req.taskId == null ? "" : req.taskId}
                              onChange={(e) => handleIdleChange(req.id, "taskId", e.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                            />
                            <span className="text-xs font-normal text-slate-500">
                              {req.taskName || (req.taskId ? `Task #${req.taskId}` : "Shown after save")}
                            </span>
                          </div>
                        ) : (
                          req.taskName || `Task #${req.taskId}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {req.status === "unsubmitted" ? (
                          <input
                            type="date"
                            value={req.date}
                            onChange={(e) => handleIdleChange(req.id, "date", e.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                          />
                        ) : (
                          <span className="inline-block rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                            {req.date ? formatDate(req.date) : "dd MMM yyyy"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {req.status === "unsubmitted" ? (
                          <input
                            type="text"
                            value={req.duration ?? ""}
                            onChange={(e) => handleIdleChange(req.id, "duration", e.target.value)}
                            className="w-full max-w-[120px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                          />
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span className="font-medium text-slate-800">{req.duration}</span>
                            <span className="rounded bg-[#5d5baf] px-2 py-1 text-[10px] font-bold text-white">T - A</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {req.status === "unsubmitted" ? (
                          <select
                            value={req.reason ?? ""}
                            onChange={(e) => handleIdleChange(req.id, "reason", e.target.value)}
                            className={inputClass}
                          >
                            <option value="" disabled>
                              Select Reason
                            </option>
                            {REGULARIZATION_REASON_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                            {req.reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {req.status === "unsubmitted" ? (
                          <input
                            type="text"
                            placeholder={req.reason === "Other" ? "Required when reason is Other" : "Optional notes"}
                            value={req.notes ?? ""}
                            onChange={(e) => handleIdleChange(req.id, "notes", e.target.value)}
                            className={`${inputClass} ${req.reason === "Other" ? "border-amber-300 bg-amber-50/60" : ""}`}
                          />
                        ) : (
                          <div className="truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">{req.notes || "No notes"}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {req.status === "unsubmitted" ? (
                          <button
                            type="button"
                            onClick={() => void handleSubmitIdleRow(req.id)}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                          >
                            Submit Request
                          </button>
                        ) : isHOD && req.status === "Pending" ? (
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleApproveIdle(req.id)}
                              className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:bg-emerald-600 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRejectIdle(req.id)}
                              className="bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:bg-red-600 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          getStatusBadge(req.status)
                        )}
                      </td>
                      {isHOD && (
                        <td className="px-4 py-3 text-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            {req.localDraft ? (isHOD ? "HOD" : "Designer") : "ERP"}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="overtime" className="ui-surface scroll-mt-24">
            <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-slate-500" />
                Overtime Request
              </h2>
            </div>
            {overtimeError ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">{overtimeError}</div>
            ) : null}
            {overtimeLoading ? (
              <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500 sm:px-5">Loading overtime…</div>
            ) : null}

            <form onSubmit={(e) => void handleOtSubmit(e)} className="space-y-5 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Task UUID (ERP)</label>
                    <input
                      type="text"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={otForm.taskId}
                      onChange={(e) => setOtForm({ ...otForm, taskId: e.target.value })}
                      className={inputClass}
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">Must match ErpTSOvertimeRequest.taskId (uniqueidentifier).</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                    <input type="date" value={otForm.date} onChange={(e) => setOtForm({ ...otForm, date: e.target.value })} className={inputClass} required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Estimated Remaining Work</label>
                    <select value={otForm.estimatedRemaining} onChange={(e) => setOtForm({ ...otForm, estimatedRemaining: e.target.value })} className={inputClass}>
                      <option>2 hours</option>
                      <option>4 hours</option>
                      <option>6 hours</option>
                      <option>8 hours</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Requested Extra Hours</label>
                    <select value={otForm.requestedHours} onChange={(e) => setOtForm({ ...otForm, requestedHours: e.target.value })} className={inputClass}>
                      <option>1 hour</option>
                      <option>2 hours</option>
                      <option>3 hours</option>
                      <option>4 hours</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason for Overtime</label>
                    <select value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })} className={inputClass}>
                      <option>Unexpected scope change for animations</option>
                      <option>Client requested urgent revisions</option>
                      <option>Technical delays</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={erpDesignerId == null}
                    className="rounded-lg bg-[#5d5baf] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4b4991] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Submit Overtime Request
                  </button>
                </div>
              </form>
          </section>

          <section className="ui-surface overflow-hidden">
            <div className="ui-surface-header flex items-center gap-2 px-4 py-3 sm:px-5">
              <FileClock className="h-4 w-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Previous Overtime Requests</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="ui-table-header">
                  <tr>
                    <th className="px-4 py-3">Request Date</th>
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3">Requested Hours</th>
                    <th className="px-4 py-3">Approved Hours</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    {isHOD && <th className="px-4 py-3 text-center">Created By</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {previousOtRequests.length === 0 && !overtimeLoading ? (
                    <tr>
                      <td colSpan={isHOD ? 6 : 5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No overtime requests loaded. Submit above or ensure rows exist for this designer in ErpTSOvertimeRequest.
                      </td>
                    </tr>
                  ) : null}
                  {previousOtRequests.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-500">{formatDate(req.date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{req.taskName}</td>
                      <td className="px-4 py-3 text-slate-700">{req.requested}</td>
                      <td className="px-4 py-3 text-slate-700">{req.approved}</td>
                      <td className="px-4 py-3 text-center">
                        {isHOD && (req.status === "Pending Approval" || req.status === "Pending") ? (
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleApproveOt(req.id)}
                              className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:bg-emerald-600 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRejectOt(req.id)}
                              className="bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:bg-red-600 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className={`inline-block w-24 rounded-full px-3 py-1.5 text-xs font-semibold text-center tracking-wide shadow-sm ${getStatusColorTable(req.status)}`}>{req.status}</span>
                        )}
                      </td>
                      {isHOD && (
                        <td className="px-4 py-3 text-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">ERP</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <span className="text-sm font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="hover:text-emerald-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
