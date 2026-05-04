"use client";
import { useState, useEffect } from "react";
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

export default function DesignerDashboard({ designer }) {
  const [activePanel, setActivePanel] = useState(null); // "onHold" | "completed" | null
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
      <Navbar dateRangeText={designer.dateRange} />
      
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
        <div className="flex-1 flex px-6 items-center">
          <span className="font-bold text-slate-900">{designer.currentDay}</span>
        </div>
      </div>
      
      {/* Stats Bar */}
      <StatsBar stats={displayStats} />

      {/* Main content */}
      <div className="flex min-w-0 flex-1 gap-6 px-4 py-5 sm:px-6 sm:py-6">
        {/* Left Column: Scheduler + tables */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Scheduler Grid */}
          <SchedulerGrid schedule={scheduleData} />

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
