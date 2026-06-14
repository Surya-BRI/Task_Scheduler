"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import StatsBar from "../components/StatsBar";
import { Clock3, FileClock, TimerReset, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import {
  createRegularizationRequest,
  getRegularizationRequest,
  listRegularizationPendingApprovals,
  listRegularizationRequests,
  listRegularizationTaskOptions,
  reviewRegularizationRequest,
} from "@/features/requests/services/regularization-requests.api";
import {
  createOvertimeRequest,
  getOvertimeRequest,
  listAssignedTasksForOvertime,
  listOvertimePendingApprovals,
  listOvertimeRequests,
  reviewOvertimeRequest,
} from "@/features/requests/services/overtime-requests.api";
import { buildDesignSchedulerPath } from "@/features/scheduler/utils/schedulerNavigationState";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

function formatTaskOptionLabel(task) {
  const title = String(task?.title ?? task?.name ?? "").trim();
  const taskNo = String(task?.taskNo ?? "").trim();
  const opNo = String(task?.opNo ?? "").trim();
  if (title && taskNo) return `${title} (${taskNo})`;
  if (title) return title;
  if (taskNo) return taskNo;
  if (opNo) return opNo;
  return "Task";
}

function displayTaskName(req) {
  const name = String(req?.taskName ?? "").trim();
  if (name && name !== "—") return name;
  return "—";
}

const DEFAULT_STATS = {
  workLoad: { tasks: 0, hours: 0 },
  workTill: { label: "-", hours: 0 },
  monthlyTaskCount: 0,
  monthlyHourCount: 0,
  score: 0,
  pendingRegularization: 0,
  xp: 0,
  streak: 0,
};

const EMPTY_OT_FORM = {
  projectId: "",
  taskId: "",
  date: "",
  estimatedRemaining: "2 hours",
  requestedHours: "1 hour",
  reason: "",
};

function toInitials(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function taskHours(task) {
  return Number(
    task?.retailDetails?.hoursRequired ??
      task?.projectDetails?.hoursRequired ??
      task?.estimatedHours ??
      0,
  );
}

function computeStatsFromTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const onHold = tasks.filter((t) => t.status === "ON_HOLD");
  const completed = tasks.filter((t) => t.status === "REVIEW_COMPLETED");
  const active = tasks.filter((t) =>
    ["DESIGN_NEW", "DESIGN_PLANNED", "IN_PROGRESS", "DESIGN_COMPLETED", "HOD_REVIEW", "SALES_REVIEW", "REWORK"].includes(String(t.status ?? ""))
  );

  const workLoadHours = [...active, ...onHold].reduce((acc, t) => acc + taskHours(t), 0);
  const upcomingDeadline = active
    .filter((t) => t.dueDate)
    .map((t) => new Date(t.dueDate))
    .filter((d) => !Number.isNaN(d.getTime()) && d > now)
    .sort((a, b) => a - b)[0] ?? null;

  const thisMonthCompleted = completed.filter((t) => {
    const d = new Date(t.updatedAt ?? t.createdAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const total = tasks.length || 1;
  const score = Math.round((completed.length / total) * 100);

  return {
    workLoad: { tasks: active.length + onHold.length, hours: workLoadHours },
    workTill: upcomingDeadline
      ? {
          label: upcomingDeadline.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
          hours: 0,
        }
      : { label: "-", hours: 0 },
    monthlyTaskCount: thisMonthCompleted.length,
    monthlyHourCount: thisMonthCompleted.reduce((acc, t) => acc + taskHours(t), 0),
    score,
    xp: 0,
    streak: 0,
  };
}

function matchesActiveDesigner(record, activeDesignerId) {
  if (!activeDesignerId) return false;
  const designerId = String(record?.designerId ?? "").trim();
  return designerId === activeDesignerId;
}

export default function RequestsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillApplied = useRef(false);
  const resolvedInboxOvertimeRef = useRef(null);
  const resolvedInboxRegularizationRef = useRef(null);
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

  const [stats, setStats] = useState(DEFAULT_STATS);
  const [isHOD, setIsHOD] = useState(false);
  const [designerList, setDesignerList] = useState([]);
  const [sessionName, setSessionName] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);

  const [sessionErpId, setSessionErpId] = useState(null);

  useEffect(() => {
    import("@/lib/mock-auth").then(({ getSession }) => {
      const session = getSession();
      if (session?.role === "HOD") setIsHOD(true);
      if (session?.name) setSessionName(session.name);
      if (session) setSessionUser(session);
      if (session?.erpDesignerId && isUuidString(session.erpDesignerId)) {
        setSessionErpId(String(session.erpDesignerId).trim());
      } else if (session?.id && isUuidString(session.id)) {
        setSessionErpId(String(session.id).trim());
      }
    });
  }, []);

  useEffect(() => {
    apiClient.get("/users?role=DESIGNER").then((res) => {
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setDesignerList(rows.map((u) => ({
        id: u.id,
        name: u.fullName,
        email: u.email ?? "",
        designation: u.department?.name ?? u.role?.name ?? "Designer",
      })));
    }).catch(() => {});
  }, []);

  const erpDesignerIdRaw = sessionErpId ?? '';
  const erpDesignerId = isUuidString(erpDesignerIdRaw) ? erpDesignerIdRaw : null;
  const forDesignerParam = searchParams.get("forDesignerId")?.trim() ?? "";
  const activeDesignerId = isHOD
    ? (isUuidString(forDesignerParam) ? forDesignerParam : null)
    : erpDesignerId;
  const activeDesignerProfile = designerList.find((d) => d.id === activeDesignerId) ?? null;
  const activeDesignerName =
    activeDesignerProfile?.name ??
    (activeDesignerId === erpDesignerId ? sessionName : null) ??
    "Designer";
  const activeDesignerDesignation = activeDesignerProfile?.designation ?? "Designer";
  const activeDesignerInitials = toInitials(activeDesignerName);

  const handleBackToDashboard = () => {
    if (isHOD) {
      router.push(buildDesignSchedulerPath());
      return;
    }
    router.back();
  };

  const displayName = isHOD ? activeDesignerName : (sessionName ?? activeDesignerName);
  const displayDesignation = isHOD ? activeDesignerDesignation : (sessionUser?.designation ?? sessionUser?.role ?? "Designer");
  const displayInitials = isHOD ? activeDesignerInitials : toInitials(sessionName ?? activeDesignerName);

  const [idleRequests, setIdleRequests] = useState([]);
  const [hodPendingRequests, setHodPendingRequests] = useState([]);
  const [hodInboxLoading, setHodInboxLoading] = useState(false);
  const [hodInboxError, setHodInboxError] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [highlightedRequestId, setHighlightedRequestId] = useState(null);
  const [highlightedOvertimeId, setHighlightedOvertimeId] = useState(null);
  const [regularizationError, setRegularizationError] = useState(null);
  const [regularizationLoading, setRegularizationLoading] = useState(false);
  const [regTaskOptions, setRegTaskOptions] = useState([]);
  const [regTasksLoading, setRegTasksLoading] = useState(false);

  const [previousOtRequests, setPreviousOtRequests] = useState([]);
  const [hodOvertimePending, setHodOvertimePending] = useState([]);
  const [hodOvertimeLoading, setHodOvertimeLoading] = useState(false);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [assignedTasksLoading, setAssignedTasksLoading] = useState(false);
  const [assignedTasksError, setAssignedTasksError] = useState(null);
  const [otSubmitting, setOtSubmitting] = useState(false);
  const [otReviewTarget, setOtReviewTarget] = useState(null);
  const [otReviewRemarks, setOtReviewRemarks] = useState("");
  const [otReviewSubmitting, setOtReviewSubmitting] = useState(false);
  const [overtimeError, setOvertimeError] = useState(null);
  const [overtimeLoading, setOvertimeLoading] = useState(false);

  const setActiveDesigner = (designerId, { preserveInboxParams = false } = {}) => {
    if (!preserveInboxParams) {
      setReviewTarget(null);
      setOtReviewTarget(null);
      setHighlightedRequestId(null);
      setHighlightedOvertimeId(null);
      resolvedInboxOvertimeRef.current = null;
      resolvedInboxRegularizationRef.current = null;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (!preserveInboxParams) {
      params.delete("overtimeId");
      params.delete("regularizationId");
    }
    if (isUuidString(designerId)) {
      params.set("forDesignerId", designerId);
    } else {
      params.delete("forDesignerId");
    }
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const path = `/designer/requests?${params.toString()}${hash}`;
    if (preserveInboxParams) {
      router.replace(path);
    } else {
      router.push(path);
    }
  };

  const handleDesignerChange = (designerId) => {
    setActiveDesigner(designerId, { preserveInboxParams: false });
  };

  const loadRegularization = async () => {
    if (activeDesignerId == null) {
      setIdleRequests([]);
      setRegularizationError(
        isHOD
          ? "Select a designer profile to view or submit regularization requests."
          : "Your designer account is not linked to ERP. Sign in again or contact an administrator.",
      );
      return;
    }
    setRegularizationLoading(true);
    setRegularizationError(null);
    try {
      const rows = await listRegularizationRequests(activeDesignerId);
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

  const loadHodInbox = async () => {
    if (!isHOD) {
      setHodPendingRequests([]);
      return;
    }
    setHodInboxLoading(true);
    setHodInboxError(null);
    try {
      const rows = await listRegularizationPendingApprovals();
      setHodPendingRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setHodPendingRequests([]);
      setHodInboxError(e?.message || "Could not load HOD inbox.");
    } finally {
      setHodInboxLoading(false);
    }
  };

  const loadOvertime = async () => {
    if (isHOD && activeDesignerId == null) {
      setPreviousOtRequests([]);
      setOvertimeLoading(false);
      return;
    }
    setOvertimeLoading(true);
    setOvertimeError(null);
    try {
      const rows = activeDesignerId
        ? await listOvertimeRequests(activeDesignerId)
        : await listOvertimeRequests();
      setPreviousOtRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setPreviousOtRequests([]);
      setOvertimeError(e?.message || "Could not load overtime requests.");
    } finally {
      setOvertimeLoading(false);
    }
  };

  const loadHodOvertimeInbox = async () => {
    if (!isHOD) {
      setHodOvertimePending([]);
      return;
    }
    setHodOvertimeLoading(true);
    try {
      const rows = await listOvertimePendingApprovals();
      setHodOvertimePending(Array.isArray(rows) ? rows : []);
    } catch {
      setHodOvertimePending([]);
    } finally {
      setHodOvertimeLoading(false);
    }
  };

  const loadAssignedTasks = async (designerId = activeDesignerId) => {
    if (!isUuidString(String(designerId ?? "").trim())) {
      setAssignedTasks([]);
      return;
    }
    setAssignedTasksLoading(true);
    setAssignedTasksError(null);
    try {
      const res = await listAssignedTasksForOvertime(designerId);
      const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      const normalized = rows
        .map((t) => ({
          id: String(t.id),
          projectId: String(t.projectId ?? t.project?.id ?? "").trim(),
          projectName:
            String(t.project?.name ?? t.project?.projectNo ?? "").trim() || "Unnamed project",
          label: formatTaskOptionLabel(t),
        }))
        .filter((t) => isUuidString(t.id));
      setAssignedTasks(normalized);

      const projectsMap = new Map();
      for (const task of normalized) {
        if (task.projectId && isUuidString(task.projectId)) {
          projectsMap.set(task.projectId, task.projectName);
        }
      }
      setProjects(
        [...projectsMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      );

      if (normalized.length >= 1) {
        const first = normalized[0];
        setOtForm((f) => ({
          ...EMPTY_OT_FORM,
          projectId: first.projectId,
          taskId: first.id,
        }));
      } else {
        setOtForm(EMPTY_OT_FORM);
      }
    } catch (e) {
      setAssignedTasks([]);
      setAssignedTasksError(e?.message || "Could not load your assigned tasks.");
    } finally {
      setAssignedTasksLoading(false);
    }
  };

  const loadRegTaskOptions = async () => {
    if (activeDesignerId == null) {
      setRegTaskOptions([]);
      return;
    }
    setRegTasksLoading(true);
    try {
      let rows = await listRegularizationTaskOptions(activeDesignerId);
      let list = Array.isArray(rows) ? rows : [];
      if (list.length === 0) {
        const tasksRes = await apiClient.get(`/tasks?limit=200&assigneeId=${encodeURIComponent(activeDesignerId)}`);
        const taskRows = Array.isArray(tasksRes)
          ? tasksRes
          : Array.isArray(tasksRes?.data)
            ? tasksRes.data
            : [];
        list = taskRows.map((t) => ({
          id: t.id,
          name: formatTaskOptionLabel(t),
        }));
      }
      setRegTaskOptions(
        list.map((t) => ({
          id: t.id,
          label: String(t.name ?? "").trim() || formatTaskOptionLabel(t),
        })),
      );
    } catch {
      setRegTaskOptions([]);
    } finally {
      setRegTasksLoading(false);
    }
  };

  const loadDesignerStats = async (designerId = activeDesignerId) => {
    if (!isUuidString(String(designerId ?? "").trim())) {
      setStats(DEFAULT_STATS);
      return;
    }
    try {
      const tasksRes = await apiClient.get(`/tasks?limit=200&assigneeId=${encodeURIComponent(designerId)}`);
      const taskRows = Array.isArray(tasksRes)
        ? tasksRes
        : Array.isArray(tasksRes?.data)
          ? tasksRes.data
          : [];
      const computed = computeStatsFromTasks(taskRows);
      if (!computed) {
        setStats((prev) => ({
          ...prev,
          workLoad: DEFAULT_STATS.workLoad,
          workTill: DEFAULT_STATS.workTill,
          monthlyTaskCount: DEFAULT_STATS.monthlyTaskCount,
          monthlyHourCount: DEFAULT_STATS.monthlyHourCount,
          score: DEFAULT_STATS.score,
        }));
        return;
      }
      setStats((prev) => ({
        ...prev,
        ...computed,
      }));
    } catch {
      setStats((prev) => ({
        ...prev,
        workLoad: DEFAULT_STATS.workLoad,
        workTill: DEFAULT_STATS.workTill,
        monthlyTaskCount: DEFAULT_STATS.monthlyTaskCount,
        monthlyHourCount: DEFAULT_STATS.monthlyHourCount,
        score: DEFAULT_STATS.score,
      }));
    }
  };

  useEffect(() => {
    prefillApplied.current = false;
    setOtForm(EMPTY_OT_FORM);
    setProjects([]);
    setProjectTasks([]);
    setAssignedTasks([]);
    setRegTaskOptions([]);
    setIdleRequests([]);
    setPreviousOtRequests([]);
    setStats(DEFAULT_STATS);
  }, [activeDesignerId]);

  useEffect(() => {
    if (activeDesignerId == null) {
      if (isHOD) {
        setRegularizationError("Select a designer profile to view or submit regularization requests.");
      }
      return;
    }
    void loadRegularization();
    void loadOvertime();
    void loadRegTaskOptions();
    void loadAssignedTasks(activeDesignerId);
    void loadDesignerStats(activeDesignerId);
    if (isHOD) {
      void loadHodInbox();
      void loadHodOvertimeInbox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when active designer changes
  }, [activeDesignerId, isHOD]);

  useEffect(() => {
    if (!isHOD) return;
    void loadHodInbox();
    void loadHodOvertimeInbox();
    const interval = setInterval(() => {
      void loadHodInbox();
      void loadHodOvertimeInbox();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHOD]);

  useEffect(() => {
    if (!isHOD || isUuidString(forDesignerParam) || designerList.length === 0) return;
    const overtimeId = searchParams.get("overtimeId")?.trim() ?? "";
    const regularizationId = searchParams.get("regularizationId")?.trim() ?? "";
    if (isUuidString(overtimeId) || isUuidString(regularizationId)) return;
    handleDesignerChange(designerList[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHOD, designerList.length, forDesignerParam]);

  useEffect(() => {
    const targetId = searchParams.get("regularizationId")?.trim();
    if (!targetId || !isUuidString(targetId)) {
      if (!searchParams.get("regularizationId")) {
        resolvedInboxRegularizationRef.current = null;
      }
      return;
    }

    setHighlightedRequestId(targetId);
    const hash = window.location.hash;
    if (hash === "#regularization" || hash === "") {
      document.getElementById("regularization")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (!isHOD) return;
    if (resolvedInboxRegularizationRef.current === targetId && isUuidString(forDesignerParam)) return;

    void (async () => {
      try {
        const request = await getRegularizationRequest(targetId);
        const requestDesignerId = String(request?.designerId ?? "").trim();
        if (isUuidString(requestDesignerId)) {
          if (requestDesignerId !== forDesignerParam) {
            setActiveDesigner(requestDesignerId, { preserveInboxParams: true });
          }
          resolvedInboxRegularizationRef.current = targetId;
        }
      } catch {
        // ignore — user can still pick a designer manually
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isHOD, forDesignerParam]);

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

  const handleIdleTaskSelect = (id, taskId) => {
    const selected = regTaskOptions.find((t) => t.id === taskId);
    setIdleRequests((prev) =>
      prev.map((req) =>
        req.id === id
          ? { ...req, taskId, taskName: selected?.label ?? "" }
          : req,
      ),
    );
  };

  const handleSubmitIdleRow = async (id) => {
    const req = idleRequests.find((r) => r.id === id);
    if (!req || activeDesignerId == null) return;
    if (!req.date || !req.reason || (req.reason === "Other" && !String(req.notes ?? "").trim())) {
      toast.warning("Please fill in the Date and Reason (Required).");
      return;
    }
    const taskId = String(req.taskId ?? "").trim();
    if (!isUuidString(taskId)) {
      toast.warning("Please select a task.");
      return;
    }
    try {
      await createRegularizationRequest({
        designerId: activeDesignerId,
        taskId,
        date: req.date,
        duration: req.duration,
        reason: req.reason,
        notes: req.notes?.trim() || undefined,
        status: "Pending",
      });
      await loadRegularization();
      toast.success("Regularization request submitted!");
    } catch (e) {
      toast.error(e?.message || "Submit failed");
    }
  };

  const openReviewModal = (request, action) => {
    setReviewTarget({ ...request, _reviewAction: action });
    setReviewRemarks("");
  };

  const submitReview = async () => {
    if (!reviewTarget?.id || !reviewTarget._reviewAction) return;
    if (reviewTarget._reviewAction === "Rejected" && !reviewRemarks.trim()) {
      toast.warning("Rejection remarks are required.");
      return;
    }
    setReviewSubmitting(true);
    try {
      await reviewRegularizationRequest(reviewTarget.id, {
        status: reviewTarget._reviewAction,
        remarks: reviewRemarks.trim() || undefined,
      });
      setReviewTarget(null);
      setReviewRemarks("");
      await Promise.all([loadRegularization(), loadHodInbox()]);
      toast.success(`Regularization request ${reviewTarget._reviewAction.toLowerCase()}.`);
    } catch (e) {
      toast.error(e?.message || "Review failed");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleApproveIdle = async (id) => {
    const request =
      hodPendingRequests.find((r) => r.id === id) ?? idleRequests.find((r) => r.id === id);
    if (!request) return;
    openReviewModal(request, "Approved");
  };

  const handleRejectIdle = async (id) => {
    const request =
      hodPendingRequests.find((r) => r.id === id) ?? idleRequests.find((r) => r.id === id);
    if (!request) return;
    openReviewModal(request, "Rejected");
  };

  const handleRequestAllRegularization = async () => {
    const drafts = idleRequests.filter((r) => r.status === "unsubmitted" && r.localDraft);
    if (drafts.length === 0) {
      toast.success("No draft regularization rows to submit. Use Add row first.");
      return;
    }
    if (drafts.some((r) => !r.date || !r.reason || (r.reason === "Other" && !String(r.notes ?? "").trim()))) {
      toast.warning("Please fill in Date and Reason for all draft rows.");
      return;
    }
    if (drafts.some((r) => !isUuidString(String(r.taskId ?? "").trim()))) {
      toast.warning("Please select a task for every draft row.");
      return;
    }
    if (activeDesignerId == null) return;
    try {
      for (const r of drafts) {
        const taskId = String(r.taskId).trim();
        await createRegularizationRequest({
          designerId: activeDesignerId,
          taskId,
          date: r.date,
          duration: r.duration,
          reason: r.reason,
          notes: r.notes?.trim() || undefined,
          status: "Pending",
        });
      }
      await loadRegularization();
      toast.success("All regularization requests submitted!");
    } catch (e) {
      toast.warning(e?.message || "Bulk submit failed");
    }
  };

  const [projects, setProjects] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);

  // --- Overtime Request State ---
  const [otForm, setOtForm] = useState(EMPTY_OT_FORM);

  useEffect(() => {
    const projectId = String(otForm.projectId ?? "").trim();
    if (!projectId) {
      setProjectTasks([]);
      return;
    }
    setProjectTasks(
      assignedTasks
        .filter((task) => task.projectId === projectId)
        .map((task) => ({ id: task.id, label: task.label })),
    );
  }, [otForm.projectId, assignedTasks]);

  useEffect(() => {
    const overtimeId = searchParams.get("overtimeId")?.trim();
    if (!overtimeId || !isUuidString(overtimeId)) {
      if (!searchParams.get("overtimeId")) {
        resolvedInboxOvertimeRef.current = null;
      }
      return;
    }

    setHighlightedOvertimeId(overtimeId);
    document.getElementById("overtime")?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!isHOD) return;
    if (resolvedInboxOvertimeRef.current === overtimeId && isUuidString(forDesignerParam)) return;

    void (async () => {
      try {
        const pending = hodOvertimePending.find((r) => r.id === overtimeId);
        let requestDesignerId = String(pending?.designerId ?? "").trim();
        if (!isUuidString(requestDesignerId)) {
          const request = await getOvertimeRequest(overtimeId);
          requestDesignerId = String(request?.designerId ?? request?.designer?.id ?? "").trim();
        }
        if (isUuidString(requestDesignerId)) {
          if (requestDesignerId !== forDesignerParam) {
            setActiveDesigner(requestDesignerId, { preserveInboxParams: true });
          }
          resolvedInboxOvertimeRef.current = overtimeId;
        }
      } catch {
        // ignore — user can still pick a designer manually
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isHOD, forDesignerParam, hodOvertimePending]);

  // Pre-fill OT form when navigated from SchedulerGrid OT button
  useEffect(() => {
    if (prefillApplied.current || !activeDesignerId) return;
    const taskId = searchParams?.get("taskId") || "";
    const projectId = searchParams?.get("projectId") || "";
    const date = searchParams?.get("date") || "";
    const estimated = searchParams?.get("estimated") || "";
    if (taskId || projectId) {
      prefillApplied.current = true;
      setOtForm((f) => ({
        ...f,
        projectId: projectId || f.projectId,
        taskId: taskId || f.taskId,
        date: date || f.date,
        estimatedRemaining: estimated ? `${estimated} hours` : f.estimatedRemaining,
      }));
      setTimeout(() => {
        document.getElementById("overtime")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  }, [searchParams, activeDesignerId]);

  const selectedOtProject = projects.find((p) => p.id === otForm.projectId);
  const selectedOtTask = assignedTasks.find((t) => t.id === otForm.taskId);

  const handleOtSubmit = async (e) => {
    e.preventDefault();
    if (otSubmitting) return;
    if (isHOD && !activeDesignerId) {
      toast.warning("Select a designer profile before submitting overtime.");
      return;
    }
    if (!isUuidString(String(otForm.taskId ?? "").trim())) {
      toast.warning("Please select a task from your assigned work.");
      return;
    }
    if (!otForm.reason?.trim()) {
      toast.warning("Please select a reason for overtime.");
      return;
    }
    const m = /^(\d+)/.exec(otForm.requestedHours);
    if (m && Number(m[1]) > 4) {
      toast.warning("Cannot exceed 4 hours allowed limit.");
      return;
    }
    if (!otForm.date) {
      toast.warning("Please select a date.");
      return;
    }
    setOtSubmitting(true);
    setOvertimeError(null);
    try {
      const payload = {
        taskId: String(otForm.taskId).trim(),
        date: otForm.date,
        estimatedRemaining: otForm.estimatedRemaining,
        requestedHours: otForm.requestedHours,
        reason: otForm.reason,
        status: "Pending",
      };
      if (isHOD) {
        payload.designerId = activeDesignerId;
      }
      await createOvertimeRequest(payload);
      await Promise.all([loadOvertime(), isHOD ? loadHodOvertimeInbox() : Promise.resolve()]);
      toast.success("Overtime request submitted successfully!");
      setOtForm((f) => ({ ...f, date: "", reason: "" }));
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Submit failed. Check that the backend is running and the task is still assigned to you.";
      setOvertimeError(message);
      toast.error(message);
    } finally {
      setOtSubmitting(false);
    }
  };

  const openOtReviewModal = (request, action) => {
    setOtReviewTarget({ ...request, _reviewAction: action });
    setOtReviewRemarks("");
  };

  const submitOtReview = async () => {
    if (!otReviewTarget?.id || !otReviewTarget._reviewAction) return;
    if (otReviewTarget._reviewAction === "REJECTED_BY_MANAGER" && !otReviewRemarks.trim()) {
      toast.warning("Rejection remarks are required.");
      return;
    }
    setOtReviewSubmitting(true);
    try {
      await reviewOvertimeRequest(otReviewTarget.id, {
        status: otReviewTarget._reviewAction,
        comments: otReviewRemarks.trim() || (otReviewTarget._reviewAction === "APPROVED_BY_MANAGER" ? "Approved" : undefined),
        approvedHours: otReviewTarget.requested,
      });
      setOtReviewTarget(null);
      setOtReviewRemarks("");
      await Promise.all([loadOvertime(), loadHodOvertimeInbox()]);
      toast.success(
        otReviewTarget._reviewAction === "APPROVED_BY_MANAGER"
          ? "Overtime request approved!"
          : "Overtime request rejected.",
      );
    } catch (e) {
      toast.error(e?.message || "Review failed");
    } finally {
      setOtReviewSubmitting(false);
    }
  };

  const handleApproveOt = async (id) => {
    const request =
      hodOvertimePending.find((r) => r.id === id) ?? previousOtRequests.find((r) => r.id === id);
    if (!request) return;
    openOtReviewModal(request, "APPROVED_BY_MANAGER");
  };

  const handleRejectOt = async (id) => {
    const request =
      hodOvertimePending.find((r) => r.id === id) ?? previousOtRequests.find((r) => r.id === id);
    if (!request) return;
    openOtReviewModal(request, "REJECTED_BY_MANAGER");
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

  const unifiedRegularizationRows = useMemo(() => {
    const map = new Map();
    if (isHOD) {
      for (const req of hodPendingRequests) {
        if (activeDesignerId && !matchesActiveDesigner(req, activeDesignerId)) continue;
        map.set(req.id, {
          ...req,
          _requester: req.designerName || "Designer",
          _needsAction: true,
          _source: "team-pending",
        });
      }
    }
    if (activeDesignerId) {
      for (const req of idleRequests) {
        if (!map.has(req.id)) {
          map.set(req.id, {
            ...req,
            _requester: req.designerName || activeDesignerName,
            _needsAction: isHOD && req.status === "Pending",
            _source: req.localDraft ? "draft" : "profile",
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a._needsAction !== b._needsAction) return a._needsAction ? -1 : 1;
      const ad = a.date || a.createdAt || "";
      const bd = b.date || b.createdAt || "";
      return String(bd).localeCompare(String(ad));
    });
  }, [hodPendingRequests, idleRequests, isHOD, activeDesignerId, activeDesignerName]);

  const unifiedOvertimeRows = useMemo(() => {
    const map = new Map();
    if (isHOD) {
      for (const req of hodOvertimePending) {
        if (activeDesignerId && !matchesActiveDesigner(req, activeDesignerId)) continue;
        map.set(req.id, {
          ...req,
          _requester: req.designerName || "Designer",
          _needsAction: true,
          _source: "team-pending",
        });
      }
    }
    if (activeDesignerId) {
      for (const req of previousOtRequests) {
        if (!map.has(req.id)) {
          map.set(req.id, {
            ...req,
            _requester: req.designerName || activeDesignerName,
            _needsAction:
              isHOD &&
              (req.status === "Pending Approval" || req.status === "Pending"),
            _source: "profile",
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a._needsAction !== b._needsAction) return a._needsAction ? -1 : 1;
      return String(b.date ?? "").localeCompare(String(a.date ?? ""));
    });
  }, [hodOvertimePending, previousOtRequests, isHOD, activeDesignerId, activeDesignerName]);

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 cursor-pointer";

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans bg-slate-50">
      <Navbar />

      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-auto items-center gap-3 border-r border-slate-200 pr-6">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            <span>{displayInitials}</span>
          </div>
          {isHOD ? (
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-slate-500 mb-1">Creating Request For:</span>
              <select
                className="text-sm font-semibold bg-slate-100 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-[#5d5baf]/20 cursor-pointer max-w-[220px]"
                value={activeDesignerId ?? ""}
                onChange={(e) => handleDesignerChange(e.target.value)}
              >
                {designerList.length === 0 ? (
                  <option value="">{activeDesignerName}</option>
                ) : (
                  <>
                    <option value="" disabled>Select designer</option>
                    {designerList.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </>
                )}
              </select>
              {activeDesignerId ? (
                <span className="mt-1 text-[10px] leading-tight text-slate-500">{activeDesignerDesignation}</span>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-slate-900">{displayName}</span>
              <span className="text-[10px] leading-tight text-slate-500">{displayDesignation}</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex px-6 items-center">
          <span className="font-bold text-slate-900">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
          </span>
        </div>
      </div>
      
      <StatsBar stats={stats} isHOD={isHOD} />

      <div className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="w-full space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Regularization & Overtime</h1>
              <p className="mt-1 text-sm text-slate-500">Submit and track your regularization and overtime requests.</p>
            </div>
            <button
              type="button"
              onClick={handleBackToDashboard}
              className="ui-chip-button inline-flex items-center gap-2"
            >
              Back to Dashboard
            </button>
          </div>

          <section id="regularization" className="ui-surface scroll-mt-24">
            <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
              <div>
                <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                  <TimerReset className="h-4 w-4 text-slate-500" />
                  Regularization Requests
                </h2>
                {isHOD ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Unified list — pending approvals and requests for {activeDesignerName}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addIdleDraftRow}
                  disabled={activeDesignerId == null}
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
            {hodInboxError ? (
              <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-5">{hodInboxError}</div>
            ) : null}
            {isHOD && hodPendingRequests.length > 0 && !activeDesignerId ? (
              <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:px-5">
                {hodPendingRequests.length} pending regularization request{hodPendingRequests.length === 1 ? "" : "s"} awaiting your review. Select a designer to view full context, or approve directly from the pending rows below.
              </div>
            ) : null}
            {regularizationLoading ? (
              <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500 sm:px-5">Loading regularization…</div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-0 text-sm text-left">
                <thead className="ui-table-header">
                  <tr>
                    {isHOD ? <th className="px-4 py-3">Requester</th> : null}
                    <th className="px-4 py-3">Completed Task</th>
                    <th className="px-4 py-3 text-center">Date</th>
                    <th className="px-4 py-3 text-center">Idle Duration</th>
                    <th className="px-4 py-3">Reason (Required)</th>
                    <th className="px-4 py-3">Optional Notes</th>
                    <th className="px-4 py-3 text-center">Status / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {unifiedRegularizationRows.length === 0 && !regularizationLoading ? (
                    <tr>
                      <td colSpan={isHOD ? 7 : 6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No regularization requests yet. Use Add row to create a draft, or load data from ERP when rows exist for this designer.
                      </td>
                    </tr>
                  ) : null}
                  {unifiedRegularizationRows.map((req) => {
                    if (req._source === "team-pending") {
                      return (
                        <tr
                          key={req.id}
                          className={`transition-colors hover:bg-slate-50${highlightedRequestId === req.id ? " bg-blue-50 ring-1 ring-inset ring-blue-200" : ""}`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <p>{req._requester}</p>
                            {req.departmentName && req.departmentName !== "—" ? (
                              <p className="text-xs font-normal text-slate-500">{req.departmentName}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{displayTaskName(req)}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{req.date ? formatDate(req.date) : "—"}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{req.duration || "—"}</td>
                          <td className="px-4 py-3 text-slate-700">{req.reason || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{req.notes || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-2">
                              {getStatusBadge(req.status)}
                              <div className="flex justify-center gap-2">
                                <button type="button" onClick={() => openReviewModal(req, "Approved")} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">Approve</button>
                                <button type="button" onClick={() => openReviewModal(req, "Rejected")} className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">Reject</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                    <tr
                      key={req.id}
                      className={`transition-colors hover:bg-slate-50${highlightedRequestId === req.id ? " bg-blue-50 ring-1 ring-inset ring-blue-200" : ""}`}
                    >
                      {isHOD ? (
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold text-slate-600">{req._requester}</span>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {req.status === "unsubmitted" ? (
                          <div className="flex max-w-[260px] flex-col gap-1">
                            <label className="text-[10px] font-semibold uppercase text-slate-500">Task Name</label>
                            <select
                              value={req.taskId === "" || req.taskId == null ? "" : req.taskId}
                              onChange={(e) => handleIdleTaskSelect(req.id, e.target.value)}
                              className={inputClass}
                              disabled={regTasksLoading}
                            >
                              <option value="" disabled>
                                {regTasksLoading
                                  ? "Loading tasks…"
                                  : regTaskOptions.length === 0
                                    ? "No tasks assigned"
                                    : "Select a task"}
                              </option>
                              {regTaskOptions.map((task) => (
                                <option key={task.id} value={task.id}>
                                  {task.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          displayTaskName(req)
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
                        ) : isHOD && req._needsAction && req.status === "Pending" ? (
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
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section id="overtime" className="ui-surface scroll-mt-24">
            <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
              <div>
                <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Clock3 className="h-4 w-4 text-slate-500" />
                  Overtime Requests
                </h2>
                {isHOD ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Submit for {activeDesignerName} · unified history and pending approvals below
                  </p>
                ) : null}
              </div>
            </div>
            {overtimeError ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">{overtimeError}</div>
            ) : null}
            {assignedTasksError ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">{assignedTasksError}</div>
            ) : null}
            {overtimeLoading || assignedTasksLoading ? (
              <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500 sm:px-5">Loading overtime…</div>
            ) : null}

            <form onSubmit={(e) => void handleOtSubmit(e)} className="space-y-5 p-4 sm:p-5">
                {isHOD && !activeDesignerId ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Select a designer profile above to submit overtime on their behalf.
                  </div>
                ) : null}
                {!isHOD && assignedTasks.length === 0 && !assignedTasksLoading ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    No tasks are currently assigned to you. Overtime can only be requested against assigned tasks.
                  </div>
                ) : null}
                {selectedOtProject && selectedOtTask ? (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
                    <p><span className="font-semibold text-slate-900">Project:</span> {selectedOtProject.name}</p>
                    <p className="mt-1"><span className="font-semibold text-slate-900">Task:</span> {selectedOtTask.label}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Project</label>
                    <select
                      value={otForm.projectId}
                      onChange={(e) =>
                        setOtForm({ ...otForm, projectId: e.target.value, taskId: "" })
                      }
                      className={inputClass}
                      required
                      disabled={assignedTasksLoading || assignedTasks.length === 0}
                    >
                      <option value="" disabled>
                        {assignedTasksLoading
                          ? "Loading assigned tasks…"
                          : projects.length === 0
                            ? "No assigned projects"
                            : "Select a project"}
                      </option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Task</label>
                    <select
                      value={otForm.taskId}
                      onChange={(e) => setOtForm({ ...otForm, taskId: e.target.value })}
                      className={inputClass}
                      required
                      disabled={!otForm.projectId || assignedTasksLoading}
                    >
                      <option value="" disabled>
                        {!otForm.projectId
                          ? "Select a project first"
                          : projectTasks.length === 0
                            ? "No assigned tasks for this project"
                            : "Select a task"}
                      </option>
                      {projectTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.label}
                        </option>
                      ))}
                    </select>
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
                    <select value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })} className={inputClass} required>
                      <option value="" disabled>Select a reason</option>
                      <option>Unexpected scope change for animations</option>
                      <option>Client requested urgent revisions</option>
                      <option>Technical delays</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={otSubmitting || assignedTasks.length === 0}
                    className="rounded-lg bg-[#5d5baf] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4b4991] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {otSubmitting ? "Submitting…" : "Submit Overtime Request"}
                  </button>
                </div>
              </form>

            <div className="border-t border-slate-200">
              <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
                <FileClock className="h-4 w-4 text-slate-500" />
                <h3 className="text-base font-semibold text-slate-900">All Overtime Requests</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 text-sm text-left">
                  <thead className="ui-table-header">
                    <tr>
                      {isHOD ? <th className="px-4 py-3">Requester</th> : null}
                      <th className="px-4 py-3">Request Date</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Task</th>
                      <th className="px-4 py-3">Requested Hours</th>
                      <th className="px-4 py-3">Approved Hours</th>
                      <th className="px-4 py-3 text-center">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {unifiedOvertimeRows.length === 0 && !overtimeLoading ? (
                      <tr>
                        <td colSpan={isHOD ? 7 : 6} className="px-4 py-8 text-center text-sm text-slate-500">
                          No overtime requests yet. Submit above or check pending approvals from your team.
                        </td>
                      </tr>
                    ) : null}
                    {unifiedOvertimeRows.map((req) => (
                      <tr
                        key={req.id}
                        className={`transition-colors hover:bg-slate-50${
                          highlightedOvertimeId === req.id ? " bg-blue-50 ring-1 ring-inset ring-blue-200" : ""
                        }${req._needsAction && highlightedOvertimeId !== req.id ? " bg-orange-50/40" : ""}`}
                      >
                        {isHOD ? (
                          <td className="px-4 py-3 font-medium text-slate-800">{req._requester}</td>
                        ) : null}
                        <td className="px-4 py-3 font-medium text-slate-500">{formatDate(req.date)}</td>
                        <td className="px-4 py-3 text-slate-700">{req.projectName || "—"}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{req.taskTitle || req.taskName || "—"}</td>
                        <td className="px-4 py-3 text-slate-700">{req.requested}</td>
                        <td className="px-4 py-3 text-slate-700">{req.approved}</td>
                        <td className="px-4 py-3 text-center">
                          {req._needsAction && (req.status === "Pending Approval" || req.status === "Pending") ? (
                            <div className="flex flex-col items-center gap-2">
                              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${getStatusColorTable(req.status)}`}>{req.status}</span>
                              <div className="flex justify-center gap-2">
                                <button type="button" onClick={() => void handleApproveOt(req.id)} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">Approve</button>
                                <button type="button" onClick={() => void handleRejectOt(req.id)} className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">Reject</button>
                              </div>
                            </div>
                          ) : (
                            <span className={`inline-block w-28 rounded-full px-3 py-1.5 text-xs font-semibold text-center tracking-wide shadow-sm ${getStatusColorTable(req.status)}`}>{req.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>

      {reviewTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => !reviewSubmitting && setReviewTarget(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {reviewTarget._reviewAction === "Approved" ? "Approve" : "Reject"} Regularization
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {reviewTarget.designerName} · {reviewTarget.date} · {reviewTarget.reason}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                disabled={reviewSubmitting}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {reviewTarget._reviewAction === "Rejected" ? "Rejection remarks (required)" : "Approval remarks (optional)"}
            </label>
            <textarea
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              placeholder={reviewTarget._reviewAction === "Rejected" ? "Provide reason for rejection…" : "Optional approval note…"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                disabled={reviewSubmitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReview()}
                disabled={reviewSubmitting}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  reviewTarget._reviewAction === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-60`}
              >
                {reviewSubmitting ? "Saving…" : reviewTarget._reviewAction === "Approved" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {otReviewTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => !otReviewSubmitting && setOtReviewTarget(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {otReviewTarget._reviewAction === "APPROVED_BY_MANAGER" ? "Approve" : "Reject"} Overtime
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {(otReviewTarget.designerName || "Employee")} · {otReviewTarget.projectName} · {otReviewTarget.taskTitle || otReviewTarget.taskName} · {otReviewTarget.requested}
                </p>
              </div>
              <button type="button" onClick={() => setOtReviewTarget(null)} disabled={otReviewSubmitting} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {otReviewTarget._reviewAction === "REJECTED_BY_MANAGER" ? "Rejection remarks (required)" : "Approval remarks (optional)"}
            </label>
            <textarea
              value={otReviewRemarks}
              onChange={(e) => setOtReviewRemarks(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              placeholder={otReviewTarget._reviewAction === "REJECTED_BY_MANAGER" ? "Provide reason for rejection…" : "Optional approval note…"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOtReviewTarget(null)} disabled={otReviewSubmitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button
                type="button"
                onClick={() => void submitOtReview()}
                disabled={otReviewSubmitting}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  otReviewTarget._reviewAction === "APPROVED_BY_MANAGER" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-60`}
              >
                {otReviewSubmitting ? "Saving…" : otReviewTarget._reviewAction === "APPROVED_BY_MANAGER" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
