"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { X, Calendar as CalendarIcon } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  fetchLeavePendingApprovals,
  fetchLeaveRequests,
  fetchLeaveTeamRequests,
  reviewLeaveRequest,
  updateLeaveRequest,
} from "@/features/requests/services/requests.api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function normalizeLeaveStatus(status) {
  return String(status ?? "").trim().toUpperCase();
}

function findLeaveOnDate(leaves, dateStr) {
  const targetTime = new Date(dateStr).getTime();
  if (!Array.isArray(leaves)) return null;
  for (const leave of leaves) {
    const fromTime = new Date(leave.fromDate).getTime();
    const toTime = new Date(leave.toDate).getTime();
    if (targetTime >= fromTime && targetTime <= toTime) return leave;
  }
  return null;
}

function statusBadgeClasses(status) {
  const normalized = normalizeLeaveStatus(status);
  if (normalized === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (normalized === "REJECTED") return "bg-red-50 text-red-700";
  if (normalized === "CANCELLED") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

function LeaveHistoryRow({
  req,
  showRequester = false,
  onOpen,
  actionLabel = "View",
  actionClassName = "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50",
}) {
  const status = normalizeLeaveStatus(req.status);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {showRequester ? `${req.requesterName ?? "Team member"} — ` : ""}
          {formatDate(req.fromDate)}
          {req.toDate !== req.fromDate ? ` to ${formatDate(req.toDate)}` : ""}
        </p>
        <p className="text-xs text-slate-500 truncate">{req.reason}</p>
        <p className="text-[10px] text-slate-400">ID: {req.id.slice(0, 8)}…</p>
        {!showRequester && req.approverName && status !== "PENDING" ? (
          <p className="text-[10px] text-slate-500 mt-0.5">
            {status === "APPROVED" ? "Approved" : "Rejected"} by {req.approverName}
            {req.reviewedAt ? ` · ${formatDate(req.reviewedAt)}` : ""}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClasses(status)}`}>
          {status}
        </span>
        <button type="button" onClick={onOpen} className={actionClassName}>
          {actionLabel}
        </button>
      </div>
    </li>
  );
}

function statusCellClasses(status) {
  const normalized = normalizeLeaveStatus(status);
  const base = "cursor-pointer transition-colors z-10 relative";

  if (normalized === "APPROVED") {
    return `bg-rose-500 hover:bg-rose-600 shadow-inner ${base}`;
  }
  if (normalized === "REJECTED" || normalized === "CANCELLED") {
    return `bg-slate-300 hover:bg-slate-400 ${base}`;
  }
  if (normalized === "PENDING") {
    return `bg-amber-300/80 hover:bg-amber-400 ${base}`;
  }
  return "";
}

export default function LeavePlannerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const YEAR = new Date().getFullYear();
  const DAYS_IN_MONTH = [31, isLeapYear(YEAR) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const [leaves, setLeaves] = useState([]);
  const [teamLeaves, setTeamLeaves] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHODModalOpen, setIsHODModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [isEditingLeave, setIsEditingLeave] = useState(false);
  const [editFormData, setEditFormData] = useState({ reason: "", fromDate: "", toDate: "", type: "Leave" });
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [isHOD, setIsHOD] = useState(false);
  const [sessionName, setSessionName] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);

  const canReview = isHOD;

  useEffect(() => {
    import("@/lib/mock-auth").then(({ getSession }) => {
      const session = getSession();
      if (session?.role === "HOD") setIsHOD(true);
      if (session?.name) setSessionName(session.name);
      if (session) setSessionUser(session);
    });
  }, []);

  const designer = {
    id: sessionUser?.id ?? '',
    erpDesignerId: sessionUser?.erpDesignerId ?? sessionUser?.id ?? null,
    name: sessionUser?.name ?? 'Designer',
    designation: isHOD ? 'HOD' : 'Designer',
    avatar: null,
    dateRange: null,
  };

  const activeCalendarLeaves = useMemo(() => {
    if (canReview) return teamLeaves;
    return leaves;
  }, [canReview, leaves, teamLeaves]);

  const calendarScope = canReview ? "team" : "mine";

  const sortedTeamLeaves = useMemo(() => {
    return [...teamLeaves].sort((a, b) => {
      const aPending = normalizeLeaveStatus(a.status) === "PENDING" ? 0 : 1;
      const bPending = normalizeLeaveStatus(b.status) === "PENDING" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime();
    });
  }, [teamLeaves]);

  const reloadLeaves = useCallback(async () => {
    if (!designer.id || canReview) return;
    try {
      const res = await fetchLeaveRequests(designer.id);
      setLeaves(Array.isArray(res) ? res : []);
    } catch {
      setLeaves([]);
    }
  }, [designer.id, canReview]);

  const reloadTeamData = useCallback(async () => {
    if (!canReview) {
      setTeamLeaves([]);
      setPendingApprovals([]);
      return;
    }
    try {
      const [team, pending] = await Promise.all([
        fetchLeaveTeamRequests(),
        fetchLeavePendingApprovals(),
      ]);
      setTeamLeaves(Array.isArray(team) ? team : []);
      setPendingApprovals(Array.isArray(pending) ? pending : []);
    } catch {
      setTeamLeaves([]);
      setPendingApprovals([]);
    }
  }, [canReview]);

  const [formData, setFormData] = useState({
    reason: "",
    fromDate: "",
    toDate: ""
  });

  useEffect(() => {
    void reloadLeaves();
    void reloadTeamData();
  }, [reloadLeaves, reloadTeamData]);

  const openReviewModal = useCallback((leave) => {
    setSelectedLeave(leave);
    setReviewRemarks("");
    setIsEditingLeave(false);
    setEditFormData({
      reason: leave.reason ?? "",
      fromDate: leave.fromDate,
      toDate: leave.toDate,
      type: leave.type ?? "Leave",
    });
    setIsHODModalOpen(true);
  }, []);

  useEffect(() => {
    const leaveId = searchParams.get("leaveId");
    if (!leaveId) return;
    const pool = [...pendingApprovals, ...leaves, ...teamLeaves];
    const match = pool.find((l) => l.id === leaveId);
    if (match) {
      openReviewModal(match);
    }
  }, [searchParams, pendingApprovals, leaves, teamLeaves, openReviewModal]);

  const handleDayClick = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return;

    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existingLeave = findLeaveOnDate(activeCalendarLeaves, dateStr);

    if (existingLeave) {
      openReviewModal(existingLeave);
      return;
    }

    if (canReview) return;

    setFormData({
      reason: "",
      fromDate: dateStr,
      toDate: dateStr
    });
    setIsModalOpen(true);
  };

  const applyReviewResult = (updated) => {
    const patch = (list) => list.map((l) => (l.id === updated.id ? { ...l, ...updated, status: updated.status } : l));
    setLeaves(patch);
    setTeamLeaves(patch);
    setPendingApprovals((prev) => prev.filter((l) => l.id !== updated.id));
  };

  const handleApproveLeave = async (id) => {
    if (reviewSubmitting) return;
    setReviewSubmitting(true);
    try {
      const updated = await reviewLeaveRequest(id, { status: "APPROVED" });
      applyReviewResult(updated);
      setIsHODModalOpen(false);
      toast.success("Leave request approved");
      void reloadLeaves();
      void reloadTeamData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve leave");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleUpdateLeave = async (id) => {
    if (modifySubmitting) return;
    if (!editFormData.reason?.trim() || !editFormData.fromDate || !editFormData.toDate) {
      toast.error("Please fill in reason and dates");
      return;
    }
    setModifySubmitting(true);
    try {
      const updated = await updateLeaveRequest(id, {
        type: editFormData.type,
        reason: editFormData.reason.trim(),
        startDate: editFormData.fromDate,
        endDate: editFormData.toDate,
      });
      applyReviewResult(updated);
      setSelectedLeave(updated);
      setIsEditingLeave(false);
      toast.success("Leave request updated");
      void reloadLeaves();
      void reloadTeamData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update leave request");
    } finally {
      setModifySubmitting(false);
    }
  };

  const handleCancelLeave = async (id) => {
    if (modifySubmitting) return;
    if (!window.confirm("Cancel this pending leave request?")) return;
    setModifySubmitting(true);
    try {
      const updated = await cancelLeaveRequest(id);
      applyReviewResult(updated);
      setIsHODModalOpen(false);
      toast.success("Leave request cancelled");
      void reloadLeaves();
      void reloadTeamData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel leave request");
    } finally {
      setModifySubmitting(false);
    }
  };

  const handleRejectLeave = async (id) => {
    if (reviewSubmitting) return;
    if (!reviewRemarks.trim()) {
      toast.error("Please provide remarks when rejecting a leave request");
      return;
    }
    setReviewSubmitting(true);
    try {
      const updated = await reviewLeaveRequest(id, { status: "REJECTED", remarks: reviewRemarks.trim() });
      applyReviewResult(updated);
      setIsHODModalOpen(false);
      toast.success("Leave request rejected");
      void reloadLeaves();
      void reloadTeamData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject leave");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!formData.reason || !formData.fromDate || !formData.toDate) {
      alert("Please fill in all fields.");
      return;
    }
    if (!designer.id?.trim()) {
      toast.error("Your session is still loading. Please try again in a moment.");
      return;
    }

    try {
      const res = await createLeaveRequest({
        userId: designer.id,
        type: "Leave",
        reason: formData.reason,
        startDate: formData.fromDate,
        endDate: formData.toDate
      });
      setLeaves([...leaves, res]);
      setIsModalOpen(false);
      toast.success("Leave request submitted successfully");
      void reloadTeamData();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to submit leave request. Please try again.");
    }
  };

  const getLeaveOnDate = (dateStr) => findLeaveOnDate(activeCalendarLeaves, dateStr);

  const getCellClass = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return "bg-slate-100/50 pointer-events-none";

    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(YEAR, monthIndex, day);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const leave = getLeaveOnDate(dateStr);
    if (leave) {
      return statusCellClasses(leave.status);
    }

    if (isWeekend) return "bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors";

    return "bg-white cursor-pointer hover:bg-slate-50 transition-colors";
  };

  const renderCellIndicator = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return null;
    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const leave = getLeaveOnDate(dateStr);
    if (!leave || calendarScope !== "team") return null;
    const label = (leave.requesterName ?? "Team").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    return (
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 pointer-events-none">
        {label}
      </span>
    );
  };

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans bg-[#f8fafc]">
      <Navbar dateRangeText={designer.dateRange} />
      
      {/* Top Header matching other pages */}
      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-auto items-center gap-3 border-r border-slate-200 pr-6">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            {designer.avatar ? (
              <img src={designer.avatar} alt={sessionName ?? designer.name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{(sessionName ?? designer.name).split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight text-slate-900">{sessionName ?? designer.name}</span>
            <span className="text-[10px] leading-tight text-slate-500">{designer.designation}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-[1400px] space-y-6">
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
                <CalendarIcon className="w-6 h-6 text-[#5d5baf]" />
                Annual Leave Planner
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {canReview
                  ? "Review designer leave requests from your team"
                  : "Select dates to submit a leave request"}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
              >
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="ui-surface overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[1200px]">
                <thead>
                  <tr>
                    <th className="bg-gradient-to-br from-[#5d5baf] to-[#4b4991] text-white font-bold p-3 text-center w-36 border-b border-r border-[#4b4991] shadow-inner text-lg tracking-wider">
                      {YEAR}
                    </th>
                    {/* Days 1 to 31 */}
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <th key={day} className="bg-[#f4f5fa] text-[#5d5baf] font-bold p-2 text-center min-w-[32px] border-b border-r border-slate-200 text-xs">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((month, mIndex) => (
                    <tr key={month} className="group">
                      <td className="bg-slate-50 text-slate-700 font-semibold p-3 border-b border-r border-slate-200 w-36 group-hover:bg-[#f4f5fa] transition-colors">
                        {month}
                      </td>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                        const dateStr = `${YEAR}-${String(mIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const cellLeave = day <= DAYS_IN_MONTH[mIndex] ? getLeaveOnDate(dateStr) : null;
                        const cellTitle = cellLeave
                          ? calendarScope === "team"
                            ? `${cellLeave.requesterName ?? "Team"} — ${normalizeLeaveStatus(cellLeave.status)}`
                            : `My leave — ${normalizeLeaveStatus(cellLeave.status)}`
                          : undefined;

                        return (
                          <td
                            key={day}
                            className={`border-b border-r border-slate-100 h-10 ${getCellClass(mIndex, day)}`}
                            onClick={() => handleDayClick(mIndex, day)}
                            title={cellTitle}
                          >
                            {renderCellIndicator(mIndex, day)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-6 text-sm font-medium text-slate-600 bg-white py-3 px-5 rounded-lg border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-slate-50 border border-slate-200 rounded shadow-sm"></div>
              <span>Weekend</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-amber-300/80 border border-amber-200 rounded shadow-sm"></div>
              <span>{calendarScope === "team" ? "Pending" : "My pending"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-rose-500 border border-rose-600 rounded shadow-sm"></div>
              <span>{calendarScope === "team" ? "Approved" : "My approved"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-slate-300 border border-slate-400 rounded shadow-sm"></div>
              <span>{calendarScope === "team" ? "Rejected" : "My rejected"}</span>
            </div>
            {calendarScope === "team" ? (
              <div className="flex items-center gap-2.5 text-xs text-slate-500">
                <span>Initials on cells = team member</span>
              </div>
            ) : null}
          </div>

          {canReview ? (
            <div className="ui-surface rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">Designer Team Leaves</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {pendingApprovals.length > 0
                    ? `${pendingApprovals.length} awaiting review · ${sortedTeamLeaves.length} total`
                    : `${sortedTeamLeaves.length} team request${sortedTeamLeaves.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {sortedTeamLeaves.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {sortedTeamLeaves.map((req) => {
                    const isPending = normalizeLeaveStatus(req.status) === "PENDING";
                    return (
                      <LeaveHistoryRow
                        key={req.id}
                        req={req}
                        showRequester
                        actionLabel={isPending ? "Review" : "View"}
                        actionClassName={
                          isPending
                            ? "rounded-lg bg-[#5d5baf] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4b4991]"
                            : "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        }
                        onOpen={() => openReviewModal(req)}
                      />
                    );
                  })}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No designer leave requests yet.</p>
              )}
            </div>
          ) : leaves.length > 0 ? (
            <div className="ui-surface rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">My leave request history</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Your submitted leave requests</p>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {leaves.map((req) => (
                  <LeaveHistoryRow
                    key={req.id}
                    req={req}
                    onOpen={() => openReviewModal(req)}
                  />
                ))}
              </ul>
            </div>
          ) : null}

        </div>
      </div>

      {/* Leave Request Modal */}
      {isModalOpen && !canReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2.5">
                <div className="p-2 bg-[#f0f1fa] rounded-lg">
                  <CalendarIcon className="w-5 h-5 text-[#5d5baf]" />
                </div>
                Submit Leave Request
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleModalSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Reason for Leave</label>
                <textarea 
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] min-h-[100px] shadow-sm transition-all resize-none bg-slate-50 focus:bg-white"
                  placeholder="E.g., Vacation, Medical, Personal..."
                  required
                ></textarea>
              </div>
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                  <input 
                    type="date" 
                    value={formData.fromDate}
                    onChange={e => setFormData({...formData, fromDate: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white transition-all cursor-pointer"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
                  <input 
                    type="date" 
                    value={formData.toDate}
                    onChange={e => setFormData({...formData, toDate: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white transition-all cursor-pointer"
                    required
                  />
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-medium text-white bg-[#5d5baf] rounded-xl hover:bg-[#4b4991] shadow-md shadow-[#5d5baf]/20 transition-all active:scale-[0.98]"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHODModalOpen && selectedLeave && (() => {
        const isOwnRequest = selectedLeave.designerId === designer.id;
        const status = normalizeLeaveStatus(selectedLeave.status);
        const isPendingReview = status === "PENDING";
        const canActOnLeave = isHOD && isPendingReview;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2.5">
                <div className="p-2 bg-[#f0f1fa] rounded-lg">
                  <CalendarIcon className="w-5 h-5 text-[#5d5baf]" />
                </div>
                {canActOnLeave ? "Review Leave Request" : "Leave Request Details"}
              </h2>
              <button 
                onClick={() => setIsHODModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {selectedLeave.requesterName ? (
                <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">Requester</p>
                  <p className="text-slate-900 font-semibold">{selectedLeave.requesterName}</p>
                </div>
              ) : null}
              {isOwnRequest && isPendingReview && isEditingLeave ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                    <select
                      value={editFormData.type}
                      onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="Leave">Leave</option>
                      <option value="Half Day">Half Day</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Reason</label>
                    <textarea
                      value={editFormData.reason}
                      onChange={(e) => setEditFormData({ ...editFormData, reason: e.target.value })}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">From</label>
                      <input
                        type="date"
                        value={editFormData.fromDate}
                        onChange={(e) => setEditFormData({ ...editFormData, fromDate: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">To</label>
                      <input
                        type="date"
                        value={editFormData.toDate}
                        onChange={(e) => setEditFormData({ ...editFormData, toDate: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-slate-500 font-medium mb-1">Reason</p>
                    <p className="text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-100">{selectedLeave.reason}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                    <div>
                      <p className="text-sm text-slate-500 font-medium mb-1">From</p>
                      <p className="text-slate-900 font-semibold">{formatDate(selectedLeave.fromDate)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium mb-1">To</p>
                      <p className="text-slate-900 font-semibold">{formatDate(selectedLeave.toDate)}</p>
                    </div>
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {selectedLeave.createdBy ? (
                  <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                    Created By: {selectedLeave.createdBy}
                  </span>
                ) : null}
                <span
                  className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${
                    status === "APPROVED"
                      ? "bg-emerald-50 text-emerald-700"
                      : status === "REJECTED"
                        ? "bg-red-50 text-red-700"
                        : status === "CANCELLED"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {status}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Request ID: {selectedLeave.id}</p>
              {!isPendingReview && selectedLeave.approverName ? (
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <p>
                    {status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                    <span className="font-semibold text-slate-900">{selectedLeave.approverName}</span>
                    {selectedLeave.reviewedAt ? (
                      <span className="text-slate-500"> · {new Date(selectedLeave.reviewedAt).toLocaleString()}</span>
                    ) : null}
                  </p>
                  {selectedLeave.approverRemarks ? (
                    <p className="mt-1 text-xs text-slate-500">Remarks: {selectedLeave.approverRemarks}</p>
                  ) : null}
                </div>
              ) : null}
              {canActOnLeave ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Remarks (required for rejection)</label>
                  <textarea
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#5d5baf] focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20"
                    placeholder="Optional for approval; required if rejecting"
                  />
                </div>
              ) : isOwnRequest && isPendingReview ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Your request is awaiting HOD approval.
                </p>
              ) : null}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-3">
              {canActOnLeave ? (
                <>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={() => handleRejectLeave(selectedLeave.id)}
                    className="px-5 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={() => handleApproveLeave(selectedLeave.id)}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {reviewSubmitting ? "Saving…" : "Approve Leave"}
                  </button>
                </>
              ) : isOwnRequest && isPendingReview ? (
                isEditingLeave ? (
                  <>
                    <button
                      type="button"
                      disabled={modifySubmitting}
                      onClick={() => setIsEditingLeave(false)}
                      className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel Edit
                    </button>
                    <button
                      type="button"
                      disabled={modifySubmitting}
                      onClick={() => void handleUpdateLeave(selectedLeave.id)}
                      className="px-6 py-2.5 text-sm font-medium text-white bg-[#5d5baf] rounded-xl hover:bg-[#4b4991] disabled:opacity-60"
                    >
                      {modifySubmitting ? "Saving…" : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={modifySubmitting}
                      onClick={() => setIsHODModalOpen(false)}
                      className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={modifySubmitting}
                      onClick={() => void handleCancelLeave(selectedLeave.id)}
                      className="px-5 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-60"
                    >
                      Cancel Request
                    </button>
                    <button
                      type="button"
                      disabled={modifySubmitting}
                      onClick={() => setIsEditingLeave(true)}
                      className="px-6 py-2.5 text-sm font-medium text-white bg-[#5d5baf] rounded-xl hover:bg-[#4b4991] disabled:opacity-60"
                    >
                      Edit Request
                    </button>
                  </>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setIsHODModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
