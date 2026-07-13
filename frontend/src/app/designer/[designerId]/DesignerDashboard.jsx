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
const ACTIVE_TASK_STATUSES = new Set([
  "DESIGN_NEW",
  "DESIGN_PLANNED",
  "IN_PROGRESS",
  "HOD_REVIEW",
  "SALES_REVIEW",
  "REWORK",
  "CLIENT_REJECTED",
]);
const COMPLETED_TASK_STATUSES = new Set(["DESIGN_COMPLETED", "CLIENT_ACCEPTED"]);

function fmtYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtDdMmYyyy(dateLike) {
  if (!dateLike) return "-";
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function getISOWeek(dateLike) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
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

function normalizeStatus(status) {
  return String(status ?? "").trim().toUpperCase();
}

function taskSortDate(task) {
  return new Date(task.completedAt ?? task.updatedAt ?? task.createdAt ?? 0).getTime();
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

function computeLiveData(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const onHold = tasks
    .filter((t) => normalizeStatus(t.status) === "ON_HOLD")
    .sort((a, b) => taskSortDate(b) - taskSortDate(a));
  const completed = tasks
    .filter((t) => COMPLETED_TASK_STATUSES.has(normalizeStatus(t.status)))
    .sort((a, b) => taskSortDate(b) - taskSortDate(a));
  const active = tasks.filter((t) => ACTIVE_TASK_STATUSES.has(normalizeStatus(t.status)));
  const total = tasks.length || 1;

  // OnHoldTable rows
  const onHoldTasks = onHold.map((task, idx) => ({
    id: task.id,
    no: idx + 1,
    details: task.title ?? task.opNo ?? "-",
    taskNo: task.taskNo ?? "-",
    projectDetails: task.project?.name ?? task.project?.projectNo ?? "-",
    designType: task.designType ?? task.project?.category ?? null,
    status: normalizeStatus(task.status),
    pct: 0,
    deadline: fmtDdMmYyyy(task.dueDate),
    urgent: task.dueDate ? new Date(task.dueDate) < threeDaysFromNow : false,
  }));

  // WeeksSection: group completed by ISO week, most recent = Week 1
  const completedSorted = [...completed];
  const weekGroups = {};
  for (const task of completedSorted) {
    const dateVal = task.updatedAt ?? task.createdAt;
    if (!dateVal) continue;
    const weekKey = `${new Date(dateVal).getFullYear()}-W${getISOWeek(dateVal)}`;
    if (!weekGroups[weekKey]) weekGroups[weekKey] = [];
    weekGroups[weekKey].push({
      id: task.id,
      taskNo: task.taskNo ?? "-",
      projectDetails: task.project?.name ?? task.project?.projectNo ?? "-",
      designType: task.designType ?? null,
      revisionCode: task.revisionCode ?? null,
      status: normalizeStatus(task.status),
      pctComplete: 100,
      deadline: fmtDdMmYyyy(task.dueDate),
    });
  }
  const completedTasksByWeek = {};
  Object.keys(weekGroups)
    .forEach((key, idx) => {
      completedTasksByWeek[`Week ${idx + 1}`] = weekGroups[key];
    });

  // DonutChart data
  const donut = {
    active: {
      value: active.length,
      pct: Math.round((active.length / total) * 100),
      color: "#4f8ef7",
    },
    onHold: {
      value: onHold.length,
      pct: Math.round((onHold.length / total) * 100),
      color: "#f5a623",
    },
    completed: {
      value: completed.length,
      pct: Math.round((completed.length / total) * 100),
      color: "#7ed321",
    },
    centerPct: Math.round((completed.length / total) * 100),
    centerTotal: total,
  };

  // Stats overrides
  const workLoadHours = active.reduce((acc, t) => {
    return acc + Number(t.retailDetails?.hoursRequired ?? 0);
  }, 0);

  const upcomingDeadline = active
    .filter((t) => t.dueDate)
    .map((t) => new Date(t.dueDate))
    .filter((d) => !isNaN(d.getTime()) && d > now)
    .sort((a, b) => a - b)[0] ?? null;

  const thisMonthCompleted = completed.filter((t) => {
    const d = new Date(t.updatedAt ?? t.createdAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  return {
    onHoldTasks,
    completedTasksByWeek,
    donut,
    statsOverrides: {
      workLoad: { tasks: active.length + onHold.length, hours: workLoadHours },
      ...(upcomingDeadline
        ? { workTill: { label: formatWorkTillLabel(upcomingDeadline), hours: 0 } }
        : {}),
      monthlyTaskCount: thisMonthCompleted.length,
      monthlyHourCount: thisMonthCompleted.reduce(
        (acc, t) => acc + Number(t.retailDetails?.hoursRequired ?? 0),
        0
      ),
    },
  };
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
  if (row?.requestType === "LEAVE") return row.leaveSession ? `Leave - ${row.leaveSession}` : "Leave";
  if (row?.requestType === "REGULARIZATION") return "Regularization";
  return "Request";
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
        colorClass: a.requestType === "LEAVE"
          ? "bg-sky-100 border border-sky-300 text-sky-800"
          : "bg-violet-100 border border-violet-300 text-violet-800",
        isLocked: true,
        isSystemBlock: true,
        requestType: a.requestType,
        leaveSession: a.leaveSession ?? null,
      };
      const dayStr = String(a.dayIndex);
      if (!scheduleByDayIndex[dayStr]) scheduleByDayIndex[dayStr] = [];
      scheduleByDayIndex[dayStr].push(key);
      return;
    }

    const key = a.splitIndex != null ? `${a.taskId}_s${a.splitIndex}` : a.taskId;
    const apiTask = taskById[a.taskId];
    const approvedOvertimeHours = Number(a.approvedOvertimeHours) || 0;
    const scheduledHours =
      Number(a.scheduledHours ?? Math.max((Number(a.assignedHours) || 0) - approvedOvertimeHours, 0)) || 0;
    if (!colorMap[a.taskId]) {
      colorMap[a.taskId] = DASH_COLORS[colorIdx % DASH_COLORS.length];
      colorIdx++;
    }
    tasksMap[key] = {
      id: key,
      parentId: a.parentId ?? (a.splitIndex != null ? a.taskId : null),
      designType: apiTask?.designType ?? apiTask?.project?.category ?? null,
      name: apiTask?.revisionCode
        ? `${apiTask?.opNo ? apiTask.opNo + '-' : ''}${apiTask.revisionCode}`
        : apiTask?.opNo || `Task #${a.taskId.slice(0, 6)}`,
      baseName: apiTask?.revisionCode
        ? `${apiTask?.opNo ? apiTask.opNo + '-' : ''}${apiTask.revisionCode}`
        : apiTask?.opNo || `Task #${a.taskId.slice(0, 6)}`,
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
  monthlyHourCount: 0,
  score: 0,
  pendingRegularization: 0,
};
const DEFAULT_DONUT = {
  active: { value: 0, pct: 0, color: '#4f8ef7' },
  onHold: { value: 0, pct: 0, color: '#f5a623' },
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

  const [activePanel, setActivePanel] = useState("onHold");
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
  const [dynamicStats, setDynamicStats] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [pendingRegCount, setPendingRegCount] = useState(null);

  const erpId = designer.erpDesignerId || (UUID_RE.test(designer.id) ? designer.id : null);
  const allTasksRef = useRef([]);

  const fetchRegularizationCount = useCallback(async () => {
    if (!erpId) return 0;
    const res = await apiClient.get(`/regularization-requests?designerId=${erpId}`);
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return rows.filter((r) => r.status === "Pending").length;
  }, [erpId]);

  // Fetch tasks once per designer — tasks are not week-scoped
  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;
    fetchAllDesignerTasks(erpId)
      .then((tasks) => {
        if (cancelled) return;
        allTasksRef.current = tasks;
        const computed = computeLiveData(tasks);
        if (computed) setLiveData(computed);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [erpId]);

  // Tracks the last-seen scheduler week version to skip unnecessary full fetches
  const weekVersionRef = useRef(null);
  // Prevents two concurrent fetches from racing each other
  const fetchInFlightRef = useRef(false);

  const fetchWeekAssignments = useCallback(async (clearFirst = false) => {
    if (!erpId) return;
    // clearFirst (week navigation) must always proceed — only block concurrent background polls
    if (!clearFirst && fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

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

      if (clearFirst) setScheduleData({});

      const assignments = await listSchedulerAssignmentsForWeek(weekStartStr, erpId);
      const rows = Array.isArray(assignments) ? assignments : [];

      // HOD removed all assignments for this designer — clear the grid
      if (rows.length === 0) {
        setScheduleData({});
        setDynamicStats(null);
        return;
      }

      // Refresh all tasks referenced in this week's assignments by fetching each by ID.
      // This handles three cases in one shot:
      //   1. New task assigned to this designer (unknown ID) — append it
      //   2. Task status changed e.g. ON_HOLD, COMPLETED — update existing entry
      //   3. Old task re-assigned (beyond limit=200 in assigneeId query) — still found by ID
      const weekTaskIds = [...new Set(rows.filter((r) => !isRequestRow(r) && UUID_RE.test(String(r.taskId ?? ""))).map((r) => r.taskId))];
      const freshTasks = await Promise.all(
        weekTaskIds.map((id) => apiClient.get(`/tasks/${id}`).catch(() => null))
      );
      const validFresh = freshTasks.filter(Boolean);
      if (validFresh.length > 0) {
        const freshMap = Object.fromEntries(validFresh.map((t) => [t.id, t]));
        const existingIds = new Set(allTasksRef.current.map((t) => t.id));
        allTasksRef.current = [
          ...allTasksRef.current.map((t) => freshMap[t.id] ?? t),  // update existing
          ...validFresh.filter((t) => !existingIds.has(t.id)),      // append new
        ];
        const computed = computeLiveData(allTasksRef.current);
        if (computed) setLiveData(computed);
      }

      const snapshot = buildLiveScheduleData(rows, allTasksRef.current);
      setScheduleData(snapshot.schedule);
      setDynamicStats(snapshot.stats);
    } catch {
      // Swallow — next poll or user action will retry
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [erpId]);

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
        void fetchWeekAssignments(false);
        void fetchRegularizationCount().then(setPendingRegCount).catch(() => {});
      },
      onNotificationsRefresh: () => {
        void fetchWeekAssignments(false);
        void fetchRegularizationCount().then(setPendingRegCount).catch(() => {});
      },
    });
  }, [erpId, fetchWeekAssignments, fetchRegularizationCount]);

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

  const displayStats = {
    ...designer.stats,
    ...(liveData?.statsOverrides ?? {}),
    workLoad: dynamicStats ?? liveData?.statsOverrides?.workLoad ?? designer.stats.workLoad,
    ...(pendingRegCount !== null ? { pendingRegularization: pendingRegCount } : {}),
  };

  const onHoldTasks = liveData?.onHoldTasks ?? designer.onHoldTasks;
  const completedTasksByWeek = liveData?.completedTasksByWeek ?? designer.completedTasksByWeek;
  const completedTaskCount = Object.values(completedTasksByWeek).reduce(
    (acc, tasks) => acc + (Array.isArray(tasks) ? tasks.length : 0),
    0
  );
  const donut = liveData?.donut ?? designer.donut;

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

      <StatsBar stats={displayStats} isDesignerMode={isDesignerMode} isHOD={isHOD} isViewingOther={isViewingOther} />

      <div className="flex min-w-0 flex-1 gap-6 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex-1 flex flex-col gap-3 min-w-0">
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
            onOpenTask={openTask}
          />

          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "onHold" ? null : "onHold")}
              className={`ui-chip-button ${activePanel === "onHold" ? "ui-chip-button-active" : ""}`}
            >
              On Hold Tasks ({onHoldTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "completed" ? null : "completed")}
              className={`ui-chip-button ${activePanel === "completed" ? "ui-chip-button-active" : ""}`}
            >
              Completed Tasks ({completedTaskCount})
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

          {activePanel === "onHold" && <OnHoldTable tasks={onHoldTasks} onOpenTask={openTask} />}
          {activePanel === "completed" && (
            <WeeksSection completedTasksByWeek={completedTasksByWeek} onOpenTask={openTask} />
          )}
        </div>

        <div className="w-[180px] shrink-0">
          <div className="ui-surface w-full p-3">
            <DonutChart donut={donut} />
          </div>
        </div>
      </div>
    </div>
  );
}
