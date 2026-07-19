"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import StatsBar from "./components/StatsBar";
import SchedulerGrid from "./components/SchedulerGrid";
import DonutChart from "./components/DonutChart";
import OnHoldTable from "./components/OnHoldTable";
import WeeksSection from "./components/WeeksSection";
import {
  SCHEDULER_DASHBOARD_SYNC_EVENT,
  SCHEDULER_DASHBOARD_SYNC_KEY,
  buildDesignerSnapshot,
} from "@/features/scheduler/utils/designerDashboardSync";
import { resolveAssignmentScheduledHours } from "@/features/scheduler/utils/scheduler-workload.util";
import { computeDesignerTaskStats } from "@/features/scheduler/utils/designer-task-stats.util";
import { getSystemBlockColorClass } from "@/features/scheduler/utils/scheduler-system-block.ui";
import {
  DEFAULT_SCHEDULER_REFERENCE_DATE,
  formatSchedulerDateRangeText,
  getWeekDays,
} from "@/features/scheduler/utils/schedulerWeek";
import { listSchedulerAssignmentsForWeek, getSchedulerWeekMeta } from "@/features/scheduler/services/scheduler-assignments.api";
import { apiClient } from "@/lib/api-client";
import { FROM_DESIGN_LIST, FROM_DESIGNER_QUEUE, taskViewPathForRecord } from "@/lib/design-list-routes";
import { getSession } from "@/lib/mock-auth";
import { connectDashboardRealtime } from "@/lib/realtime";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatWorkTillLabel(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString("en-US", { weekday: "long" })} ${getOrdinal(d.getDate())}`;
}

async function fetchAllDesignerTasks(erpId) {
  const limit = 200;
  const firstPage = await apiClient.get(`/tasks?assigneeId=${erpId}&page=1&limit=${limit}`);
  const firstRows = Array.isArray(firstPage?.data) ? firstPage.data : [];
  const totalPages = Number(firstPage?.totalPages ?? 1);
  if (totalPages <= 1) return firstRows;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, idx) =>
      apiClient.get(`/tasks?assigneeId=${erpId}&page=${idx + 2}&limit=${limit}`).catch(() => null)
    )
  );

  return rest.reduce((acc, page) => {
    if (Array.isArray(page?.data)) acc.push(...page.data);
    return acc;
  }, firstRows);
}

const DASH_COLORS = [
  "bg-blue-100 border border-blue-300 text-blue-800",
  "bg-emerald-100 border border-emerald-300 text-emerald-800",
  "bg-violet-100 border border-violet-300 text-violet-800",
  "bg-amber-100 border border-amber-300 text-amber-800",
  "bg-rose-100 border border-rose-300 text-rose-800",
  "bg-teal-100 border border-teal-300 text-teal-800",
  "bg-orange-100 border border-orange-300 text-orange-800",
];

const toPositiveHours = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function isRequestRow(row) {
  return row?.requestType === "LEAVE" || row?.requestType === "REGULARIZATION";
}

function getRequestRowHours(row) {
  if (row?.requestType === "LEAVE") return toPositiveHours(row.leaveHours ?? row.scheduledHours ?? row.assignedHours);
  if (row?.requestType === "REGULARIZATION") {
    return toPositiveHours(row.regularizationHours ?? row.scheduledHours ?? row.assignedHours);
  }
  return 0;
}

function getRequestRowLabel(row) {
  if (row?.requestLabel) return row.requestLabel;
  if (row?.requestType === "LEAVE") {
    const parts = ["Approved leave"];
    if (row.leaveSession) parts.push(row.leaveSession);
    return parts.join(" - ");
  }
  if (row?.requestType === "REGULARIZATION") return "Approved regularization";
  return "Request";
}

function formatScheduledOnLabel(date) {
  if (!date || Number.isNaN(date.getTime?.() ?? NaN)) return null;
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const full = date.toLocaleDateString("en-GB");
  return `${weekday} ${full}`;
}

/** Map taskId → unique day labels for the viewed week (e.g. "Thu 16, Fri 17"). */
function buildScheduledOnByTaskId(assignments, weekDates) {
  const byTask = new Map();
  for (const row of assignments || []) {
    if (isRequestRow(row)) continue;
    const taskId = String(row.taskId ?? "").trim();
    if (!UUID_RE.test(taskId)) continue;
    const dayIndex = Number(row.dayIndex);
    if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) continue;
    const date = weekDates?.[dayIndex];
    const label = formatScheduledOnLabel(date instanceof Date ? date : date ? new Date(date) : null);
    if (!label) continue;
    if (!byTask.has(taskId)) byTask.set(taskId, { labels: [], dayIndexes: new Set() });
    const entry = byTask.get(taskId);
    if (entry.dayIndexes.has(dayIndex)) continue;
    entry.dayIndexes.add(dayIndex);
    entry.labels.push({ dayIndex, label });
  }

  const result = {};
  for (const [taskId, entry] of byTask.entries()) {
    entry.labels.sort((a, b) => a.dayIndex - b.dayIndex);
    result[taskId] = entry.labels.map((item) => item.label).join(", ");
  }
  return result;
}

function formatScheduleTaskLabel(apiTask, taskId) {
  if (apiTask?.revisionCode) {
    return `${apiTask?.opNo ? apiTask.opNo + "-" : ""}${apiTask.revisionCode}`;
  }
  return apiTask?.opNo || `Task #${String(taskId ?? "").slice(0, 6)}`;
}

/** Prefer assignment-embedded task summary (already returned by API), then cached lists. */
function resolveScheduleApiTask(assignment, taskById) {
  return assignment?.task ?? taskById?.[assignment?.taskId] ?? null;
}

/**
 * Merge assignee/cache tasks with summaries already attached on assignment rows
 * so the grid never needs N× GET /tasks/:id on the critical path.
 */
function collectTasksForSchedule(assignments, assigneeTasks = [], scheduleTasks = []) {
  const byId = {};
  for (const task of scheduleTasks) {
    if (task?.id) byId[task.id] = task;
  }
  for (const task of assigneeTasks) {
    if (task?.id) byId[task.id] = task;
  }
  for (const row of assignments || []) {
    if (isRequestRow(row) || !row?.taskId || !row.task) continue;
    const id = row.task.id || row.taskId;
    if (!id) continue;
    // Keep richer assignee records when present; fill gaps from embedded summary.
    byId[id] = byId[id] ? { ...row.task, ...byId[id], id } : { ...row.task, id };
  }
  return Object.values(byId);
}

function buildLiveScheduleData(assignments, tasksArr) {
  const taskById = Object.fromEntries((tasksArr || []).map((t) => [t.id, t]));
  const tasksMap = {};
  const scheduleByDayIndex = {};
  let colorIdx = 0;
  const colorMap = {};

  (assignments || []).forEach((a) => {
    if (isRequestRow(a)) {
      const hours = getRequestRowHours(a);
      if (!hours) return;
      const requestId = a.requestType === "LEAVE"
        ? a.leaveRequestIds?.[0] ?? a.id
        : a.regularizationRequestIds?.[0] ?? a.id;
      const key = `${String(a.requestType).toLowerCase()}-${requestId}-${a.dayIndex}`;
      tasksMap[key] = {
        id: key,
        name: getRequestRowLabel(a),
        baseName: getRequestRowLabel(a),
        estimatedHours: hours,
        scheduledHours: hours,
        approvedOvertimeHours: 0,
        colorClass: getSystemBlockColorClass(a.requestType)
          ?? "bg-slate-100 border border-slate-300 text-slate-800",
        isLocked: true,
        isSystemBlock: true,
        requestType: a.requestType,
        leaveSession: a.leaveSession ?? null,
        requestLabel: a.requestLabel ?? getRequestRowLabel(a),
      };
      const dayStr = String(a.dayIndex);
      if (!scheduleByDayIndex[dayStr]) scheduleByDayIndex[dayStr] = [];
      scheduleByDayIndex[dayStr].push(key);
      return;
    }

    const key = a.splitIndex != null ? `${a.taskId}_s${a.splitIndex}` : a.taskId;
    const apiTask = resolveScheduleApiTask(a, taskById);
    const approvedOvertimeHours = Number(a.approvedOvertimeHours) || 0;
    const scheduledHours = resolveAssignmentScheduledHours(a);
    if (!colorMap[a.taskId]) {
      colorMap[a.taskId] = DASH_COLORS[colorIdx % DASH_COLORS.length];
      colorIdx++;
    }
    const label = formatScheduleTaskLabel(apiTask, a.taskId);
    tasksMap[key] = {
      id: key,
      parentId: a.parentId ?? (a.splitIndex != null ? a.taskId : null),
      designType: apiTask?.designType ?? apiTask?.project?.category ?? null,
      name: label,
      baseName: label,
      estimatedHours: scheduledHours,
      scheduledHours,
      approvedOvertimeHours,
      colorClass: colorMap[a.taskId],
      overtimeColorClass: "bg-red-100 border border-red-300 text-red-800",
      splitIndex: a.splitIndex,
      totalParts: a.totalParts,
    };
    const dayStr = String(a.dayIndex);
    if (!scheduleByDayIndex[dayStr]) scheduleByDayIndex[dayStr] = [];
    scheduleByDayIndex[dayStr].push(key);
  });

  return buildDesignerSnapshot(tasksMap, scheduleByDayIndex);
}

const DEFAULT_STATS = {
  workLoad: { tasks: 0, hours: 0 },
  workTill: { label: '-', hours: 0 },
  monthlyTaskCount: 0,
  weeklyCompletedCount: 0,
  score: 0,
  pendingRegularization: 0,
};
const DEFAULT_DONUT = {
  active: { value: 0, pct: 0, color: '#4f8ef7' },
  inReview: { value: 0, pct: 0, color: '#8b5cf6' },
  onHold: { value: 0, pct: 0, color: '#f5a623' },
  closed: { value: 0, pct: 0, color: '#7ed321' },
  completed: { value: 0, pct: 0, color: '#7ed321' },
  centerPct: 0,
  centerTotal: 0,
};

export default function DesignerDashboard({ designer: designerProp } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromHome = searchParams?.get("from") === "home";

  const [isDesignerMode, setIsDesignerMode] = useState(false);
  const [isHOD, setIsHOD] = useState(false);
  const [sessionName, setSessionName] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [viewedDesignerName, setViewedDesignerName] = useState(null);

  // When HOD views a specific designer, fetch that designer's name
  const propErpId = designerProp?.erpDesignerId ?? (UUID_RE.test(designerProp?.id ?? '') ? designerProp?.id : null);

  useEffect(() => {
    const session = getSession();
    const viewingOther = !!(propErpId && propErpId !== session?.id);
    const hodSelf = (session?.role === "HOD" || session?.role === "SALESPERSON") && !viewingOther;
    setIsDesignerMode(!fromHome && (session?.role === "DESIGNER" || hodSelf));
    setIsHOD(session?.role === "HOD" || session?.role === "SALESPERSON");
    if (session?.name) setSessionName(session.name);
    if (session) setSessionUser(session);
  }, [fromHome, propErpId]);

  useEffect(() => {
    if (!propErpId) return;
    apiClient.get(`/users/${propErpId}`)
      .then((u) => { if (u?.fullName) setViewedDesignerName(u.fullName); })
      .catch(() => {});
  }, [propErpId]);

  const isViewingOther = !!(propErpId && propErpId !== sessionUser?.id);
  const hodSelfMode = isHOD && !isViewingOther;

  const designer = {
    id: isViewingOther ? propErpId : (sessionUser?.id ?? ''),
    erpDesignerId: isViewingOther ? propErpId : (sessionUser?.erpDesignerId ?? sessionUser?.id ?? null),
    name: isViewingOther ? (viewedDesignerName ?? 'Designer') : (sessionUser?.name ?? 'Designer'),
    designation: 'Designer',
    avatar: null,
    stats: DEFAULT_STATS,
    schedule: {},
    onHoldTasks: [],
    completedTasksByWeek: {},
    donut: DEFAULT_DONUT,
  };

  const [activePanel, setActivePanel] = useState("active");
  const [currentDate, setCurrentDate] = useState(DEFAULT_SCHEDULER_REFERENCE_DATE);
  const currentDateRef = useRef(currentDate);
  useEffect(() => { currentDateRef.current = currentDate; }, [currentDate]);
  const weekDates = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const dateRangeText = useMemo(() => formatSchedulerDateRangeText(weekDates), [weekDates]);

  const [scheduleData, setScheduleData] = useState(() => {
    const initial = {};
    Object.entries(designer.schedule || {}).forEach(([dayName, tasks]) => {
      initial[dayName] = {
        assignedStartHr: 0,
        assignedEndHr: Math.max(...(tasks || []).map((task) => task.endHr || 0), 0),
        tasks: tasks || [],
      };
    });
    return initial;
  });
  // Skeleton while week assignments load (initial + week nav). Background polls keep the grid.
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [dynamicStats, setDynamicStats] = useState(null);
  const [weekAssignments, setWeekAssignments] = useState([]);
  const [assigneeTasks, setAssigneeTasks] = useState([]);
  const [pendingRegCount, setPendingRegCount] = useState(null);

  const erpId = designer.erpDesignerId || (UUID_RE.test(designer.id) ? designer.id : null);
  // Assignee task list = source of truth for monthly/completed/donut (never mix in week-only rows).
  const assigneeTasksRef = useRef([]);
  // Lookup used only to render this week's scheduler grid labels/hours.
  const scheduleTasksRef = useRef([]);

  const liveData = useMemo(
    () =>
      computeDesignerTaskStats(assigneeTasks, {
        viewWeekStart: weekDates[0],
        viewWeekEnd: weekDates[weekDates.length - 1],
      }),
    [assigneeTasks, weekDates],
  );

  const applyAssigneeTasks = useCallback((tasks) => {
    const list = Array.isArray(tasks) ? tasks : [];
    assigneeTasksRef.current = list;
    const byId = Object.fromEntries(scheduleTasksRef.current.map((t) => [t.id, t]));
    for (const task of list) byId[task.id] = task;
    scheduleTasksRef.current = Object.values(byId);
    setAssigneeTasks(list);
  }, []);

  const fetchRegularizationCount = useCallback(async () => {
    if (!erpId) return 0;
    const res = await apiClient.get(`/regularization-requests?designerId=${erpId}`);
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return rows.filter((r) => r.status === "Pending").length;
  }, [erpId]);

  const refreshAssigneeTaskStats = useCallback(async () => {
    if (!erpId) return;
    const tasks = await fetchAllDesignerTasks(erpId);
    applyAssigneeTasks(tasks);
  }, [erpId, applyAssigneeTasks]);

  // Fetch tasks once per designer — task-status stats are not week-scoped
  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;
    fetchAllDesignerTasks(erpId)
      .then((tasks) => {
        if (cancelled) return;
        applyAssigneeTasks(tasks);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [erpId, applyAssigneeTasks]);

  // Tracks the last-seen scheduler week version to skip unnecessary full fetches
  const weekVersionRef = useRef(null);
  // Prevents two concurrent fetches from racing each other
  const fetchInFlightRef = useRef(false);

  const fetchWeekAssignments = useCallback(async (clearFirst = false) => {
    if (!erpId) {
      setIsScheduleLoading(false);
      return;
    }
    // clearFirst (week navigation) must always proceed — only block concurrent background polls
    if (!clearFirst && fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (clearFirst) setIsScheduleLoading(true);

    const weekStartStr = fmtYmd(getWeekDays(currentDateRef.current)[0]);
    try {
      // When changing weeks, reset cached version so we always do a full fetch
      if (clearFirst) weekVersionRef.current = null;

      // Cheap version check — skip expensive assignments fetch if nothing changed
      if (!clearFirst) {
        try {
          const meta = await getSchedulerWeekMeta(weekStartStr);
          if (meta?.version != null && meta.version === weekVersionRef.current) return;
          weekVersionRef.current = meta?.version ?? null;
        } catch {
          // Meta fetch failed — fall through to full fetch anyway
        }
      }

      if (clearFirst) {
        setScheduleData({});
        setWeekAssignments([]);
        setDynamicStats(null);
      }

      const assignments = await listSchedulerAssignmentsForWeek(weekStartStr, erpId);
      const rows = Array.isArray(assignments) ? assignments : [];

      // HOD removed all assignments for this designer — clear the grid
      if (rows.length === 0) {
        setScheduleData({});
        setDynamicStats({ tasks: 0, hours: 0 });
        setWeekAssignments([]);
        return;
      }

      setWeekAssignments(rows);

      // Paint immediately from assignment rows + embedded task summaries (no N× /tasks/:id).
      const tasksForGrid = collectTasksForSchedule(
        rows,
        assigneeTasksRef.current,
        scheduleTasksRef.current,
      );
      scheduleTasksRef.current = tasksForGrid;
      const snapshot = buildLiveScheduleData(rows, tasksForGrid);
      setScheduleData(snapshot.schedule);
      setDynamicStats(snapshot.stats);

      // Background only: refresh assignee list if a scheduled task isn't in it yet
      // (Active / Closed tables). Does not block the grid skeleton.
      const assigneeIds = new Set(assigneeTasksRef.current.map((t) => t.id));
      const hasMissingAssigneeTask = rows.some((r) => {
        if (isRequestRow(r) || !UUID_RE.test(String(r.taskId ?? ""))) return false;
        return !assigneeIds.has(r.taskId);
      });
      if (hasMissingAssigneeTask) {
        void refreshAssigneeTaskStats().catch(() => {});
      }

      // Rare fallback: if API omitted a task summary, fetch only those ids off-path.
      const missingSummaryIds = [
        ...new Set(
          rows
            .filter((r) => !isRequestRow(r) && UUID_RE.test(String(r.taskId ?? "")) && !r.task)
            .map((r) => r.taskId),
        ),
      ];
      if (missingSummaryIds.length > 0) {
        void Promise.all(missingSummaryIds.map((id) => apiClient.get(`/tasks/${id}`).catch(() => null)))
          .then((fetched) => {
            const valid = fetched.filter(Boolean);
            if (!valid.length) return;
            const byId = Object.fromEntries(scheduleTasksRef.current.map((t) => [t.id, t]));
            for (const task of valid) byId[task.id] = task;
            scheduleTasksRef.current = Object.values(byId);
            const next = buildLiveScheduleData(rows, scheduleTasksRef.current);
            setScheduleData(next.schedule);
            setDynamicStats(next.stats);
          })
          .catch(() => {});
      }
    } catch {
      // Swallow — next poll or user action will retry
    } finally {
      fetchInFlightRef.current = false;
      if (clearFirst) setIsScheduleLoading(false);
    }
  }, [erpId, refreshAssigneeTaskStats]);

  // Fetch week assignments whenever the viewed week changes — clear grid immediately
  useEffect(() => {
    fetchWeekAssignments(true);
  }, [erpId, currentDate, fetchWeekAssignments]);

  // Poll every 30s — but only when the tab is visible (no point hitting the network while hidden)
  useEffect(() => {
    if (!erpId) return;
    const id = setInterval(() => {
      if (!document.hidden) fetchWeekAssignments(false);
    }, 30_000);
    return () => clearInterval(id);
  }, [erpId, fetchWeekAssignments]);

  useEffect(() => {
    if (!erpId) return undefined;
    return connectDashboardRealtime({
      onDashboardRefresh: () => {
        void refreshAssigneeTaskStats().catch(() => {});
        void fetchWeekAssignments(false);
        void fetchRegularizationCount().then(setPendingRegCount).catch(() => {});
      },
      onNotificationsRefresh: () => {
        void refreshAssigneeTaskStats().catch(() => {});
        void fetchWeekAssignments(false);
        void fetchRegularizationCount().then(setPendingRegCount).catch(() => {});
      },
    });
  }, [erpId, fetchWeekAssignments, fetchRegularizationCount, refreshAssigneeTaskStats]);

  // Fetch pending regularization count
  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;
    fetchRegularizationCount()
      .then((count) => {
        if (cancelled) return;
        setPendingRegCount(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [erpId, fetchRegularizationCount]);

  // Cross-tab sync from scheduler screen (same-browser, instant via localStorage)
  useEffect(() => {
    const applySnapshot = (payload) => {
      const snapshot = payload?.designers?.[designer.id];
      if (!snapshot) return false;
      setScheduleData(snapshot.schedule);
      setDynamicStats(snapshot.stats);
      return true;
    };
    const syncFromStorage = () => {
      try {
        const raw = localStorage.getItem(SCHEDULER_DASHBOARD_SYNC_KEY);
        if (!raw) return false;
        return applySnapshot(JSON.parse(raw));
      } catch {
        return false;
      }
    };
    const isViewingCurrentWeek = () =>
      fmtYmd(getWeekDays(currentDateRef.current)[0]) === fmtYmd(getWeekDays(new Date())[0]);

    // Same-browser: apply localStorage snapshot immediately
    const syncLocalNow = () => {
      if (!isViewingCurrentWeek()) return;
      syncFromStorage();
    };
    syncLocalNow();

    // On tab focus/visibility restore: hit the API so cross-machine HOD changes appear.
    // visibilitychange also fires on hide — guard so we only fetch when becoming visible.
    const syncApiOnFocus = () => {
      if (document.visibilityState === 'visible') fetchWeekAssignments(false);
    };

    const handleStorage = (e) => { if (e.key === SCHEDULER_DASHBOARD_SYNC_KEY) syncLocalNow(); };
    const handleSchedulerEvent = (e) => { if (!applySnapshot(e.detail)) syncLocalNow(); };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SCHEDULER_DASHBOARD_SYNC_EVENT, handleSchedulerEvent);
    document.addEventListener("visibilitychange", syncApiOnFocus);
    window.addEventListener("focus", syncApiOnFocus);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SCHEDULER_DASHBOARD_SYNC_EVENT, handleSchedulerEvent);
      document.removeEventListener("visibilitychange", syncApiOnFocus);
      window.removeEventListener("focus", syncApiOnFocus);
    };
  }, [designer.id, fetchWeekAssignments]);

  // Work Till = last weekday with scheduled work in the viewed week + that day's hours,
  // straight from the scheduler assignments (not task due dates).
  const workTillFromSchedule = useMemo(() => {
    if (!dynamicStats || dynamicStats.lastWorkDayIndex == null) return null;
    const date = weekDates[dynamicStats.lastWorkDayIndex];
    const label = formatWorkTillLabel(date);
    if (!label) return null;
    return { label, hours: dynamicStats.lastWorkDayHours ?? 0 };
  }, [dynamicStats, weekDates]);

  const displayStats = {
    ...designer.stats,
    ...(liveData?.statsOverrides ?? {}),
    workLoad: dynamicStats ?? designer.stats.workLoad,
    workTill: workTillFromSchedule ?? designer.stats.workTill,
    ...(pendingRegCount !== null ? { pendingRegularization: pendingRegCount } : {}),
  };

  const onHoldTasks = liveData?.onHoldTasks ?? designer.onHoldTasks;
  const scheduledOnByTaskId = useMemo(
    () => buildScheduledOnByTaskId(weekAssignments, weekDates),
    [weekAssignments, weekDates],
  );
  // Active Tasks = active-status tasks that have a scheduler slot in the *viewed* week only.
  // Assigned but unscheduled / only on older weeks are hidden here.
  const activeTasks = useMemo(() => {
    const rows = liveData?.activeTasks ?? [];
    return rows
      .filter((task) => Boolean(scheduledOnByTaskId[task.id]))
      .map((task) => ({
        ...task,
        scheduledOn: scheduledOnByTaskId[task.id],
      }));
  }, [liveData?.activeTasks, scheduledOnByTaskId]);
  const inReviewTasks = liveData?.inReviewTasks ?? [];
  const completedTasksByWeek = liveData?.completedTasksByWeek ?? designer.completedTasksByWeek;
  // Closed = CLIENT_ACCEPTED + CLIENT_REJECTED (client-final), not DESIGN_COMPLETED.
  const closedTaskCount = liveData?.allCompletedCount
    ?? Object.values(completedTasksByWeek).reduce(
      (acc, tasks) => acc + (Array.isArray(tasks) ? tasks.length : 0),
      0
    );
  const donut = useMemo(() => {
    const base = liveData?.donut ?? designer.donut;
    const weekActive = activeTasks.length;
    const inReview = Number(base.inReview?.value) || 0;
    const onHold = Number(base.onHold?.value) || 0;
    const closed = Number(base.closed?.value ?? base.completed?.value) || 0;
    const total = weekActive + inReview + onHold + closed || 1;
    const pct = (n) => Math.round((n / total) * 100);
    const closedSlice = {
      value: closed,
      pct: pct(closed),
      color: base.closed?.color ?? base.completed?.color ?? "#7ed321",
    };
    return {
      ...base,
      active: {
        value: weekActive,
        pct: pct(weekActive),
        color: base.active?.color ?? "#4f8ef7",
      },
      inReview: {
        value: inReview,
        pct: pct(inReview),
        color: base.inReview?.color ?? "#8b5cf6",
      },
      onHold: {
        value: onHold,
        pct: pct(onHold),
        color: base.onHold?.color ?? "#f5a623",
      },
      closed: closedSlice,
      completed: closedSlice,
      centerPct: pct(closed),
      centerTotal: total,
    };
  }, [liveData?.donut, designer.donut, activeTasks.length]);

  const openTask = useCallback((task) => {
    if (isHOD && isViewingOther) {
      router.push(taskViewPathForRecord(task, {
        from: FROM_DESIGN_LIST,
        back: `/designer/${encodeURIComponent(designer.erpDesignerId || designer.id)}`,
      }));
      return;
    }
    const back = hodSelfMode && sessionUser?.id
      ? `/designer/${encodeURIComponent(sessionUser.id)}`
      : undefined;
    router.push(taskViewPathForRecord(task, {
      from: FROM_DESIGNER_QUEUE,
      ...(back ? { back } : {}),
    }));
  }, [router, isHOD, isViewingOther, hodSelfMode, sessionUser, designer.erpDesignerId, designer.id]);

  return (
    <div className="app-shell flex flex-col font-sans">
      <Navbar
        currentDate={!isHOD && isDesignerMode ? currentDate : null}
        onCalendarChange={!isHOD && isDesignerMode ? setCurrentDate : undefined}
        dateRangeText={dateRangeText}
      />

      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-64 items-center gap-3 border-r border-slate-200 pr-4">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            {designer.avatar ? (
              <img src={designer.avatar} alt={designer.name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{designer.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight text-slate-900">{isViewingOther ? designer.name : (sessionName ?? designer.name)}</span>
            <span className="text-[10px] leading-tight text-slate-500">{designer.designation}</span>
          </div>
        </div>
      </div>

      <StatsBar stats={displayStats} isDesignerMode={isDesignerMode} isHOD={isHOD} isViewingOther={isViewingOther} isScheduleLoading={isScheduleLoading} />

      <div className="flex min-w-0 flex-1 gap-4 px-4 py-5 sm:px-6 sm:py-6">
        <div className="min-w-0 flex-[1_1_0%] flex flex-col gap-3">
          {/* Grid view controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentDate((d) => { const p = new Date(d); p.setDate(p.getDate() - 7); return p; })}
              className="ui-chip-button px-2"
              title="Previous week"
            >‹</button>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 whitespace-nowrap">
              {dateRangeText}
            </span>
            <button
              type="button"
              onClick={() => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
              className="ui-chip-button px-2"
              title="Next week"
            >›</button>
          </div>

          <SchedulerGrid
            schedule={scheduleData}
            weekDates={weekDates}
            designerId={erpId || designer.id}
            isDesignerMode={isDesignerMode}
            isLoading={isScheduleLoading}
            onOpenTask={openTask}
          />

          <div className="mt-1 flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "active" ? null : "active")}
              className={`ui-chip-button ${activePanel === "active" ? "ui-chip-button-active" : ""}`}
            >
              Active Tasks ({activeTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "inReview" ? null : "inReview")}
              className={`ui-chip-button ${activePanel === "inReview" ? "ui-chip-button-active" : ""}`}
            >
              In Review ({inReviewTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "onHold" ? null : "onHold")}
              className={`ui-chip-button ${activePanel === "onHold" ? "ui-chip-button-active" : ""}`}
            >
              On Hold Tasks ({onHoldTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "closed" ? null : "closed")}
              className={`ui-chip-button ${activePanel === "closed" ? "ui-chip-button-active" : ""}`}
            >
              Closed Tasks ({closedTaskCount})
            </button>
            {isDesignerMode && (
              <div className="ml-auto flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/designer/leave-planner`)}
                  className="ui-chip-button bg-[#fce8e6] text-[#af5b5b] border border-[#f8d2d2] hover:bg-[#fbd8d8] font-semibold"
                >
                  Leave Request
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/designer/requests`)}
                  className="ui-chip-button bg-[#e6e8fc] text-[#5d5baf] border border-[#d2d5f8] hover:bg-[#d8dcfb] font-semibold"
                >
                  Overtime Request
                </button>
              </div>
            )}
          </div>

          {activePanel === "active" && (
            <OnHoldTable
              tasks={activeTasks}
              onOpenTask={openTask}
              emptyLabel="No Active Tasks Scheduled This Week"
              statusTone="ACTIVE"
              showScheduledOn
            />
          )}
          {activePanel === "inReview" && (
            <OnHoldTable
              tasks={inReviewTasks}
              onOpenTask={openTask}
              emptyLabel="No In Review Tasks"
              statusTone="IN_REVIEW"
            />
          )}
          {activePanel === "onHold" && <OnHoldTable tasks={onHoldTasks} onOpenTask={openTask} />}
          {activePanel === "closed" && (
            <WeeksSection completedTasksByWeek={completedTasksByWeek} onOpenTask={openTask} />
          )}
        </div>

        <div className="w-[230px] shrink-0">
          <div className="ui-surface w-full p-4">
            <DonutChart donut={donut} onSelectSegment={setActivePanel} activeSegment={activePanel} />
          </div>
        </div>
      </div>
    </div>
  );
}
