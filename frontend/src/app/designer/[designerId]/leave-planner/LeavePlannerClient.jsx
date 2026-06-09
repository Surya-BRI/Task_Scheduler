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
  revokeLeaveRequest,
  updateLeaveRequest,
} from "@/features/requests/services/requests.api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DUPLICATE_LEAVE_MSG =
  "You already have a leave request for the selected date(s). Please modify or cancel the existing request instead of creating a duplicate.";

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function normalizeLeaveStatus(status) {
  return String(status ?? "").trim().toUpperCase();
}

function toDateOnlyString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isPastDateOnly(dateStr, todayStr) {
  return dateStr < todayStr;
}

function normalizeDateOnly(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return toDateOnlyString(d);
}

function isLeaveRangeCompleted(endDate, todayStr) {
  const end = normalizeDateOnly(endDate);
  return Boolean(end && end < todayStr);
}

function canRevokeLeave(leave, isHod, todayStr) {
  if (!isHod || !leave) return false;
  const status = normalizeLeaveStatus(leave.status);
  if (status !== "APPROVED") return false;
  return !isLeaveRangeCompleted(leave.toDate, todayStr);
}

function findLeavesOnDate(leaves, dateStr) {
  if (!Array.isArray(leaves) || !dateStr) return [];
  return leaves.filter((leave) => {
    const from = normalizeDateOnly(leave.fromDate);
    const to = normalizeDateOnly(leave.toDate);
    return from && to && dateStr >= from && dateStr <= to;
  });
}

function designerInitials(name) {
  return String(name ?? "Team")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatLeaveDuration(fromDate, toDate) {
  const from = normalizeDateOnly(fromDate);
  const to = normalizeDateOnly(toDate);
  if (!from || !to) return "—";
  return from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
}

function statusStripClass(status) {
  const normalized = normalizeLeaveStatus(status);
  if (normalized === "APPROVED") return "bg-emerald-500";
  if (normalized === "REJECTED") return "bg-red-500";
  if (normalized === "REVOKED") return "bg-orange-500";
  if (normalized === "CANCELLED") return "bg-slate-400";
  if (normalized === "PENDING") return "bg-amber-300/90";
  return "bg-slate-300";
}

function findOverlappingLeaveClient(leaves, fromDate, toDate) {
  if (!Array.isArray(leaves)) return null;
  for (const leave of leaves) {
    const status = normalizeLeaveStatus(leave.status);
    if (status !== "PENDING" && status !== "APPROVED") continue;
    const from = normalizeDateOnly(leave.fromDate);
    const to = normalizeDateOnly(leave.toDate);
    if (from && to && fromDate <= to && from <= toDate) return leave;
  }
  return null;
}

function statusBadgeClasses(status) {
  const normalized = normalizeLeaveStatus(status);
  if (normalized === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (normalized === "REJECTED") return "bg-red-50 text-red-700";
  if (normalized === "REVOKED") return "bg-orange-50 text-orange-700";
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
        {!showRequester && status === "REVOKED" && req.revokedByName ? (
          <p className="text-[10px] text-slate-500 mt-0.5">
            Revoked by {req.revokedByName}
            {req.revokedAt ? ` · ${formatDate(req.revokedAt)}` : ""}
          </p>
        ) : null}
        {!showRequester && req.approverName && status !== "PENDING" && status !== "REVOKED" ? (
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
    return `bg-emerald-500 hover:bg-emerald-600 shadow-inner ${base}`;
  }
  if (normalized === "REJECTED") {
    return `bg-red-500 hover:bg-red-600 shadow-inner ${base}`;
  }
  if (normalized === "REVOKED") {
    return `bg-orange-500 hover:bg-orange-600 shadow-inner ${base}`;
  }
  if (normalized === "CANCELLED") {
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
  const todayStr = useMemo(() => toDateOnlyString(new Date()), []);
  const DAYS_IN_MONTH = [31, isLeapYear(YEAR) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const [leaves, setLeaves] = useState([]);
  const [teamLeaves, setTeamLeaves] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHODModalOpen, setIsHODModalOpen] = useState(false);
  const [isDayLeavesModalOpen, setIsDayLeavesModalOpen] = useState(false);
  const [dayLeavesList, setDayLeavesList] = useState([]);
  const [dayLeavesDate, setDayLeavesDate] = useState("");
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [revokeRemarks, setRevokeRemarks] = useState("");
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

  const sortLeavesByLatest = (rows) =>
    [...rows].sort(
      (a, b) =>
        new Date(b.createdAt ?? b.fromDate ?? 0).getTime() -
        new Date(a.createdAt ?? a.fromDate ?? 0).getTime(),
    );

  const sortedTeamLeaves = useMemo(() => sortLeavesByLatest(teamLeaves), [teamLeaves]);
  const sortedLeaves = useMemo(() => sortLeavesByLatest(leaves), [leaves]);

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

  useEffect(() => {
    const pollMs = 45000;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void reloadLeaves();
      void reloadTeamData();
    };
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [reloadLeaves, reloadTeamData]);

  const openReviewModal = useCallback((leave) => {
    setSelectedLeave(leave);
    setReviewRemarks("");
    setRevokeRemarks("");
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

  useEffect(() => {
    if (!isHODModalOpen || !selectedLeave?.id) return;
    const pool = [...pendingApprovals, ...leaves, ...teamLeaves];
    const fresh = pool.find((l) => l.id === selectedLeave.id);
    if (fresh) {
      setSelectedLeave((prev) => (prev?.id === fresh.id ? { ...prev, ...fresh } : prev));
    }
  }, [isHODModalOpen, selectedLeave?.id, leaves, teamLeaves, pendingApprovals]);

  const handleDayClick = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return;

    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayLeaves = findLeavesOnDate(activeCalendarLeaves, dateStr);

    if (dayLeaves.length === 1) {
      openReviewModal(dayLeaves[0]);
      return;
    }
    if (dayLeaves.length > 1) {
      setDayLeavesList(dayLeaves);
      setDayLeavesDate(dateStr);
      setIsDayLeavesModalOpen(true);
      return;
    }

    if (canReview) return;

    if (isPastDateOnly(dateStr, todayStr)) {
      toast.error("Leave cannot be requested for past dates. Select today or a future date.");
      return;
    }

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
    if (isPastDateOnly(editFormData.fromDate, todayStr) || isPastDateOnly(editFormData.toDate, todayStr)) {
      toast.error("Leave cannot be requested for past dates. Select today or a future date.");
      return;
    }
    if (editFormData.toDate < editFormData.fromDate) {
      toast.error("End date cannot be earlier than start date.");
      return;
    }
    const overlap = findOverlappingLeaveClient(
      leaves.filter((l) => l.id !== id),
      editFormData.fromDate,
      editFormData.toDate,
    );
    if (overlap) {
      toast.error(DUPLICATE_LEAVE_MSG);
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

  const handleRevokeLeave = async (id) => {
    if (reviewSubmitting) return;
    if (!revokeRemarks.trim()) {
      toast.error("Please provide a reason for revoking this leave");
      return;
    }
    setReviewSubmitting(true);
    try {
      const updated = await revokeLeaveRequest(id, { reason: revokeRemarks.trim() });
      applyReviewResult(updated);
      setSelectedLeave(updated);
      setIsHODModalOpen(false);
      toast.success("Leave request revoked");
      void reloadLeaves();
      void reloadTeamData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke leave");
    } finally {
      setReviewSubmitting(false);
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

    if (isPastDateOnly(formData.fromDate, todayStr) || isPastDateOnly(formData.toDate, todayStr)) {
      toast.error("Leave cannot be requested for past dates. Select today or a future date.");
      return;
    }
    if (formData.toDate < formData.fromDate) {
      toast.error("End date cannot be earlier than start date.");
      return;
    }

    const overlap = findOverlappingLeaveClient(leaves, formData.fromDate, formData.toDate);
    if (overlap) {
      setIsModalOpen(false);
      toast.error(DUPLICATE_LEAVE_MSG);
      openReviewModal(overlap);
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
      const message = error instanceof Error ? error.message : "Failed to submit leave request. Please try again.";
      if (message.toLowerCase().includes("overlap") || message.includes(DUPLICATE_LEAVE_MSG)) {
        const conflict = findOverlappingLeaveClient(leaves, formData.fromDate, formData.toDate);
        setIsModalOpen(false);
        toast.error(DUPLICATE_LEAVE_MSG);
        if (conflict) openReviewModal(conflict);
        void reloadLeaves();
        return;
      }
      console.error(error);
      toast.error(message);
    }
  };

  const getLeavesOnDate = (dateStr) => findLeavesOnDate(activeCalendarLeaves, dateStr);

  const getCellClass = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return "bg-slate-100/50 pointer-events-none";

    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(YEAR, monthIndex, day);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPast = !canReview && isPastDateOnly(dateStr, todayStr);

    const dayLeaves = getLeavesOnDate(dateStr);
    if (dayLeaves.length === 1) {
      return statusCellClasses(dayLeaves[0].status);
    }
    if (dayLeaves.length > 1) {
      return "cursor-pointer transition-colors z-10 relative p-0 overflow-hidden bg-white hover:bg-slate-50";
    }

    if (isPast) {
      return "bg-slate-100/80 pointer-events-none opacity-60";
    }

    if (isWeekend) return "bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors";

    return "bg-white cursor-pointer hover:bg-slate-50 transition-colors";
  };

  const renderCellContent = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return null;
    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayLeaves = getLeavesOnDate(dateStr);
    if (dayLeaves.length === 0) return null;

    if (dayLeaves.length === 1) {
      const leave = dayLeaves[0];
      if (calendarScope !== "team") return null;
      return (
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 pointer-events-none">
          {designerInitials(leave.requesterName)}
        </span>
      );
    }

    return (
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {dayLeaves.map((leave) => (
          <div
            key={leave.id}
            className={`flex flex-1 min-h-[4px] items-center justify-center ${statusStripClass(leave.status)}`}
            title={`${leave.requesterName ?? "Team"} — ${leave.type ?? "Leave"}`}
          >
            <span className="text-[6px] font-bold text-white/95 leading-none px-0.5 truncate max-w-full">
              {calendarScope === "team" ? designerInitials(leave.requesterName) : normalizeLeaveStatus(leave.status).slice(0, 1)}
            </span>
          </div>
        ))}
        <span className="absolute top-0 right-0 rounded-bl bg-slate-900/70 px-1 text-[7px] font-bold text-white leading-tight">
          {dayLeaves.length}
        </span>
      </div>
    );
  };

  const buildCellTitle = (dayLeaves) => {
    if (!dayLeaves.length) return undefined;
    return dayLeaves
      .map(
        (leave) =>
          `${leave.requesterName ?? "Team"} · ${leave.type ?? "Leave"} · ${formatLeaveDuration(leave.fromDate, leave.toDate)} · ${normalizeLeaveStatus(leave.status)}`,
      )
      .join("\n");
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
                        const cellLeaves =
                          day <= DAYS_IN_MONTH[mIndex] ? getLeavesOnDate(dateStr) : [];
                        const cellTitle = buildCellTitle(cellLeaves);

                        return (
                          <td
                            key={day}
                            className={`border-b border-r border-slate-100 min-h-10 h-10 ${getCellClass(mIndex, day)}`}
                            onClick={() => handleDayClick(mIndex, day)}
                            title={cellTitle}
                          >
                            {renderCellContent(mIndex, day)}
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
              <div className="w-4 h-4 bg-emerald-500 border border-emerald-600 rounded shadow-sm"></div>
              <span>{calendarScope === "team" ? "Approved" : "My approved"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-red-500 border border-red-600 rounded shadow-sm"></div>
              <span>{calendarScope === "team" ? "Rejected" : "My rejected"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-orange-500 border border-orange-600 rounded shadow-sm"></div>
              <span>{calendarScope === "team" ? "Revoked" : "My revoked"}</span>
            </div>
            {calendarScope === "team" ? (
              <div className="flex items-center gap-2.5 text-xs text-slate-500">
                <span>Stacked bars = multiple designers on the same day · badge shows count</span>
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
                {sortedLeaves.map((req) => (
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
                    min={todayStr}
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
                    min={formData.fromDate || todayStr}
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

      {isDayLeavesModalOpen && dayLeavesList.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Leave requests</h2>
                <p className="text-sm text-slate-500 mt-0.5">{formatDate(dayLeavesDate)} · {dayLeavesList.length} designer{dayLeavesList.length === 1 ? "" : "s"}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDayLeavesModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {dayLeavesList.map((leave) => {
                const status = normalizeLeaveStatus(leave.status);
                const isPending = status === "PENDING";
                return (
                  <li key={leave.id} className="px-6 py-4 hover:bg-slate-50/80">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{leave.requesterName ?? "Team member"}</p>
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Type:</span> {leave.type ?? "Leave"}
                        </p>
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Duration:</span> {formatLeaveDuration(leave.fromDate, leave.toDate)}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-2">
                          <span className="font-medium text-slate-600">Reason:</span> {leave.reason ?? "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClasses(status)}`}>
                          {status}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDayLeavesModalOpen(false);
                            openReviewModal(leave);
                          }}
                          className={
                            isPending && canReview
                              ? "rounded-lg bg-[#5d5baf] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4b4991]"
                              : "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          }
                        >
                          {isPending && canReview ? "Review" : "View"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {isHODModalOpen && selectedLeave && (() => {
        const isOwnRequest = selectedLeave.designerId === designer.id;
        const status = normalizeLeaveStatus(selectedLeave.status);
        const isPendingReview = status === "PENDING";
        const canActOnLeave = isHOD && isPendingReview;
        const showRevokeAction = canRevokeLeave(selectedLeave, isHOD, todayStr);
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
                  <p className="text-sm text-slate-500 font-medium mb-1">Designer</p>
                  <p className="text-slate-900 font-semibold">{selectedLeave.requesterName}</p>
                </div>
              ) : null}
              {selectedLeave.type ? (
                <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">Leave Type</p>
                  <p className="text-slate-900 font-semibold">{selectedLeave.type}</p>
                </div>
              ) : null}
              {!isEditingLeave ? (
                <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">Duration</p>
                  <p className="text-slate-900 font-semibold">
                    {formatLeaveDuration(selectedLeave.fromDate, selectedLeave.toDate)}
                  </p>
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
                        min={todayStr}
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
                        min={editFormData.fromDate || todayStr}
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
                        : status === "REVOKED"
                          ? "bg-orange-50 text-orange-700"
                          : status === "CANCELLED"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {status}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Request ID: {selectedLeave.id}</p>
              {status === "REVOKED" && selectedLeave.revokedByName ? (
                <div className="text-sm text-slate-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                  <p>
                    Revoked by{" "}
                    <span className="font-semibold text-slate-900">{selectedLeave.revokedByName}</span>
                    {selectedLeave.revokedAt ? (
                      <span className="text-slate-500"> · {new Date(selectedLeave.revokedAt).toLocaleString()}</span>
                    ) : null}
                  </p>
                  {selectedLeave.revocationReason ? (
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Reason:</span> {selectedLeave.revocationReason}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!isPendingReview && status !== "REVOKED" && selectedLeave.approverName ? (
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
              ) : showRevokeAction ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Revocation reason (required)</label>
                  <textarea
                    value={revokeRemarks}
                    onChange={(e) => setRevokeRemarks(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-orange-200 px-3 py-2 text-sm text-slate-800 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    placeholder="Explain why this approved leave is being revoked"
                  />
                </div>
              ) : isOwnRequest && isPendingReview ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Your request is awaiting HOD approval.
                </p>
              ) : status === "REVOKED" && isOwnRequest ? (
                <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                  This leave was revoked by your HOD. The dates are available again for new requests.
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
              ) : showRevokeAction ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsHODModalOpen(false)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={() => void handleRevokeLeave(selectedLeave.id)}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-orange-500 rounded-xl hover:bg-orange-600 shadow-md shadow-orange-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {reviewSubmitting ? "Saving…" : "Revoke Leave"}
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
