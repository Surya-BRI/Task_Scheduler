"use client";
import { useState, useEffect, useMemo } from "react";
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
import { listSchedulerAssignmentsForWeek } from "@/features/scheduler/services/scheduler-assignments.api";
import { apiClient } from "@/lib/api-client";
import { getSession } from "@/lib/mock-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
      name: apiTask?.revisionCode || apiTask?.title || `Task #${a.taskId.slice(0, 6)}`,
      baseName: apiTask?.revisionCode || apiTask?.title || `Task #${a.taskId.slice(0, 6)}`,
      estimatedHours: Number(a.assignedHours) || 0,
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

export default function DesignerDashboard({ designer }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromHome = searchParams?.get("from") === "home";

  const [isDesignerMode, setIsDesignerMode] = useState(false);
  const [isHOD, setIsHOD] = useState(false);

  useEffect(() => {
    const session = getSession();
    // isDesignerMode: true only when the logged-in user is a DESIGNER viewing their OWN dashboard
    setIsDesignerMode(!fromHome && session?.role === "DESIGNER");
    setIsHOD(session?.role === "HOD");
  }, [fromHome]);

  const [activePanel, setActivePanel] = useState(null); // "onHold" | "completed" | null
  const [currentDate, setCurrentDate] = useState(DEFAULT_SCHEDULER_REFERENCE_DATE);
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

  // Live fetch: load scheduler assignments for this designer from the API
  const erpId = designer.erpDesignerId || (UUID_RE.test(designer.id) ? designer.id : null);
  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;
    const weekStartStr = fmtYmd(getWeekDays(currentDate)[0]);
    Promise.all([
      listSchedulerAssignmentsForWeek(weekStartStr, erpId),
      apiClient.get(`/tasks?assigneeId=${erpId}&page=1&limit=200`),
    ])
      .then(([assignments, tasksRes]) => {
        if (cancelled) return;
        const rows = Array.isArray(assignments) ? assignments : [];
        if (rows.length === 0) return; // keep static/sync data when no assignments yet
        const snapshot = buildLiveScheduleData(rows, tasksRes?.data || []);
        setScheduleData(snapshot.schedule);
        setDynamicStats(snapshot.stats);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [erpId, currentDate]);

  useEffect(() => {
    const applySnapshot = (payload) => {
      const snapshot = payload?.designers?.[designer.id];
      if (!snapshot) return false;
      setScheduleData(snapshot.schedule);
      setDynamicStats(snapshot.stats);
      return true;
    };
    const applySessionFallback = () => {
      const stored = sessionStorage.getItem(`designer_data_${designer.id}`);
      if (!stored) return false;
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.schedule && parsed?.stats) {
          setScheduleData(parsed.schedule);
          setDynamicStats(parsed.stats);
          return true;
        }
        if (parsed?.tasks && parsed?.schedule) {
          const rebuilt = buildDesignerSnapshot(parsed.tasks, parsed.schedule);
          setScheduleData(rebuilt.schedule);
          setDynamicStats(rebuilt.stats);
          return true;
        }
      } catch (e) {
        console.error("Failed to load schedule from session storage", e);
      }
      return false;
    };
    const syncFromStorage = () => {
      try {
        const raw = localStorage.getItem(SCHEDULER_DASHBOARD_SYNC_KEY);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        return applySnapshot(payload);
      } catch (error) {
        console.error("Failed to load scheduler sync payload", error);
        return false;
      }
    };
    const syncNow = () => {
      if (syncFromStorage()) return;
      applySessionFallback();
    };
    syncNow();
    const handleStorage = (event) => {
      if (event.key === SCHEDULER_DASHBOARD_SYNC_KEY) syncNow();
    };
    const handleSchedulerEvent = (event) => {
      if (!applySnapshot(event.detail)) syncNow();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SCHEDULER_DASHBOARD_SYNC_EVENT, handleSchedulerEvent);
    document.addEventListener("visibilitychange", syncNow);
    window.addEventListener("focus", syncNow);
    const intervalId = window.setInterval(syncNow, 2000);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SCHEDULER_DASHBOARD_SYNC_EVENT, handleSchedulerEvent);
      document.removeEventListener("visibilitychange", syncNow);
      window.removeEventListener("focus", syncNow);
      window.clearInterval(intervalId);
    };
  }, [designer.id]);

  const displayStats = {
    ...designer.stats,
    workLoad: dynamicStats || designer.stats.workLoad,
  };

  return (
    <div className="app-shell flex flex-col font-sans">
      <Navbar
        currentDate={currentDate}
        onCalendarChange={setCurrentDate}
        dateRangeText={dateRangeText}
      />
      
      {/* Profile Bar matching Scheduler Subheader */}
      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-64 items-center gap-3 border-r border-slate-200 pr-4">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            {designer.avatar ? (
              <img src={designer.avatar} alt={designer.name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{designer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight text-slate-900">{designer.name}</span>
            <span className="text-[10px] leading-tight text-slate-500">{designer.designation}</span>
          </div>
        </div>
      </div>
      
      {/* Stats Bar */}
      <StatsBar stats={displayStats} isDesignerMode={isDesignerMode} isHOD={isHOD} />

      {/* Main content */}
      <div className="flex min-w-0 flex-1 gap-6 px-4 py-5 sm:px-6 sm:py-6">
        {/* Left Column: Scheduler + tables */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Scheduler Grid */}
          <SchedulerGrid schedule={scheduleData} weekDates={weekDates} designerId={erpId || designer.id} isDesignerMode={isDesignerMode} />

          {/* Action Buttons */}
          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "onHold" ? null : "onHold")}
              className={`ui-chip-button ${
                activePanel === "onHold"
                  ? "ui-chip-button-active"
                  : ""
              }`}
            >
              On Hold Tasks
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(activePanel === "completed" ? null : "completed")}
              className={`ui-chip-button ${
                activePanel === "completed"
                  ? "ui-chip-button-active"
                  : ""
              }`}
            >
              Completed Tasks
            </button>
            {(isDesignerMode || isHOD) && (
              <div className="ml-auto flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/designer/${designer.id}/leave-planner`)}
                  className="ui-chip-button bg-[#fce8e6] text-[#af5b5b] border border-[#f8d2d2] hover:bg-[#fbd8d8] font-semibold"
                >
                  Leave Request
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/designer/${designer.id}/requests#overtime`)}
                  className="ui-chip-button bg-[#e6e8fc] text-[#5d5baf] border border-[#d2d5f8] hover:bg-[#d8dcfb] font-semibold"
                >
                  Overtime Request
                </button>
              </div>
            )}
          </div>

          {/* On Hold Tasks Table */}
          {activePanel === "onHold" && (
            <OnHoldTable tasks={designer.onHoldTasks} />
          )}

          {/* Weeks Section with Completed Tasks */}
          {activePanel === "completed" && (
            <WeeksSection completedTasksByWeek={designer.completedTasksByWeek} />
          )}
        </div>

        {/* Right Panel: Donut */}
        <div className="w-[180px] shrink-0">
          <div className="ui-surface w-full p-3">
            <DonutChart donut={designer.donut} />
          </div>
        </div>
      </div>
    </div>
  );
}
