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
import { getSession } from "@/lib/mock-auth";
import { connectDashboardRealtime } from "@/lib/realtime";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function computeLiveData(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const onHold = tasks.filter((t) => t.status === "ON_HOLD");
  const completed = tasks.filter((t) => t.status === "CLIENT_ACCEPTED");
  const active = tasks.filter((t) =>
    ["DESIGN_NEW", "DESIGN_PLANNED", "IN_PROGRESS", "DESIGN_COMPLETED", "HOD_REVIEW", "SALES_REVIEW", "REWORK"].includes(t.status)
  );
  const total = tasks.length || 1;

  // OnHoldTable rows
  const onHoldTasks = onHold.map((task, idx) => ({
    no: idx + 1,
    details: task.title ?? task.opNo ?? "-",
    taskNo: task.taskNo ?? "-",
    projectDetails: task.project?.name ?? task.project?.projectNo ?? "-",
    pct: 0,
    deadline: fmtDdMmYyyy(task.dueDate),
    urgent: task.dueDate ? new Date(task.dueDate) < threeDaysFromNow : false,
  }));

  // WeeksSection: group completed by ISO week, most recent = Week 1
  const completedSorted = [...completed].sort(
    (a, b) =>
      new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt)
  );
  const weekGroups = {};
  for (const task of completedSorted) {
    const dateVal = task.updatedAt ?? task.createdAt;
    if (!dateVal) continue;
    const weekKey = `${new Date(dateVal).getFullYear()}-W${getISOWeek(dateVal)}`;
    if (!weekGroups[weekKey]) weekGroups[weekKey] = [];
    weekGroups[weekKey].push({
      taskNo: task.taskNo ?? "-",
      projectDetails: task.project?.name ?? task.project?.projectNo ?? "-",
      designType: task.designType ?? null,
      revisionCode: task.revisionCode ?? null,
      pctComplete: 100,
      deadline: fmtDdMmYyyy(task.dueDate),
    });
  }
  const completedTasksByWeek = {};
  Object.keys(weekGroups)
    .slice(0, 4)
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

function buildLiveScheduleData(assignments, tasksArr) {
  const taskById = Object.fromEntries((tasksArr || []).map((t) => [t.id, t]));
  const tasksMap = {};
  const scheduleByDayIndex = {};
  let colorIdx = 0;
  const colorMap = {};

  (assignments || []).forEach((a) => {
    const key = a.splitIndex != null ? `${a.taskId}_s${a.splitIndex}` : a.taskId;
    const apiTask = taskById[a.taskId];
    if (!colorMap[a.taskId]) {
      colorMap[a.taskId] = DASH_COLORS[colorIdx % DASH_COLORS.length];
      colorIdx++;
    }
    tasksMap[key] = {
      id: key,
      parentId: a.parentId ?? (a.splitIndex != null ? a.taskId : null),
      name: apiTask?.revisionCode
        ? `${apiTask?.opNo ? apiTask.opNo + '-' : ''}${apiTask.revisionCode}`
        : apiTask?.opNo || `Task #${a.taskId.slice(0, 6)}`,
      baseName: apiTask?.revisionCode
        ? `${apiTask?.opNo ? apiTask.opNo + '-' : ''}${apiTask.revisionCode}`
        : apiTask?.opNo || `Task #${a.taskId.slice(0, 6)}`,
      estimatedHours: Number(a.assignedHours) || 0,
      scheduledHours: Number(a.scheduledHours ?? a.assignedHours) || 0,
      approvedOvertimeHours: Number(a.approvedOvertimeHours) || 0,
      colorClass: colorMap[a.taskId],
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
  xp: 0,
  streak: 0,
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
    setIsDesignerMode(!fromHome && session?.role === "DESIGNER");
    setIsHOD(session?.role === "HOD");
    if (session?.name) setSessionName(session.name);
    if (session) setSessionUser(session);
  }, [fromHome]);

  useEffect(() => {
    if (!propErpId) return;
    apiClient.get(`/users/${propErpId}`)
      .then((u) => { if (u?.fullName) setViewedDesignerName(u.fullName); })
      .catch(() => {});
  }, [propErpId]);

  const isViewingOther = !!(propErpId && propErpId !== sessionUser?.id);

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

  // Fetch tasks once per designer — tasks are not week-scoped
  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;
    apiClient.get(`/tasks?assigneeId=${erpId}&page=1&limit=200`)
      .then((tasksRes) => {
        if (cancelled) return;
        const tasks = Array.isArray(tasksRes?.data) ? tasksRes.data : [];
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
      const weekTaskIds = [...new Set(rows.map((r) => r.taskId))];
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
      onDashboardRefresh: () => void fetchWeekAssignments(false),
      onNotificationsRefresh: () => void fetchWeekAssignments(false),
    });
  }, [erpId, fetchWeekAssignments]);

  // Fetch pending regularization count
  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;
    apiClient
      .get(`/regularization-requests?designerId=${erpId}`)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setPendingRegCount(rows.filter((r) => r.status === "Pending").length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [erpId]);

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
  const donut = liveData?.donut ?? designer.donut;

  return (
    <div className="app-shell flex flex-col font-sans">
      <Navbar
        currentDate={isHOD ? null : currentDate}
        onCalendarChange={isHOD ? undefined : setCurrentDate}
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
          />

          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "onHold" ? null : "onHold")}
              className={`ui-chip-button ${activePanel === "onHold" ? "ui-chip-button-active" : ""}`}
            >
              On Hold Tasks
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "completed" ? null : "completed")}
              className={`ui-chip-button ${activePanel === "completed" ? "ui-chip-button-active" : ""}`}
            >
              Completed Tasks
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
                  onClick={() => router.push(`/designer/requests#overtime`)}
                  className="ui-chip-button bg-[#e6e8fc] text-[#5d5baf] border border-[#d2d5f8] hover:bg-[#d8dcfb] font-semibold"
                >
                  Overtime Request
                </button>
              </div>
            )}
          </div>

          {activePanel === "onHold" && <OnHoldTable tasks={onHoldTasks} />}
          {activePanel === "completed" && (
            <WeeksSection completedTasksByWeek={completedTasksByWeek} />
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
