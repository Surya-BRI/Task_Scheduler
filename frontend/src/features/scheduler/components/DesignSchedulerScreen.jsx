"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, PauseCircle, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useDesignListStore } from "@/state/DesignListContext";
import {
    SCHEDULER_DASHBOARD_SYNC_EVENT,
    SCHEDULER_DASHBOARD_SYNC_KEY,
    buildDesignerSnapshot,
    buildSchedulerSnapshot
} from "../utils/designerDashboardSync";
const DUMMY_DESIGNERS = [
    { id: "d1", name: "Alex Johnson", initials: "AJ" },
    { id: "d2", name: "Alexander Allen", initials: "AA" },
    { id: "d3", name: "Benjamin Harris", initials: "BH" },
    { id: "d4", name: "Chloe Wright", initials: "CW" },
    { id: "d5", name: "David Adams", initials: "DA" },
    { id: "d6", name: "Ella Young", initials: "EY" },
    { id: "d7", name: "Emily Davis", initials: "ED" },
    { id: "d8", name: "Ethan Anderson", initials: "EA" },
    { id: "d9", name: "Grace Green", initials: "GG" },
    { id: "d10", name: "Hannah Perez", initials: "HP" },
    { id: "d11", name: "Designer 11", initials: "DX" },
    { id: "d12", name: "Designer 12", initials: "DX" },
    { id: "d13", name: "Designer 13", initials: "DX" },
    { id: "d14", name: "Designer 14", initials: "DX" },
    { id: "d15", name: "Designer 15", initials: "DX" },
    { id: "d16", name: "Designer 16", initials: "DX" },
    { id: "d17", name: "Designer 17", initials: "DX" },
    { id: "d18", name: "Designer 18", initials: "DX" },
    { id: "d19", name: "Designer 19", initials: "DX" },
    { id: "d20", name: "Designer 20", initials: "DX" },
];
// Capacity constants
const DAILY_CAPACITY = 8; // 8hrs per day = normal capacity (green/blue)
const MAX_DAILY_HOURS = 12; // absolute max assignable per day
const WEEKLY_CAPACITY = 40; // 5 working days × 8hrs
const WEEKDAY_INDICES = [0, 1, 2, 3, 4];
const ALL_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const isWeekdayIndex = (dayIndex) => WEEKDAY_INDICES.includes(dayIndex);
const cloneState = (value) => JSON.parse(JSON.stringify(value));
const getCurrentDayIndex = (date) => (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
const getWeekDays = (baseDate) => {
    const dates = [];
    const currentDay = baseDate.getDay() === 0 ? 7 : baseDate.getDay();
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - currentDay + 1);
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
    }
    return dates;
};
const sumTaskHours = (taskMap, taskIds) => taskIds.reduce((acc, taskId) => acc + (taskMap[taskId]?.estimatedHours || 0), 0);

const TASK_COLORS = [
    "bg-orange-100 border border-orange-300 text-orange-800",
    "bg-blue-100 border border-blue-300 text-blue-800",
    "bg-indigo-100 border border-indigo-300 text-indigo-800",
    "bg-purple-100 border border-purple-300 text-purple-800",
    "bg-green-100 border border-green-300 text-green-800",
    "bg-pink-100 border border-pink-300 text-pink-800",
    "bg-yellow-100 border border-yellow-300 text-yellow-800",
    "bg-teal-100 border border-teal-300 text-teal-800",
    "bg-red-100 border border-red-300 text-red-800",
    "bg-cyan-100 border border-cyan-300 text-cyan-800",
    "bg-lime-100 border border-lime-300 text-lime-800",
    "bg-violet-100 border border-violet-300 text-violet-800",
    "bg-amber-100 border border-amber-300 text-amber-800",
    "bg-rose-100 border border-rose-300 text-rose-800",
    "bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800",
    "bg-sky-100 border border-sky-300 text-sky-800"
];

export function DesignSchedulerScreen() {
    const router = useRouter();
    const { records } = useDesignListStore();

    const initialData = useMemo(() => {
        const tasksObj = {};
        const schedulesObj = {};
        
        for (let i = 1; i <= 20; i++) {
            schedulesObj[`d${i}`] = { "0": [], "1": [], "2": [], "3": [], "4": [] };
        }

        records.slice(0, 100).forEach((record, idx) => {
            let status = "unassigned";
            if (idx < 8) status = "on-hold";
            else if (idx < 27) status = "unassigned";
            else status = "assigned";

            tasksObj[record.id] = {
                id: record.id,
                name: record.name,
                tag: record.designType,
                estimatedHours: (idx % 3) + 2,
                status,
                colorClass: status === "on-hold" || status === "unassigned" && idx % 3 === 0
                    ? "bg-slate-50 border border-slate-200 text-slate-700"
                    : TASK_COLORS[idx % TASK_COLORS.length],
                baseName: record.name,
                holdTime: idx < 8 ? "2 Days" : undefined
            };
        });

        let assignedIdx = 27;
        const addSchedule = (d, day, count) => {
            for (let i = 0; i < count && assignedIdx < 100; i++) {
                schedulesObj[d][day].push(records[assignedIdx++].id);
            }
        };

        addSchedule("d1", "0", 2); addSchedule("d1", "1", 2); addSchedule("d1", "2", 1);
        addSchedule("d2", "0", 1); addSchedule("d2", "1", 2); addSchedule("d2", "3", 1);
        addSchedule("d3", "2", 2); addSchedule("d3", "4", 1);
        addSchedule("d4", "0", 1); addSchedule("d4", "1", 1); addSchedule("d4", "2", 1); addSchedule("d4", "3", 1);
        
        let d = 5;
        let day = 0;
        while (assignedIdx < 100) {
            schedulesObj[`d${d}`][`${day}`].push(records[assignedIdx++].id);
            day++;
            if (day > 4) {
                day = 0;
                d++;
                if (d > 20) d = 5;
            }
        }

        schedulesObj["d1"]["0"] = [];
        assignedIdx = 27; 
        for (let i = 0; i < 8 && assignedIdx < 100; i++) {
            const r = records[assignedIdx++];
            tasksObj[r.id].estimatedHours = 1;
            tasksObj[r.id].tag = "Alex Monday";
            schedulesObj["d1"]["0"].push(r.id);
        }

        return { tasksObj, schedulesObj };
    }, [records]);

    const [tasks, setTasks] = useState(initialData.tasksObj);
    const [schedules, setSchedules] = useState(initialData.schedulesObj);
    const [searchQuery, setSearchQuery] = useState("");
    const splitIdCounterRef = useRef(0);
    const [viewMode, setViewMode] = useState("week");
    const [selectedDays, setSelectedDays] = useState(WEEKDAY_INDICES);
    const [currentDay, setCurrentDay] = useState(getCurrentDayIndex(new Date()));
    const [dropIndicator, setDropIndicator] = useState(null);
    
    // Custom Date selection state
    const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3));
    const weekDates = useMemo(() => getWeekDays(currentDate), [currentDate]);
    const dateRangeText = useMemo(() => {
        if (!weekDates || weekDates.length === 0) return "";
        const start = weekDates[0];
        const end = weekDates[6] || weekDates[weekDates.length - 1];
        return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }, [weekDates]);
    const customVisibleDays = useMemo(() => {
        const filtered = [...new Set(selectedDays.filter(isWeekdayIndex))].sort((a, b) => a - b);
        if (filtered.length > 0)
            return filtered;
        return [isWeekdayIndex(currentDay) ? currentDay : WEEKDAY_INDICES[0]];
    }, [selectedDays, currentDay]);
    const visibleDays = viewMode === "week" ? ALL_DAY_INDICES : customVisibleDays;
    const layoutMode = visibleDays.length === 1 ? "single-column" : visibleDays.length <= 3 ? "grid" : "horizontal-scroll";
    const handleDayToggle = (dayIndex) => {
        if (viewMode !== "custom")
            return;
        if (!isWeekdayIndex(dayIndex))
            return;
        setCurrentDay(dayIndex);
        setSelectedDays((prev) => {
            const exists = prev.includes(dayIndex);
            const next = exists
                ? prev.filter((d) => d !== dayIndex && isWeekdayIndex(d))
                : [...prev.filter(isWeekdayIndex), dayIndex];
            if (next.length === 0)
                return prev;
            return [...next].sort((a, b) => a - b);
        });
    };
    const handleDragStart = (e, taskId, sourceId, sourceDay) => {
        e.dataTransfer.setData("taskId", taskId);
        e.dataTransfer.setData("sourceId", sourceId);
        if (sourceDay)
            e.dataTransfer.setData("sourceDay", sourceDay);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
    };
    const getDropPosition = (e, el) => {
        const rect = el.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        return e.clientX < midpoint ? "before" : "after";
    };
    const handleTaskDragOver = (e, designerId, dayIndex, taskIndex) => {
        e.preventDefault();
        const position = getDropPosition(e, e.currentTarget);
        setDropIndicator({ designerId, dayIndex, taskIndex, position });
    };
    const getTaskLabel = (task) => {
        if (task.splitIndex && task.totalParts && task.totalParts > 1) {
            return `${task.baseName ?? task.name} ${task.splitIndex}/${task.totalParts}`;
        }
        return task.name;
    };
    const getNextTaskId = () => {
        splitIdCounterRef.current += 1;
        return `split-${splitIdCounterRef.current}`;
    };
    const getNextVisibleDayIndex = (dayIndex, candidateDays) => {
        return candidateDays.find((idx) => idx > dayIndex);
    };
    const handleDropToDay = (e, targetDesignerId, targetDayIndex, targetTaskIndex, targetPosition = "after") => {
        e.preventDefault();
        setDropIndicator(null);
        if (!visibleDays.includes(targetDayIndex))
            return;
        // Block drops on weekends (Sat=5, Sun=6)
        if (targetDayIndex >= 5)
            return;
        const taskId = e.dataTransfer.getData("taskId");
        const sourceId = e.dataTransfer.getData("sourceId");
        const sourceDay = e.dataTransfer.getData("sourceDay");
        const targetDayStr = targetDayIndex.toString();
        if (!taskId)
            return;
        if (sourceDay &&
            sourceId !== "unassigned" &&
            sourceId !== "on-hold" &&
            !visibleDays.includes(Number(sourceDay)))
            return;
        const droppedTask = tasks[taskId];
        if (!droppedTask)
            return;
        const updatedSchedules = cloneState(schedules);
        const updatedTasks = { ...tasks };
        if (!updatedSchedules[targetDesignerId]) {
            updatedSchedules[targetDesignerId] = {};
        }
        if (!updatedSchedules[targetDesignerId][targetDayStr]) {
            updatedSchedules[targetDesignerId][targetDayStr] = [];
        }
        const targetList = updatedSchedules[targetDesignerId][targetDayStr];
        const rawInsertIndex = targetTaskIndex === undefined
            ? targetList.length
            : targetTaskIndex + (targetPosition === "after" ? 1 : 0);
        let insertionIndex = Math.max(0, Math.min(rawInsertIndex, targetList.length));
        if (sourceId !== "unassigned" && sourceId !== "on-hold") {
            if (updatedSchedules[sourceId] && updatedSchedules[sourceId][sourceDay]) {
                updatedSchedules[sourceId][sourceDay] = updatedSchedules[sourceId][sourceDay].filter((id) => id !== taskId);
            }
        }
        const parentId = droppedTask.parentId ?? droppedTask.id;
        const baseName = droppedTask.baseName ?? droppedTask.name;
        const visibleWeekdays = [...visibleDays].filter((d) => d < 5).sort((a, b) => a - b);
        let remainingHours = droppedTask.estimatedHours;
        const plannedParts = [];
        let currentDayIndex = targetDayIndex;
        while (remainingHours > 0 &&
            currentDayIndex !== undefined &&
            visibleWeekdays.includes(currentDayIndex)) {
            const dayKey = currentDayIndex.toString();
            if (!updatedSchedules[targetDesignerId][dayKey]) {
                updatedSchedules[targetDesignerId][dayKey] = [];
            }
            const usedHours = sumTaskHours(updatedTasks, updatedSchedules[targetDesignerId][dayKey] || []);
            const availableHours = Math.max(0, MAX_DAILY_HOURS - usedHours);
            if (availableHours === 0) {
                currentDayIndex = getNextVisibleDayIndex(currentDayIndex, visibleWeekdays) ?? 7;
                continue;
            }
            const partHours = Math.min(remainingHours, availableHours);
            plannedParts.push({
                id: plannedParts.length === 0 ? taskId : getNextTaskId(),
                dayIndex: currentDayIndex,
                hours: partHours,
            });
            remainingHours -= partHours;
            currentDayIndex = getNextVisibleDayIndex(currentDayIndex, visibleWeekdays) ?? 7;
        }
        if (plannedParts.length === 0)
            return;
        const totalParts = plannedParts.length + (remainingHours > 0 ? 1 : 0);
        plannedParts.forEach((part, index) => {
            updatedTasks[part.id] = {
                ...droppedTask,
                id: part.id,
                parentId,
                baseName,
                estimatedHours: part.hours,
                splitIndex: totalParts > 1 ? index + 1 : undefined,
                totalParts: totalParts > 1 ? totalParts : undefined,
                status: "assigned",
            };
            const dayKey = part.dayIndex.toString();
            if (index === 0 && dayKey === targetDayStr) {
                const dayTasks = updatedSchedules[targetDesignerId][dayKey];
                const boundedIndex = Math.max(0, Math.min(insertionIndex, dayTasks.length));
                dayTasks.splice(boundedIndex, 0, part.id);
            }
            else {
                updatedSchedules[targetDesignerId][dayKey].push(part.id);
            }
        });
        if (remainingHours > 0) {
            const overflowId = getNextTaskId();
            updatedTasks[overflowId] = {
                ...droppedTask,
                id: overflowId,
                parentId,
                baseName,
                estimatedHours: remainingHours,
                splitIndex: totalParts,
                totalParts,
                status: "unassigned",
            };
        }
        setSchedules(updatedSchedules);
        setTasks(updatedTasks);
        setCurrentDay(targetDayIndex);
    };
    const handleDropToPanel = (e, newStatus) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("taskId");
        const sourceId = e.dataTransfer.getData("sourceId");
        const sourceDay = e.dataTransfer.getData("sourceDay");
        if (!taskId)
            return;
        setSchedules(prev => {
            if (sourceId === 'unassigned' || sourceId === 'on-hold')
                return prev;
            const newSchedules = cloneState(prev);
            if (newSchedules[sourceId] && newSchedules[sourceId][sourceDay]) {
                newSchedules[sourceId][sourceDay] = newSchedules[sourceId][sourceDay].filter(id => id !== taskId);
            }
            return newSchedules;
        });
        setTasks(prev => ({
            ...prev,
            [taskId]: { ...prev[taskId], status: newStatus }
        }));
    };
    const lowerSearchQuery = searchQuery.toLowerCase();
    const unassignedTasks = useMemo(() => Object.values(tasks).filter((t) => t.status === "unassigned" && t.name.toLowerCase().includes(lowerSearchQuery)), [tasks, lowerSearchQuery]);
    const onHoldTasks = useMemo(() => Object.values(tasks).filter((t) => t.status === "on-hold" && t.name.toLowerCase().includes(lowerSearchQuery)), [tasks, lowerSearchQuery]);
    // Shift tasks from later weekdays to earlier weekdays up to DAILY_CAPACITY.
    const getOptimizedSchedule = (currentSchedules, currentTasks) => {
        const newSchedules = cloneState(currentSchedules);
        let changed = false;
        for (const designer of DUMMY_DESIGNERS) {
            const dId = designer.id;
            if (!newSchedules[dId])
                continue;
            // Iteratively fill each target day (Mon-Thu) from subsequent days (up to Fri)
            for (let targetDay = 0; targetDay < 4; targetDay++) {
                const targetDayStr = targetDay.toString();
                for (let sourceDay = targetDay + 1; sourceDay < 5; sourceDay++) {
                    const sourceDayStr = sourceDay.toString();
                    const sourceTasks = newSchedules[dId][sourceDayStr] || [];
                    if (sourceTasks.length === 0)
                        continue;
                    // Calculate current hours in the target day
                    let targetHours = sumTaskHours(currentTasks, newSchedules[dId][targetDayStr] || []);
                    if (targetHours >= DAILY_CAPACITY)
                        break;
                    const keptInSource = [];
                    const originalSourceLength = sourceTasks.length;
                    for (const tid of sourceTasks) {
                        const taskInfo = currentTasks[tid];
                        const taskH = taskInfo?.estimatedHours || 0;
                        // Keep split parts in their assigned sequence instead of re-packing them.
                        if (taskInfo?.parentId && taskInfo?.totalParts && taskInfo.totalParts > 1) {
                            keptInSource.push(tid);
                            continue;
                        }
                        // Only move if it fits in the 8h daily capacity
                        if (targetHours + taskH <= DAILY_CAPACITY) {
                            if (!newSchedules[dId][targetDayStr])
                                newSchedules[dId][targetDayStr] = [];
                            newSchedules[dId][targetDayStr].push(tid);
                            targetHours += taskH;
                            changed = true;
                        }
                        else {
                            keptInSource.push(tid);
                        }
                    }
                    if (keptInSource.length !== originalSourceLength) {
                        newSchedules[dId][sourceDayStr] = keptInSource;
                    }
                }
            }
        }
        return { optimized: newSchedules, changed };
    };
    // Automatically optimize schedule whenever it changes
    useEffect(() => {
        const { optimized, changed } = getOptimizedSchedule(schedules, tasks);
        if (changed) {
            setSchedules(optimized);
        }
    }, [schedules, tasks]);
    useEffect(() => {
        const snapshot = buildSchedulerSnapshot(tasks, schedules);
        try {
            localStorage.setItem(SCHEDULER_DASHBOARD_SYNC_KEY, JSON.stringify(snapshot));
            window.dispatchEvent(new CustomEvent(SCHEDULER_DASHBOARD_SYNC_EVENT, { detail: snapshot }));
        }
        catch (error) {
            console.error("Unable to sync scheduler snapshot", error);
        }
    }, [tasks, schedules]);
    // Get total hours for a specific day slot
    const getDayHours = (designerId, dayIndex) => sumTaskHours(tasks, (schedules[designerId] || {})[dayIndex.toString()] || []);
    const getDesignerBookedHours = (designerId) => {
        const days = schedules[designerId] || {};
        return WEEKDAY_INDICES.reduce((acc, dayIdx) => {
            const dayTasks = days[dayIdx.toString()] || [];
            return acc + sumTaskHours(tasks, dayTasks);
        }, 0);
    };
    const isDesignerOverloaded = (designerId) => {
        return WEEKDAY_INDICES.some((dayIndex) => getDayHours(designerId, dayIndex) > DAILY_CAPACITY);
    };
    const totalScheduledHours = useMemo(() => DUMMY_DESIGNERS.reduce((acc, designer) => {
        const days = schedules[designer.id] || {};
        const designerTotal = WEEKDAY_INDICES.reduce((dayAcc, dayIdx) => {
            const dayTasks = days[dayIdx.toString()] || [];
            return dayAcc + sumTaskHours(tasks, dayTasks);
        }, 0);
        return acc + designerTotal;
    }, 0), [schedules, tasks]);
    const totalDesignersCount = DUMMY_DESIGNERS.length;
    const overloadedCount = useMemo(() => DUMMY_DESIGNERS.filter((designer) => WEEKDAY_INDICES.some((dayIndex) => {
        const dayTasks = (schedules[designer.id] || {})[dayIndex.toString()] || [];
        return sumTaskHours(tasks, dayTasks) > DAILY_CAPACITY;
    })).length, [schedules, tasks]);
    const totalScheduledTaskCount = useMemo(() => Object.values(schedules).reduce((acc, curr) => acc + Object.values(curr).flat().length, 0), [schedules]);
    return (<div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar 
        currentDate={currentDate}
        onCalendarChange={setCurrentDate}
        dateRangeText={dateRangeText}
      />

      <div className="relative z-10 flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="w-64 border-r border-slate-200 pr-4">Unassigned &amp; On-HOLD</div>
        <div className="flex-1 flex px-6 justify-between items-center max-w-4xl">
          <div><span className="mr-1 font-medium text-slate-500">Designers:</span>{totalDesignersCount}</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-green-400 rounded-sm"></div> Scheduled: {totalScheduledTaskCount}</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-orange-400 rounded-sm"></div> Total Hours: {totalScheduledHours}h</div>
          <div className="flex items-center gap-2 text-red-500"><AlertTriangle size={14}/> Overloaded: {overloadedCount}</div>
          <div className="flex items-center gap-2 ml-2">
            <button type="button" onClick={() => setViewMode("week")} className={`ui-chip-button ${viewMode === "week" ? "ui-chip-button-active" : ""}`}>
              Week
            </button>
            <button type="button" onClick={() => {
            const weekdayCurrentDay = isWeekdayIndex(currentDay) ? currentDay : WEEKDAY_INDICES[0];
            setViewMode("custom");
            setCurrentDay(weekdayCurrentDay);
            setSelectedDays([weekdayCurrentDay]);
        }} className={`ui-chip-button ${viewMode === "custom" ? "ui-chip-button-active" : ""}`}>
              Custom
            </button>
          </div>
        </div>
      </div>
      {viewMode === "custom" && (<div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-6 py-2 text-xs">
          <div className="w-64 border-r border-slate-200 pr-4 font-medium text-slate-500">Visible Days</div>
          <div className="flex-1 flex items-center gap-1 px-6">
            {WEEKDAY_INDICES.map((dayIndex) => {
                const label = weekDates[dayIndex].toLocaleDateString("en-US", { weekday: "short" });
                const active = selectedDays.includes(dayIndex);
                return (<button key={`selector-${dayIndex}`} type="button" onClick={() => handleDayToggle(dayIndex)} className={`px-2 py-1 rounded border transition-colors ${active
                      ? "ui-chip-button ui-chip-button-active"
                        : "ui-chip-button"}`}>
                  {active ? "✓ " : ""}{label}
                </button>);
            })}
          </div>
        </div>)}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col" onDragOver={handleDragOver} onDrop={(e) => handleDropToPanel(e, "unassigned")}>
          <div className="p-4 flex flex-col h-full">
             <div className="flex items-center justify-between font-semibold text-slate-900 mb-2 text-xl tracking-tight">
               Design Tasks
             </div>
             <div className="flex gap-4 text-xs font-medium text-gray-500 mb-4">
               <span className="flex items-center gap-1"><ClockIcon /> {unassignedTasks.reduce((acc, t) => acc + t.estimatedHours, 0) + onHoldTasks.reduce((acc, t) => acc + t.estimatedHours, 0)}h</span>
               <span>{unassignedTasks.length + onHoldTasks.length} Tasks</span>
               {onHoldTasks.length > 0 && <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={12}/> {onHoldTasks.length}</span>}
             </div>

             <div className="relative mb-6">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search tasks..." className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"/>
             </div>

             <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pb-4 custom-scrollbar">
                {onHoldTasks.map(task => (<div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id, "on-hold")} onDragEnd={() => setDropIndicator(null)} onClick={() => router.push(`/design-list/record/${encodeURIComponent(task.id)}?from=design-scheduler`)} className={`p-2 rounded cursor-grab active:cursor-grabbing flex flex-col relative bg-white shadow-sm hover:shadow-md transition-shadow ${task.colorClass}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[11px] leading-tight pr-5">{getTaskLabel(task)}</span>
                      <button className="bg-gray-200 hover:bg-gray-300 rounded-full p-0.5 text-gray-600 transition-colors absolute right-1.5 top-1.5">
                        <PauseCircle size={10}/>
                      </button>
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5">{task.tag}</div>
                    <div className="text-[9px] font-bold mt-1.5 bg-slate-100 text-slate-600 inline-block px-1.5 py-0.5 rounded uppercase self-start">Hold: {task.holdTime}</div>
                  </div>))}

                {unassignedTasks.map(task => (<div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id, "unassigned")} onDragEnd={() => setDropIndicator(null)} onClick={() => router.push(`/design-list/record/${encodeURIComponent(task.id)}?from=design-scheduler`)} className={`p-2 rounded cursor-grab active:cursor-grabbing flex flex-col relative group bg-white shadow-sm hover:shadow-md transition-shadow ${task.colorClass}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[11px] leading-tight pr-5">{getTaskLabel(task)}</span>
                      <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full p-0.5 absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus size={10}/>
                      </button>
                    </div>
                    <div className="text-[10px] opacity-80 mt-0.5">{task.tag}</div>
                  </div>))}
             </div>
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <div className={`flex-1 ${layoutMode === "horizontal-scroll" ? "overflow-x-auto overflow-y-auto" : "overflow-auto"}`}>
            <div className="min-w-[800px]">
              {/* Grid Header */}
              <div className="ui-table-header sticky top-0 z-20 flex border border-slate-200 bg-slate-100 shadow-sm">
                <div className="w-[180px] shrink-0 px-4 py-2 border-r border-slate-200 flex items-center">DESIGNER</div>
                <div className="flex-1 grid" style={{
            gridTemplateColumns: layoutMode === "single-column"
                ? "minmax(0, 1fr)"
                : `repeat(${visibleDays.length}, minmax(160px, 1fr))`,
        }}>
                  {visibleDays.map((dayIndex) => {
            const date = weekDates[dayIndex];
            const isWeekend = dayIndex >= 5;
            return (<button key={`header-day-${dayIndex}`} type="button" onClick={() => viewMode === "custom" && handleDayToggle(dayIndex)} className={`px-2 py-2 text-center border-r ${isWeekend ? 'border-orange-100 bg-gray-100 text-gray-400' : 'border-gray-200'} ${viewMode === "custom" ? "cursor-pointer hover:bg-indigo-50/70 transition-colors" : "cursor-default"}`} title={viewMode === "custom" ? "Toggle day visibility" : undefined}>
                        {date.toLocaleDateString("en-US", { weekday: "short" })} <span className={`font-normal ml-1 ${isWeekend ? 'text-gray-400' : 'text-gray-400'}`}>{date.getDate()}</span>
                        {isWeekend && <span className="block text-[8px] text-gray-400 font-normal normal-case tracking-wide">Holiday</span>}
                      </button>);
        })}
                </div>
              </div>
              
              {/* Designers Rows */}
              <div className="flex flex-col">
                {DUMMY_DESIGNERS.map((designer) => {
            const booked = getDesignerBookedHours(designer.id);
            const overloaded = isDesignerOverloaded(designer.id);
            const designerDays = schedules[designer.id] || {};
            return (<div key={designer.id} className="flex border-b border-gray-100 group relative min-h-[56px] items-stretch">
                      {/* Left: Designer Info */}
                      <div className="w-[180px] shrink-0 py-1.5 px-3 flex items-center gap-2 border-r border-gray-200 bg-white z-10 transition-colors group-hover:bg-blue-50 cursor-pointer" onClick={() => {
                          const routeData = buildDesignerSnapshot(tasks, designerDays);
                          sessionStorage.setItem(`designer_data_${designer.id}`, JSON.stringify(routeData));
                          router.push(`/designer/${designer.id}`);
                      }} title={`Open ${designer.name}'s dashboard`}>
                        <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold leading-none shrink-0 shadow-sm">
                          {designer.initials}
                        </div>
                        <div className="flex flex-col overflow-hidden w-full justify-center">
                          <span className="text-[11px] font-semibold text-gray-900 truncate tracking-tight">{designer.name}</span>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-1 bg-gray-100 border border-gray-200 rounded-full mt-0.5 overflow-hidden">
                               <div className={`h-full rounded-full transition-all ${overloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((booked / WEEKLY_CAPACITY) * 100, 100)}%` }}></div>
                            </div>
                            <span className={`text-[9px] font-bold mt-0.5 ${overloaded ? 'text-red-500' : 'text-gray-400'}`}>{booked}h</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Explicit Day Zones */}
                      <div className="flex-1 grid relative" style={{
                    gridTemplateColumns: layoutMode === "single-column"
                        ? "minmax(0, 1fr)"
                        : `repeat(${visibleDays.length}, minmax(160px, 1fr))`,
                }}>
                        {visibleDays.map(dayIndex => {
                    const rawTasksInDay = designerDays[dayIndex.toString()] || [];
                    const tasksInDay = designer.id === "d1" && dayIndex === 0
                        ? rawTasksInDay.slice(0, 8)
                        : rawTasksInDay;
                    const isWeekend = dayIndex >= 5;
                    const dayHours = getDayHours(designer.id, dayIndex);
                    const isDayOverloaded = dayHours > DAILY_CAPACITY;
                    const gravityPct = Math.min((dayHours / DAILY_CAPACITY) * 100, 100);
                    return (<div key={dayIndex} className={`border-r relative flex flex-col transition-colors overflow-hidden
                                ${isWeekend
                            ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                            : isDayOverloaded
                                ? 'border-gray-100 bg-red-50/40'
                                : 'border-gray-100 hover:bg-blue-50/30'}
                              `} onDragOver={isWeekend ? undefined : handleDragOver} onDrop={isWeekend ? undefined : (e) => handleDropToDay(e, designer.id, dayIndex)}>
                              {/* Gravity fill bar (background) — weekdays only */}
                              {!isWeekend && dayHours > 0 && (<div className={`absolute bottom-0 left-0 right-0 transition-all opacity-20 ${isDayOverloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ height: `${gravityPct}%` }}/>)}
                              {/* Tasks list (single horizontal lane; auto-fit within cell width) */}
                              <div className="flex-1 min-h-0 p-1 relative z-10">
                                {isWeekend ? (<div className="w-full h-full flex items-center justify-center">
                                    <span className="text-[8px] text-gray-400 font-medium select-none">—</span>
                                  </div>) : (<div className="h-full overflow-hidden">
                                    <div className="h-full w-full flex flex-nowrap items-center gap-1 pr-0.5">
                                    {tasksInDay.map((taskId, idx) => {
                                const taskInfo = tasks[taskId];
                                if (!taskInfo)
                                    return null;
                                const taskWidth = `calc((100% - ${(Math.max(tasksInDay.length - 1, 0)) * 4}px) / ${Math.max(tasksInDay.length, 1)})`;
                                return (<div key={`${taskId}-${designer.id}-${dayIndex}-${idx}`} draggable onDragStart={(e) => {
                                        handleDragStart(e, taskId, designer.id, dayIndex.toString());
                                        setCurrentDay(dayIndex);
                                    }} onDragEnd={() => setDropIndicator(null)} onDragOver={(e) => {
                                        e.stopPropagation();
                                        handleTaskDragOver(e, designer.id, dayIndex, idx);
                                    }} onDrop={(e) => {
                                        e.stopPropagation();
                                        handleDropToDay(e, designer.id, dayIndex, idx, getDropPosition(e, e.currentTarget));
                                    }} onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/design-list/record/${encodeURIComponent(taskId)}?from=design-scheduler`);
                                    }} className={`h-[24px] min-w-0 rounded flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow ${dropIndicator &&
                                        dropIndicator.designerId === designer.id &&
                                        dropIndicator.dayIndex === dayIndex &&
                                        dropIndicator.taskIndex === idx
                                        ? dropIndicator.position === "before"
                                            ? "ring-2 ring-blue-400 ring-offset-1"
                                            : "ring-2 ring-green-400 ring-offset-1"
                                        : ""} ${taskInfo.colorClass}`} style={{ width: taskWidth, maxWidth: taskWidth }} title={`${getTaskLabel(taskInfo)} (${taskInfo.estimatedHours}h)`}>
                                          <div className="text-[9px] font-semibold truncate leading-none mr-1 select-none">{getTaskLabel(taskInfo)}</div>
                                          <div className="text-[8px] font-bold opacity-60 bg-black/5 rounded px-1 shrink-0">{taskInfo.estimatedHours}h</div>
                                        </div>);
                            })}
                                    </div>
                                  </div>)}
                              </div>
                              {/* Day hours indicator — weekdays only */}
                              {!isWeekend && dayHours > 0 && (<div className={`text-[8px] font-bold text-center pb-0.5 relative z-10 ${isDayOverloaded ? 'text-red-600' : 'text-blue-500/70'}`}>
                                  {dayHours}/{DAILY_CAPACITY}h
                                </div>)}
                            </div>);
                })}
                      </div>
                    </div>);
        })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
function ClockIcon() {
    return (<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>);
}
