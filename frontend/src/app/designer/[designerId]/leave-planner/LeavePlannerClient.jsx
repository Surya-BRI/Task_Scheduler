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
import { LEAVE_REASON_OPTIONS } from "@/lib/date-window";
import { apiClient } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui/StatusBadge";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DUPLICATE_LEAVE_MSG =
  "You already have a leave request for the selected date(s). Please modify or cancel the existing request instead of creating a duplicate.";

const LEAVE_TYPE_OPTIONS = ["Full Day", "Half Day"];
const HALF_DAY_SESSION_OPTIONS = ["First Half", "Second Half"];

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

/** Active leaves only — revoked/cancelled/rejected do not block calendar colors */
function findActiveLeavesOnDate(leaves, dateStr) {
  return findLeavesOnDate(leaves, dateStr).filter((leave) => {
    const status = normalizeLeaveStatus(leave.status);
    return status === "PENDING" || status === "APPROVED";
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

function normalizeLeaveType(type) {
  const normalized = String(type ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "half day" || normalized === "half") return "Half Day";
  return "Full Day";
}

function normalizeHalfDaySession(session) {
  const normalized = String(session ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "first half" || normalized === "first" || normalized === "am" || normalized === "morning") {
    return "First Half";
  }
  if (normalized === "second half" || normalized === "second" || normalized === "pm" || normalized === "afternoon") {
    return "Second Half";
  }
  return "";
}

function leaveTypeDisplay(leave) {
  const type = normalizeLeaveType(leave?.type);
  const session = normalizeHalfDaySession(leave?.halfDaySession);
  return type === "Half Day" && session ? `${type} (${session})` : type;
}

function calculateLeaveDurationDays(leave) {
  if (Number.isFinite(Number(leave?.leaveDurationDays))) return Number(leave.leaveDurationDays);
  if (normalizeLeaveType(leave?.type) === "Half Day") return 0.5;
  const from = normalizeDateOnly(leave?.fromDate);
  const to = normalizeDateOnly(leave?.toDate);
  if (!from || !to) return "—";
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days <= 0) return "—";
  return days;
}

function leaveDurationLabel(leave) {
  if (leave?.leaveDurationLabel) return leave.leaveDurationLabel;
  const days = calculateLeaveDurationDays(leave);
  if (days === "—") return "—";
  return days <= 1 ? `${days} day` : `${days} days`;
}

function formatAppliedDate(value) {
  if (!value) return "—";
  return formatDate(value);
}

function approvalDetailLine(req) {
  const status = normalizeLeaveStatus(req.status);
  if (status === "PENDING") return "Awaiting approval";
  if (status === "REVOKED") {
    const who = req.revokedByName ? `Revoked by ${req.revokedByName}` : "Revoked";
    const reason = req.revocationReason?.trim();
    return reason ? `${who} — ${reason}` : who;
  }
  if (req.approverName) {
    const verb = status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Reviewed";
    const remarks = req.approverRemarks?.trim();
    return remarks ? `${verb} by ${req.approverName} — ${remarks}` : `${verb} by ${req.approverName}`;
  }
  return req.approverRemarks?.trim() || "—";
}

const HISTORY_STATUS_OPTIONS = ["ALL", "PENDING", "APPROVED", "REJECTED", "REVOKED", "CANCELLED"];

function statusStripClass(status) {
  const normalized = normalizeLeaveStatus(status);
  if (normalized === "APPROVED") return "bg-emerald-500";
  if (normalized === "REJECTED") return "bg-red-500";
  if (normalized === "REVOKED") return "bg-orange-500";
  if (normalized === "CANCELLED") return "bg-slate-400";
  if (normalized === "PENDING") return "bg-amber-300/90";
  return "bg-slate-300";
}

function mergeLeaveLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row?.id) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function findOverlappingLeaveClient(leaves, fromDate, toDate, type = "Full Day", halfDaySession = "") {
  if (!Array.isArray(leaves)) return null;
  const requestedType = normalizeLeaveType(type);
  const requestedSession = normalizeHalfDaySession(halfDaySession);
  for (const leave of leaves) {
    const status = normalizeLeaveStatus(leave.status);
    if (status !== "PENDING" && status !== "APPROVED") continue;
    const from = normalizeDateOnly(leave.fromDate);
    const to = normalizeDateOnly(leave.toDate);
    if (from && to && fromDate <= to && from <= toDate) {
      const leaveType = normalizeLeaveType(leave.type);
      const leaveSession = normalizeHalfDaySession(leave.halfDaySession);
      const bothHalfDaySameDate =
        requestedType === "Half Day" &&
        leaveType === "Half Day" &&
        fromDate === toDate &&
        from === to &&
        fromDate === from;
      if (bothHalfDaySameDate && requestedSession && leaveSession && requestedSession !== leaveSession) {
        continue;
      }
      return leave;
    }
  }
  return null;
}

const ALL_HISTORY_DESIGNERS = "ALL";

function getLeaveRequesterId(row) {
  return String(row?.designerId ?? row?.userId ?? row?.createdBy ?? "").trim();
}

function filterLeavesForRequester(leaves, requesterId) {
  const id = String(requesterId ?? "").trim();
  if (!id) return [];
  return (Array.isArray(leaves) ? leaves : []).filter((leave) => getLeaveRequesterId(leave) === id);
}

function filterHistoryRows(rows, { statusFilter, searchQuery, designerId = ALL_HISTORY_DESIGNERS }) {
  let list = Array.isArray(rows) ? [...rows] : [];
  if (designerId && designerId !== ALL_HISTORY_DESIGNERS) {
    list = list.filter((row) => getLeaveRequesterId(row) === designerId);
  }
  if (statusFilter && statusFilter !== "ALL") {
    list = list.filter((row) => normalizeLeaveStatus(row.status) === statusFilter);
  }
  const q = searchQuery?.trim().toLowerCase();
  if (q) {
    list = list.filter((row) => {
      const haystack = [
        row.reason,
        row.type,
        row.halfDaySession,
        row.leaveDurationLabel,
        row.requesterName,
        row.approverName,
        row.revokedByName,
        normalizeLeaveStatus(row.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }
  return list.sort(
    (a, b) =>
      new Date(b.createdAt ?? b.fromDate ?? 0).getTime() -
      new Date(a.createdAt ?? a.fromDate ?? 0).getTime(),
  );
}

function LeaveHistoryTable({ rows, variant, onOpen }) {
  if (!rows.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        {variant === "team" ? "No team leave records match your filters." : "No leave records match your filters."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-left text-xs">
        <thead className="ui-table-header">
          <tr>
            {variant === "team" ? <th className="px-3 py-2.5">Designer</th> : null}
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Date range</th>
            <th className="px-3 py-2.5">Duration</th>
            <th className="px-3 py-2.5">Applied</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Remarks</th>
            <th className="px-3 py-2.5">{variant === "team" ? "Approver" : "Approval"}</th>
            <th className="px-3 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((req) => {
            const status = normalizeLeaveStatus(req.status);
            const isPending = status === "PENDING";
            return (
              <tr key={req.id} className="hover:bg-slate-50/80">
                {variant === "team" ? (
                  <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">
                    {req.requesterName ?? "—"}
                  </td>
                ) : null}
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{leaveTypeDisplay(req)}</td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                  {formatLeaveDuration(req.fromDate, req.toDate)}
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                  {leaveDurationLabel(req)}
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                  {formatAppliedDate(req.createdAt ?? req.fromDate)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <StatusBadge status={status} label={status} size="sm" />
                </td>
                <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate" title={req.reason}>
                  {req.reason ?? "—"}
                </td>
                <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate" title={variant === "team" ? req.approverName : approvalDetailLine(req)}>
                  {variant === "team" ? (req.approverName ?? "—") : approvalDetailLine(req)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onOpen(req)}
                    className={
                      variant === "team" && isPending
                        ? "rounded-lg bg-[#5d5baf] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#4b4991]"
                        : "rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    }
                  >
                    {variant === "team" && isPending ? "Review" : "View"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  const [editFormData, setEditFormData] = useState({
    reason: "",
    fromDate: "",
    toDate: "",
    type: "Full Day",
    halfDaySession: "",
  });
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [isHOD, setIsHOD] = useState(false);
  const [sessionName, setSessionName] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [leaveApplyMode, setLeaveApplyMode] = useState("self");
  const [designerList, setDesignerList] = useState([]);
  const [selectedDesignerId, setSelectedDesignerId] = useState("");
  const [historyTab, setHistoryTab] = useState("hod");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [historyDesignerFilter, setHistoryDesignerFilter] = useState(ALL_HISTORY_DESIGNERS);

  const canReview = isHOD;

  const [formData, setFormData] = useState({
    leaveType: "Full Day",
    halfDaySession: "",
    reasonCategory: "",
    reasonOther: "",
    fromDate: "",
    toDate: "",
  });

  const closeLeaveApplyModal = useCallback(() => {
    setIsModalOpen(false);
    setLeaveApplyMode("self");
    setSelectedDesignerId("");
    setFormData({
      leaveType: "Full Day",
      halfDaySession: "",
      reasonCategory: "",
      reasonOther: "",
      fromDate: "",
      toDate: "",
    });
  }, [setFormData, setIsModalOpen, setLeaveApplyMode, setSelectedDesignerId]);

  const openLeaveApplyModal = useCallback((dateStr) => {
    setLeaveApplyMode("self");
    setSelectedDesignerId("");
    setFormData({
      leaveType: "Full Day",
      halfDaySession: "",
      reasonCategory: "",
      reasonOther: "",
      fromDate: dateStr,
      toDate: dateStr,
    });
    setIsModalOpen(true);
  }, [setFormData, setIsModalOpen, setLeaveApplyMode, setSelectedDesignerId]);

  useEffect(() => {
    import("@/lib/mock-auth").then(({ getSession }) => {
      const session = getSession();
      if (session?.role === "HOD") setIsHOD(true);
      if (session?.name) setSessionName(session.name);
      if (session) setSessionUser(session);
    });
  }, []);

  useEffect(() => {
    if (!isHOD) return;
    apiClient.get("/users?role=DESIGNER").then((res) => {
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setDesignerList(rows.map((u) => ({ id: u.id, name: u.fullName })));
    }).catch(() => setDesignerList([]));
  }, [isHOD]);

  const designer = {
    id: sessionUser?.id ?? '',
    erpDesignerId: sessionUser?.erpDesignerId ?? sessionUser?.id ?? null,
    name: sessionUser?.name ?? 'Designer',
    designation: isHOD ? 'HOD' : 'Designer',
    avatar: null,
    dateRange: null,
  };

  const activeCalendarLeaves = useMemo(() => {
    if (!canReview) return leaves;
    return mergeLeaveLists(teamLeaves, leaves);
  }, [canReview, leaves, teamLeaves]);

  const designerTeamLeaves = useMemo(
    () => teamLeaves.filter((req) => (req.designerId ?? req.userId) !== designer.id),
    [teamLeaves, designer.id],
  );

  const calendarScope = canReview ? "team" : "mine";

  const historyDesignerOptions = useMemo(() => {
    const byId = new Map();

    for (const user of designerList) {
      const id = String(user?.id ?? "").trim();
      if (!id || id === designer.id) continue;
      byId.set(id, user.name || "Unnamed designer");
    }

    for (const leave of designerTeamLeaves) {
      const id = getLeaveRequesterId(leave);
      if (!id || id === designer.id) continue;
      if (!byId.has(id)) {
        byId.set(id, leave.requesterName || "Unnamed designer");
      }
    }

    return Array.from(byId, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [designerList, designerTeamLeaves, designer.id]);

  useEffect(() => {
    if (historyDesignerFilter === ALL_HISTORY_DESIGNERS) return;
    if (!historyDesignerOptions.some((option) => option.id === historyDesignerFilter)) {
      setHistoryDesignerFilter(ALL_HISTORY_DESIGNERS);
    }
  }, [historyDesignerFilter, historyDesignerOptions]);

  const filteredHodHistory = useMemo(
    () => filterHistoryRows(leaves, { statusFilter: historyStatusFilter, searchQuery: historySearch }),
    [leaves, historyStatusFilter, historySearch],
  );

  const filteredTeamHistory = useMemo(
    () => filterHistoryRows(designerTeamLeaves, {
      statusFilter: historyStatusFilter,
      searchQuery: historySearch,
      designerId: historyDesignerFilter,
    }),
    [designerTeamLeaves, historyStatusFilter, historySearch, historyDesignerFilter],
  );

  const reloadLeaves = useCallback(async () => {
    if (!designer.id) return;
    try {
      const res = await fetchLeaveRequests(designer.id);
      setLeaves(Array.isArray(res) ? res : []);
    } catch {
      setLeaves([]);
    }
  }, [designer.id]);

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
      type: normalizeLeaveType(leave.type),
      halfDaySession: normalizeHalfDaySession(leave.halfDaySession),
    });
    setIsHODModalOpen(true);
  }, [
    setEditFormData,
    setIsEditingLeave,
    setIsHODModalOpen,
    setReviewRemarks,
    setRevokeRemarks,
    setSelectedLeave,
  ]);

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
    const activeDayLeaves = findActiveLeavesOnDate(activeCalendarLeaves, dateStr);

    if (canReview && activeDayLeaves.length > 0) {
      setDayLeavesList(activeDayLeaves);
      setDayLeavesDate(dateStr);
      setIsDayLeavesModalOpen(true);
      return;
    }

    if (activeDayLeaves.length === 1) {
      openReviewModal(activeDayLeaves[0]);
      return;
    }
    if (activeDayLeaves.length > 1) {
      setDayLeavesList(activeDayLeaves);
      setDayLeavesDate(dateStr);
      setIsDayLeavesModalOpen(true);
      return;
    }

    if (!canReview && isPastDateOnly(dateStr, todayStr)) {
      toast.error("Leave cannot be requested for past dates. Select today or a future date.");
      return;
    }

    openLeaveApplyModal(dateStr);
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
    if (normalizeLeaveType(editFormData.type) === "Half Day" && editFormData.toDate !== editFormData.fromDate) {
      toast.error("Half Day leave must start and end on the same date.");
      return;
    }
    if (normalizeLeaveType(editFormData.type) === "Half Day" && !normalizeHalfDaySession(editFormData.halfDaySession)) {
      toast.error("Select First Half or Second Half for Half Day leave.");
      return;
    }
    const overlap = findOverlappingLeaveClient(
      leaves.filter((l) => l.id !== id),
      editFormData.fromDate,
      editFormData.toDate,
      editFormData.type,
      editFormData.halfDaySession,
    );
    if (overlap) {
      toast.error(DUPLICATE_LEAVE_MSG);
      return;
    }
    setModifySubmitting(true);
    try {
      const updated = await updateLeaveRequest(id, {
        type: normalizeLeaveType(editFormData.type),
        halfDaySession: normalizeLeaveType(editFormData.type) === "Half Day"
          ? normalizeHalfDaySession(editFormData.halfDaySession)
          : undefined,
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
    if (!formData.reasonCategory || !formData.fromDate || !formData.toDate) {
      alert("Please fill in all fields.");
      return;
    }
    if (formData.reasonCategory === "Other" && !formData.reasonOther?.trim()) {
      toast.error("Please provide details when reason is Other.");
      return;
    }

    if (canReview && leaveApplyMode === "others" && !selectedDesignerId?.trim()) {
      toast.error("Select a designer in Others mode to apply leave on their behalf.");
      return;
    }

    const targetUserId =
      canReview && leaveApplyMode === "others" ? selectedDesignerId : designer.id;
    if (!targetUserId?.trim()) {
      toast.error("Your session is still loading. Please try again in a moment.");
      return;
    }

    if (!canReview && (isPastDateOnly(formData.fromDate, todayStr) || isPastDateOnly(formData.toDate, todayStr))) {
      toast.error("Leave cannot be requested for past dates. Select today or a future date.");
      return;
    }
    if (formData.toDate < formData.fromDate) {
      toast.error("End date cannot be earlier than start date.");
      return;
    }
    if (normalizeLeaveType(formData.leaveType) === "Half Day" && formData.toDate !== formData.fromDate) {
      toast.error("Half Day leave must start and end on the same date.");
      return;
    }
    if (normalizeLeaveType(formData.leaveType) === "Half Day" && !normalizeHalfDaySession(formData.halfDaySession)) {
      toast.error("Select First Half or Second Half for Half Day leave.");
      return;
    }

    const overlapPool = filterLeavesForRequester(
      canReview ? mergeLeaveLists(leaves, teamLeaves) : leaves,
      targetUserId,
    );
    const overlap = findOverlappingLeaveClient(
      overlapPool,
      formData.fromDate,
      formData.toDate,
      formData.leaveType,
      formData.halfDaySession,
    );
    if (overlap) {
      closeLeaveApplyModal();
      toast.error(DUPLICATE_LEAVE_MSG);
      openReviewModal(overlap);
      return;
    }

    try {
      const res = await createLeaveRequest({
        userId: targetUserId,
        type: normalizeLeaveType(formData.leaveType),
        halfDaySession: normalizeLeaveType(formData.leaveType) === "Half Day"
          ? normalizeHalfDaySession(formData.halfDaySession)
          : undefined,
        reasonCategory: formData.reasonCategory,
        reasonOther: formData.reasonCategory === "Other" ? formData.reasonOther.trim() : undefined,
        startDate: formData.fromDate,
        endDate: formData.toDate,
      });
      if (canReview && leaveApplyMode === "others") {
        setTeamLeaves((prev) => [...prev, res]);
      } else {
        setLeaves((prev) => [...prev, res]);
      }
      closeLeaveApplyModal();
      toast.success(canReview ? "Leave auto-approved" : "Leave request submitted successfully");
      void reloadLeaves();
      void reloadTeamData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit leave request. Please try again.";
      if (message.toLowerCase().includes("overlap") || message.includes(DUPLICATE_LEAVE_MSG)) {
        const conflict = findOverlappingLeaveClient(
          overlapPool,
          formData.fromDate,
          formData.toDate,
          formData.leaveType,
          formData.halfDaySession,
        );
        closeLeaveApplyModal();
        toast.error(DUPLICATE_LEAVE_MSG);
        if (conflict) openReviewModal(conflict);
        void reloadLeaves();
        return;
      }
      console.error(error);
      toast.error(message);
    }
  };

  const getLeavesOnDate = (dateStr) => findActiveLeavesOnDate(activeCalendarLeaves, dateStr);

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
            title={`${leave.requesterName ?? "Team"} — ${leaveTypeDisplay(leave)} (${leaveDurationLabel(leave)})`}
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
          `${leave.requesterName ?? "Team"} · ${leaveTypeDisplay(leave)} · ${leaveDurationLabel(leave)} · ${formatLeaveDuration(leave.fromDate, leave.toDate)} · ${normalizeLeaveStatus(leave.status)}`,
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

          {(canReview || leaves.length > 0) ? (
            <div className="ui-surface overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 pt-4 sm:px-5">
                <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Leave History</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {canReview
                        ? pendingApprovals.length > 0
                          ? `${pendingApprovals.length} awaiting review · ${leaves.length} HOD · ${designerTeamLeaves.length} team`
                          : `${leaves.length} HOD · ${designerTeamLeaves.length} team record${designerTeamLeaves.length === 1 ? "" : "s"}`
                        : "Your submitted leave requests"}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <input
                      type="search"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search type, remarks, status…"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-[#5d5baf] focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 sm:min-w-[220px]"
                    />
                    <select
                      value={historyStatusFilter}
                      onChange={(e) => setHistoryStatusFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-[#5d5baf] focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 sm:min-w-[140px]"
                    >
                      {HISTORY_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option === "ALL" ? "All statuses" : option}
                        </option>
                      ))}
                    </select>
                    {canReview && historyTab === "team" ? (
                      <select
                        aria-label="Filter team leave history by designer"
                        value={historyDesignerFilter}
                        onChange={(e) => setHistoryDesignerFilter(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-[#5d5baf] focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 sm:min-w-[190px]"
                      >
                        <option value={ALL_HISTORY_DESIGNERS}>All designers</option>
                        {historyDesignerOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
                {canReview ? (
                  <div className="flex border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setHistoryTab("hod")}
                      className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                        historyTab === "hod"
                          ? "border-b-2 border-[#5d5baf] text-[#5d5baf]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      HOD Leave History
                      <span className="ml-1.5 text-xs font-normal text-slate-400">({filteredHodHistory.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab("team")}
                      className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${
                        historyTab === "team"
                          ? "border-b-2 border-[#5d5baf] text-[#5d5baf]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Team Leave History
                      <span className="ml-1.5 text-xs font-normal text-slate-400">({filteredTeamHistory.length})</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="p-4 sm:p-5">
                {canReview ? (
                  historyTab === "hod" ? (
                    <LeaveHistoryTable
                      rows={filteredHodHistory}
                      variant="hod"
                      onOpen={openReviewModal}
                    />
                  ) : (
                    <LeaveHistoryTable
                      rows={filteredTeamHistory}
                      variant="team"
                      onOpen={openReviewModal}
                    />
                  )
                ) : (
                  <LeaveHistoryTable
                    rows={filteredHodHistory}
                    variant="hod"
                    onOpen={openReviewModal}
                  />
                )}
              </div>
            </div>
          ) : null}

        </div>
      </div>

      {/* Leave Request Modal */}
      {isModalOpen && (!canReview || leaveApplyMode === "self" || leaveApplyMode === "others") && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={closeLeaveApplyModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2.5">
                <div className="p-2 bg-[#f0f1fa] rounded-lg">
                  <CalendarIcon className="w-5 h-5 text-[#5d5baf]" />
                </div>
                Submit Leave Request
              </h2>
              <button 
                type="button"
                onClick={closeLeaveApplyModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleModalSubmit} className="p-6 space-y-5">
              {canReview ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apply leave for</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLeaveApplyMode("self");
                        setSelectedDesignerId("");
                      }}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${leaveApplyMode === "self" ? "bg-[#5d5baf] text-white" : "bg-white border border-slate-200 text-slate-700"}`}
                    >
                      Self
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveApplyMode("others")}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${leaveApplyMode === "others" ? "bg-[#5d5baf] text-white" : "bg-white border border-slate-200 text-slate-700"}`}
                    >
                      Others
                    </button>
                  </div>
                  {leaveApplyMode === "others" ? (
                    <select
                      value={selectedDesignerId}
                      onChange={(e) => setSelectedDesignerId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    >
                      <option value="" disabled>Select designer</option>
                      {designerList.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Leave Type</label>
                <select
                  value={formData.leaveType}
                  onChange={(e) => {
                    const nextType = normalizeLeaveType(e.target.value);
                    setFormData({
                      ...formData,
                      leaveType: nextType,
                      halfDaySession: nextType === "Half Day" ? formData.halfDaySession : "",
                      toDate: nextType === "Half Day" ? formData.fromDate : formData.toDate,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white"
                  required
                >
                  {LEAVE_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {normalizeLeaveType(formData.leaveType) === "Half Day" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Half-Day Session</label>
                  <select
                    value={formData.halfDaySession}
                    onChange={(e) => setFormData({ ...formData, halfDaySession: normalizeHalfDaySession(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white"
                    required
                  >
                    <option value="" disabled>Select half-day session</option>
                    {HALF_DAY_SESSION_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Reason for Leave</label>
                <select
                  value={formData.reasonCategory}
                  onChange={(e) => setFormData({ ...formData, reasonCategory: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white"
                  required
                >
                  <option value="" disabled>Select reason</option>
                  {LEAVE_REASON_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {formData.reasonCategory === "Other" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Please specify</label>
                  <textarea
                    value={formData.reasonOther}
                    onChange={(e) => setFormData({ ...formData, reasonOther: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm min-h-[80px] resize-none"
                    placeholder="Describe your reason..."
                    required
                  />
                </div>
              ) : null}
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                  <input 
                    type="date" 
                    value={formData.fromDate}
                    min={todayStr}
                    onChange={(e) => {
                      const fromDate = e.target.value;
                      setFormData({
                        ...formData,
                        fromDate,
                        toDate: normalizeLeaveType(formData.leaveType) === "Half Day" ? fromDate : formData.toDate,
                      });
                    }}
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
                    disabled={normalizeLeaveType(formData.leaveType) === "Half Day"}
                    onChange={e => setFormData({...formData, toDate: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    required
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-medium">Leave Duration:</span>{" "}
                {leaveDurationLabel({
                  type: formData.leaveType,
                  fromDate: formData.fromDate,
                  toDate: normalizeLeaveType(formData.leaveType) === "Half Day" ? formData.fromDate : formData.toDate,
                })}
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={closeLeaveApplyModal}
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
              <div className="flex items-center gap-2">
                {canReview ? (
                  <button
                    type="button"
                    onClick={() => {
                      const dateStr = dayLeavesDate;
                      setIsDayLeavesModalOpen(false);
                      openLeaveApplyModal(dateStr);
                    }}
                    className="rounded-lg bg-[#5d5baf] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4b4991]"
                  >
                    Submit another leave
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsDayLeavesModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                          <span className="font-medium">Leave Type:</span> {leaveTypeDisplay(leave)}
                        </p>
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Date Range:</span> {formatLeaveDuration(leave.fromDate, leave.toDate)}
                        </p>
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Leave Duration:</span> {leaveDurationLabel(leave)}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-2">
                          <span className="font-medium text-slate-600">Reason:</span> {leave.reason ?? "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <StatusBadge status={status} label={status} size="sm" />
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
                  <p className="text-slate-900 font-semibold">{leaveTypeDisplay(selectedLeave)}</p>
                </div>
              ) : null}
              {!isEditingLeave ? (
                <>
                  <div>
                    <p className="text-sm text-slate-500 font-medium mb-1">Date Range</p>
                    <p className="text-slate-900 font-semibold">
                      {formatLeaveDuration(selectedLeave.fromDate, selectedLeave.toDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 font-medium mb-1">Leave Duration</p>
                    <p className="text-slate-900 font-semibold">{leaveDurationLabel(selectedLeave)}</p>
                  </div>
                </>
              ) : null}
              {isOwnRequest && isPendingReview && isEditingLeave ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Leave Type</label>
                    <select
                      value={editFormData.type}
                      onChange={(e) => {
                        const nextType = normalizeLeaveType(e.target.value);
                        setEditFormData({
                          ...editFormData,
                          type: nextType,
                          halfDaySession: nextType === "Half Day" ? editFormData.halfDaySession : "",
                          toDate: nextType === "Half Day" ? editFormData.fromDate : editFormData.toDate,
                        });
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {LEAVE_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  {normalizeLeaveType(editFormData.type) === "Half Day" ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Half-Day Session</label>
                      <select
                        value={editFormData.halfDaySession}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          halfDaySession: normalizeHalfDaySession(e.target.value),
                        })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        required
                      >
                        <option value="" disabled>Select half-day session</option>
                        {HALF_DAY_SESSION_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
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
                        onChange={(e) => {
                          const fromDate = e.target.value;
                          setEditFormData({
                            ...editFormData,
                            fromDate,
                            toDate: normalizeLeaveType(editFormData.type) === "Half Day" ? fromDate : editFormData.toDate,
                          });
                        }}
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
                        disabled={normalizeLeaveType(editFormData.type) === "Half Day"}
                        onChange={(e) => setEditFormData({ ...editFormData, toDate: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium">Leave Duration:</span>{" "}
                    {leaveDurationLabel({
                      type: editFormData.type,
                      fromDate: editFormData.fromDate,
                      toDate: normalizeLeaveType(editFormData.type) === "Half Day" ? editFormData.fromDate : editFormData.toDate,
                    })}
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
