"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Search, Plus, PauseCircle, AlertTriangle, LayoutDashboard, Lock, Unlock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import {
    SCHEDULER_DASHBOARD_SYNC_EVENT,
    SCHEDULER_DASHBOARD_SYNC_KEY,
    buildSchedulerSnapshot
} from "../utils/designerDashboardSync";
import {
    getSchedulerWeekMeta,
    listSchedulerAssignmentsForWeek,
    saveSchedulerWeekSnapshot,
    lockSchedulerWeek,
    unlockSchedulerWeek,
    clearTaskFromSchedule,
    updateOvertimeRequestSchedulerAction,
} from "../services/scheduler-assignments.api";
import {
    DEFAULT_SCHEDULER_REFERENCE_DATE,
    formatSchedulerDateRangeText,
    getCurrentDayIndex,
    getWeekDays,
} from "../utils/schedulerWeek";
import { FROM_DESIGN_SCHEDULER, taskViewPathForRecord } from "@/lib/design-list-routes";
import { apiClient } from "@/lib/api-client";
import { connectDashboardRealtime } from "@/lib/realtime";
import { getSession } from "@/lib/mock-auth";
import { mapTaskToDesignRow } from "@/features/design-list/task-view-model";
import {
    resolveSchedulerNavState,
    snapshotSchedulerNavState,
    parseWeekStartDate,
    writeSchedulerNavState,
} from "../utils/schedulerNavigationState";
// Capacity constants
const DAILY_CAPACITY = 8; // 8hrs per day = normal capacity (green/blue)
const MAX_DAILY_HOURS = 12; // absolute max assignable per day
const WEEKLY_CAPACITY = 40; // 5 working days × 8hrs
const MIN_SPLIT_HOURS = 1; // smallest allowed split part — gaps smaller than this are skipped
const WEEKDAY_INDICES = [0, 1, 2, 3, 4];
const ALL_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const isWeekdayIndex = (dayIndex) => WEEKDAY_INDICES.includes(dayIndex);
const cloneState = (value) => JSON.parse(JSON.stringify(value));
const toPositiveHours = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const getRegularTaskHours = (task) => task?.isOvertime
    ? 0
    : toPositiveHours(task?.scheduledHours ?? task?.estimatedHours);
const getOvertimeTaskHours = (task) => task?.isOvertime
    ? toPositiveHours(task?.approvedOvertimeHours ?? task?.estimatedHours)
    : toPositiveHours(task?.approvedOvertimeHours);
const sumTaskHours = (taskMap, taskIds) => taskIds.reduce((acc, taskId) => acc + getRegularTaskHours(taskMap[taskId]), 0);
const sumTaskTotalHours = (taskMap, taskIds) => taskIds.reduce((acc, taskId) => {
    const task = taskMap[taskId];
    return acc + getRegularTaskHours(task) + getOvertimeTaskHours(task);
}, 0);

const nextVisibleWeekdayAfter = (dayIndex, candidateDays) => candidateDays.find((idx) => idx > dayIndex);

/**
 * Computes schedule/task updates after a drop onto a designer day.
 * @param {boolean} allowOvertime - If false, caps each day at DAILY_CAPACITY (normal hours only).
 */
function buildPreparedDropAssignment({
    droppedTask,
    taskId,
    targetDesignerId,
    targetDayIndex,
    targetDayStr,
    insertionIndex,
    sourceId,
    sourceDay,
    schedulesSnapshot,
    tasksSnapshot,
    visibleDays,
    getNextSplitId,
    allowOvertime,
}) {
    const updatedSchedules = cloneState(schedulesSnapshot);
    const updatedTasks = { ...tasksSnapshot };
    if (!updatedSchedules[targetDesignerId]) {
        updatedSchedules[targetDesignerId] = {};
    }
    if (!updatedSchedules[targetDesignerId][targetDayStr]) {
        updatedSchedules[targetDesignerId][targetDayStr] = [];
    }
    if (sourceId !== "unassigned" && sourceId !== "ON_HOLD") {
        if (updatedSchedules[sourceId] && updatedSchedules[sourceId][sourceDay]) {
            updatedSchedules[sourceId][sourceDay] = updatedSchedules[sourceId][sourceDay].filter((id) => id !== taskId);
        }
    }
    const parentId = droppedTask.parentId ?? droppedTask.id;
    const baseName = droppedTask.baseName ?? droppedTask.name;
    const visibleWeekdays = [...WEEKDAY_INDICES];
    let remainingHours = droppedTask.estimatedHours > 0 ? droppedTask.estimatedHours : 1;
    const plannedParts = [];
    let currentDayIndex = targetDayIndex;
    let hasOvertimeFlag = false;
    while (
        remainingHours > 0 &&
        currentDayIndex !== undefined &&
        visibleWeekdays.includes(currentDayIndex)
    ) {
        const dayKey = currentDayIndex.toString();
        if (!updatedSchedules[targetDesignerId][dayKey]) {
            updatedSchedules[targetDesignerId][dayKey] = [];
        }
        const usedHours = sumTaskHours(updatedTasks, updatedSchedules[targetDesignerId][dayKey] || []);
        const availableHours = Math.max(0, MAX_DAILY_HOURS - usedHours);
        const regularHoursLeft = Math.max(0, DAILY_CAPACITY - usedHours);

        let partHours = 0;
        if (allowOvertime) {
            if (availableHours < MIN_SPLIT_HOURS) {
                currentDayIndex = nextVisibleWeekdayAfter(currentDayIndex, visibleWeekdays) ?? 7;
                continue;
            }
            partHours = Math.min(remainingHours, availableHours);
            if (partHours > regularHoursLeft) {
                hasOvertimeFlag = true;
            }
        } else if (regularHoursLeft < MIN_SPLIT_HOURS) {
            currentDayIndex = nextVisibleWeekdayAfter(currentDayIndex, visibleWeekdays) ?? 7;
            continue;
        } else {
            partHours = Math.min(remainingHours, regularHoursLeft);
        }

        plannedParts.push({
            id: plannedParts.length === 0 ? taskId : getNextSplitId(),
            dayIndex: currentDayIndex,
            hours: partHours,
        });
        remainingHours -= partHours;
        currentDayIndex = nextVisibleWeekdayAfter(currentDayIndex, visibleWeekdays) ?? 7;
    }

    if (plannedParts.length === 0) {
        if (!allowOvertime && droppedTask.estimatedHours > 0) {
            updatedTasks[taskId] = {
                ...droppedTask,
                id: taskId,
                parentId,
                baseName,
                estimatedHours: droppedTask.estimatedHours,
                splitIndex: undefined,
                totalParts: undefined,
                status: "unassigned",
            };
            return {
                preparedAssignment: {
                    updatedSchedules,
                    updatedTasks,
                    targetDayIndex,
                },
                hasOvertime: hasOvertimeFlag,
                hoursAssignableWithinNormal: 0,
                backlogHoursIfSplit: droppedTask.estimatedHours,
            };
        }
        return null;
    }

    const backlogAfterSplitPlan = remainingHours;
    const totalParts = plannedParts.length + (remainingHours > 0 ? 1 : 0);
    const assignedWithinNormalParts = plannedParts.reduce((acc, part) => acc + part.hours, 0);
    plannedParts.forEach((part, index) => {
        updatedTasks[part.id] = {
            ...droppedTask,
            id: part.id,
            parentId,
            baseName,
            estimatedHours: part.hours,
            scheduledHours: part.hours, // override inherited scheduledHours so payload sends actual split hours
            splitIndex: totalParts > 1 ? index + 1 : undefined,
            totalParts: totalParts > 1 ? totalParts : undefined,
            status: "assigned",
        };
        const dayKey = part.dayIndex.toString();
        if (index === 0 && dayKey === targetDayStr) {
            const dayTasks = updatedSchedules[targetDesignerId][dayKey];
            const boundedIndex = Math.max(0, Math.min(insertionIndex, dayTasks.length));
            dayTasks.splice(boundedIndex, 0, part.id);
        } else {
            updatedSchedules[targetDesignerId][dayKey].push(part.id);
        }
    });
    if (remainingHours > 0) {
        const overflowId = getNextSplitId();
        updatedTasks[overflowId] = {
            ...droppedTask,
            id: overflowId,
            parentId,
            baseName,
            estimatedHours: remainingHours,
            scheduledHours: remainingHours, // override inherited scheduledHours
            splitIndex: totalParts,
            totalParts,
            status: "unassigned",
        };
    }

    return {
        preparedAssignment: {
            updatedSchedules,
            updatedTasks,
            targetDayIndex,
        },
        hasOvertime: hasOvertimeFlag,
        hoursAssignableWithinNormal: assignedWithinNormalParts,
        backlogHoursIfSplit: backlogAfterSplitPlan,
    };
}

const TASK_COLORS = [
    "bg-orange-100 border border-orange-300 text-orange-800",
    "bg-blue-100 border border-blue-300 text-blue-800",
    "bg-blue-100 border border-blue-300 text-blue-800",
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

function formatLocalYyyyMmDd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

const SCHEDULER_OVERFLOW_KEY = (weekStart) => `scheduler_overflow_v1_${weekStart}`;

// Maps assignment rows (from payload or backend response) back to frontend task IDs
// so splitIndex/totalParts can be applied to the correct task object.
// Keys by (designerId, dayIndex, taskId) to handle multiple parts with the same taskId.
function applySplitIndexFromRows(rows, schedules, tasks) {
    const result = {};
    if (!rows?.length) return result;
    const seenPerSlot = new Map();
    for (const row of rows) {
        if (row.splitIndex == null) continue;
        const slotKey = `${row.designerId}|${row.dayIndex}|${row.taskId}`;
        const matchIdx = seenPerSlot.get(slotKey) ?? 0;
        seenPerSlot.set(slotKey, matchIdx + 1);
        const dayTasks = schedules[row.designerId]?.[String(row.dayIndex)] ?? [];
        let hit = 0;
        for (const fId of dayTasks) {
            const task = tasks[fId];
            if (!task) continue;
            const canonical = isUuid(task.id) ? task.id : (isUuid(task.parentId) ? task.parentId : null);
            if (canonical !== row.taskId) continue;
            if (hit === matchIdx) {
                result[fId] = { splitIndex: row.splitIndex, totalParts: row.totalParts };
                break;
            }
            hit++;
        }
    }
    return result;
}

function addDaysToDateStr(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return formatLocalYyyyMmDd(d);
}

function pruneOldOverflowKeys(currentWeekStartStr) {
    try {
        const cutoff = new Date(currentWeekStartStr + "T00:00:00");
        cutoff.setDate(cutoff.getDate() - 28);
        const cutoffStr = formatLocalYyyyMmDd(cutoff);
        const toDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith("scheduler_overflow_v1_")) {
                const weekPart = key.replace("scheduler_overflow_v1_", "");
                if (weekPart < cutoffStr) toDelete.push(key);
            }
        }
        toDelete.forEach((k) => localStorage.removeItem(k));
    } catch { /* localStorage unavailable */ }
}

function normalizeParentIdFromErp(value) {
    if (value == null)
        return undefined;
    const t = String(value).trim();
    if (!t || /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(t))
        return undefined;
    return t;
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function toInitials(fullName) {
    const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "DX";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const DISCIPLINE_CHIP_CLASSES = {
  'Artwork':   'bg-blue-100 text-blue-700 border border-blue-200',
  'Technical': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Location':  'bg-green-100 text-green-700 border border-green-200',
  'As-Built':  'bg-purple-100 text-purple-700 border border-purple-200',
  'BIM':       'bg-teal-100 text-teal-700 border border-teal-200',
}

function getDisciplineChipClass(discipline) {
  return DISCIPLINE_CHIP_CLASSES[discipline] ?? 'bg-slate-100 text-slate-600 border border-slate-200'
}

function getDesignTypeChipClass(designType) {
    const t = String(designType ?? "").toLowerCase();
    if (t.includes("retail"))   return "bg-amber-100 text-amber-700 border border-amber-200";
    if (t.includes("project"))  return "bg-blue-100 text-blue-700 border border-blue-200";
    if (t.includes("sign"))     return "bg-violet-100 text-violet-700 border border-violet-200";
    if (t.includes("artwork") || t.includes("art")) return "bg-rose-100 text-rose-700 border border-rose-200";
    if (t.includes("technical") || t.includes("tech")) return "bg-teal-100 text-teal-700 border border-teal-200";
    if (t.includes("location")) return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    if (t.includes("plan"))     return "bg-sky-100 text-sky-700 border border-sky-200";
    return "bg-slate-100 text-slate-600 border border-slate-200";
}

function formatHoldDuration(holdStartedAt) {
    if (!(holdStartedAt instanceof Date) || Number.isNaN(holdStartedAt.getTime())) {
        return "Today";
    }
    const now = new Date();
    const start = new Date(holdStartedAt);
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 Day";
    return `${diffDays} Days`;
}

/** Same distribution as the original in-memory demo (used when ERP has no rows for that week). */
function buildMockSchedulerState(records, designers) {
    const tasksObj = {};
    const schedulesObj = {};
    designers.forEach((designer) => {
        schedulesObj[designer.id] = { "0": [], "1": [], "2": [], "3": [], "4": [] };
    });
    records.slice(0, 100).forEach((record, idx) => {
        const sourceStatus = String(record.status ?? "").toUpperCase();
        const status = sourceStatus === "ON_HOLD" ? "ON_HOLD" : "unassigned";
        tasksObj[record.id] = {
            id: record.id,
            name: record.name,
            tag: record.projectName || "",
            projectName: record.projectName || "",
            designType: record.designType || "",
            disciplineType: record.disciplineType || "",
            opNo: record.opNo || "",
            estimatedHours: Number(record.estimatedHours) || 0,
            status,
            colorClass: status === "ON_HOLD" || status === "unassigned" && idx % 3 === 0
                ? "bg-slate-50 border border-slate-200 text-slate-700"
                : TASK_COLORS[idx % TASK_COLORS.length],
            baseName: record.name,
            holdStartedAt: status === "ON_HOLD"
                ? (record.holdStartedAt instanceof Date ? record.holdStartedAt : record.updatedAt)
                : undefined,
            holdPreviousStatus: record.holdPreviousStatus || null,
        };
    });
    let assignedIdx = 0;
    const addSchedule = (d, day, count) => {
        for (let i = 0; i < count && assignedIdx < 100; i++) {
            const record = records[assignedIdx++];
            if (record)
                schedulesObj[d][day].push(record.id);
        }
    };
    return { tasksObj, schedulesObj };
}

function buildSchedulerStateFromErpAssignments(records, rows, designers) {
    const schedulesObj = {};
    designers.forEach((designer) => {
        schedulesObj[designer.id] = { "0": [], "1": [], "2": [], "3": [], "4": [] };
    });
    const recordById = {};
    records.forEach((r) => {
        recordById[r.id] = r;
    });
    const tasksObj = {};
    records.forEach((record, idx) => {
        const sourceStatus = String(record.status ?? "").toUpperCase();
        tasksObj[record.id] = {
            id: record.id,
            name: record.name,
            tag: record.projectName || "",
            projectName: record.projectName || "",
            designType: record.designType || "",
            disciplineType: record.disciplineType || "",
            opNo: record.opNo || "",
            estimatedHours: Number(record.estimatedHours) || 0,
            status: sourceStatus === "ON_HOLD" ? "ON_HOLD" : "unassigned",
            colorClass: TASK_COLORS[idx % TASK_COLORS.length],
            baseName: record.name,
            holdStartedAt: sourceStatus === "ON_HOLD"
                ? (record.holdStartedAt instanceof Date ? record.holdStartedAt : record.updatedAt)
                : undefined,
            holdPreviousStatus: record.holdPreviousStatus || null,
        };
    });
    const assignedIds = new Set();
    // Tracks how many times each taskId has been seen so far.
    // Split tasks (same taskId across multiple designers or days) each get a unique
    // frontend ID so they never overwrite each other in tasksObj.
    // First occurrence → original taskId; subsequent → "${taskId}-rp${n}".
    // buildWeekSnapshotPayload resolves these back to the canonical taskId via parentId.
    const seenTaskCount = new Map();
    for (const row of rows) {
        const designerId = String(row.designerId ?? "").trim();
        if (!designerId)
            continue;
        const dayIdx = Number(row.dayIndex);
        if (!Number.isFinite(dayIdx) || dayIdx < 0 || dayIdx > 6)
            continue;
        if (!schedulesObj[designerId]) {
            // designerId not in the known DESIGNER-role list — skip this row to avoid
            // sending a non-designer ID to the backend (which rejects with 400).
            continue;
        }
        const dayStr = String(dayIdx);
        if (!schedulesObj[designerId][dayStr])
            schedulesObj[designerId][dayStr] = [];
        const taskId = String(row.taskId ?? "").trim();
        if (!taskId)
            continue;
        const scheduledHours = toPositiveHours(row.scheduledHours ?? row.assignedHours);
        const approvedOvertimeHours = toPositiveHours(row.approvedOvertimeHours);
        if (!scheduledHours && !approvedOvertimeHours)
            continue;

        const seenCount = seenTaskCount.get(taskId) ?? 0;
        seenTaskCount.set(taskId, seenCount + 1);
        // First occurrence uses original taskId; later parts get a synthetic ID so
        // each part has its own tasksObj entry with its own assignedHours.
        const frontendId = seenCount === 0 ? taskId : `${taskId}-rp${seenCount}`;
        // Synthetic parts point back to the original taskId as parentId so
        // buildWeekSnapshotPayload can resolve the canonical taskId on save.
        const parentIdNorm = seenCount > 0 ? taskId : normalizeParentIdFromErp(row.parentId);

        assignedIds.add(taskId); // ensure original never re-appears in sidebar

        const baseRecord = recordById[taskId];
        const totalPartsNum = row.totalParts != null ? Number(row.totalParts) : 0;
        const splitTotal = totalPartsNum > 1;
        // Inherit color from the first part so all parts of a task look the same.
        const firstPartEntry = tasksObj[taskId];
        let colorIdx = 0;
        for (let i = 0; i < taskId.length; i++)
            colorIdx += taskId.charCodeAt(i);
        const baseFromRecord = baseRecord
            ? {
                id: frontendId,
                name: baseRecord.name,
                tag: baseRecord.designType,
                projectName: baseRecord.projectName || "",
                designType: baseRecord.designType || "",
                disciplineType: baseRecord.disciplineType || "",
                priority: baseRecord.priority || "",
                baseName: baseRecord.name,
                colorClass: firstPartEntry?.colorClass ?? TASK_COLORS[colorIdx % TASK_COLORS.length],
            }
            : {
                id: frontendId,
                name: `Design task (${taskId.slice(0, 24)}${taskId.length > 24 ? "…" : ""})`,
                tag: "ERP",
                projectName: "",
                designType: "",
                priority: "",
                baseName: "Design task",
                colorClass: "bg-slate-100 border border-slate-200 text-slate-700",
            };
        if (scheduledHours > 0) {
            if (!schedulesObj[designerId][dayStr].includes(frontendId))
                schedulesObj[designerId][dayStr].push(frontendId);
            assignedIds.add(frontendId);
            tasksObj[frontendId] = {
                ...baseFromRecord,
                estimatedHours: scheduledHours,
                scheduledHours,
                approvedOvertimeHours: 0,
                status: "assigned",
                parentId: parentIdNorm,
                splitIndex: splitTotal && row.splitIndex != null ? Number(row.splitIndex) : undefined,
                totalParts: splitTotal ? totalPartsNum : undefined,
            };
        }
        if (approvedOvertimeHours > 0) {
            const overtimeId = `${frontendId}-ot`;
            const overtimeRequestIds = Array.isArray(row.overtimeRequestIds)
                ? row.overtimeRequestIds.filter(Boolean)
                : (String(row.id ?? "").startsWith("overtime-") ? [String(row.id).replace(/^overtime-/, "")] : []);
            if (!schedulesObj[designerId][dayStr].includes(overtimeId))
                schedulesObj[designerId][dayStr].push(overtimeId);
            assignedIds.add(overtimeId);
            tasksObj[overtimeId] = {
                ...baseFromRecord,
                id: overtimeId,
                estimatedHours: approvedOvertimeHours,
                scheduledHours: 0,
                approvedOvertimeHours,
                status: "assigned",
                parentId: isUuid(taskId) ? taskId : parentIdNorm,
                splitIndex: undefined,
                totalParts: undefined,
                isOvertime: true,
                isLocked: true,
                overtimeRequestIds,
                colorClass: "bg-red-100 border border-red-300 text-red-800",
            };
        }
    }
    for (const id of Object.keys(tasksObj)) {
        if (!assignedIds.has(id)) {
            const sourceStatus = String(recordById[id]?.status ?? "").toUpperCase();
            tasksObj[id] = {
                ...tasksObj[id],
                status: sourceStatus === "ON_HOLD" ? "ON_HOLD" : "unassigned",
            };
        }
    }
    return { tasksObj, schedulesObj };
}

/**
 * Keeps a state value and a ref in sync automatically.
 * The ref is updated synchronously on every set call — safe to read
 * inside async callbacks without stale-closure problems.
 */
function useStateRef(initial) {
    const [state, setState] = useState(initial);
    const ref = useRef(initial);
    const set = useCallback((value) => {
        ref.current = value;
        setState(value);
    }, []);
    return [state, ref, set];
}

export function DesignSchedulerScreen() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [designers, setDesigners] = useState([]);
    const [queueRecords, setQueueRecords] = useState([]);

    const [tasks, setTasks] = useState({});
    const [schedules, setSchedules] = useState({});
    const [loadedFromErp, setLoadedFromErp] = useState(false);
    const [isWeekLocked, setIsWeekLocked] = useState(false);
    const isWeekLockedRef = useRef(false);
    const [lockInFlight, setLockInFlight] = useState(false);
    const [, weekVersionRef, setWeekVersion] = useStateRef(0);
    const persistInFlightRef      = useRef(false);
    const pendingPersistRef       = useRef(null);
    const flushPersistRef         = useRef(null);
    const persistWeekSnapshotRef  = useRef(null);

    const [searchQuery, setSearchQuery] = useState("");
    const splitIdCounterRef = useRef(0);
    const lastOptimizerSchedulesRef = useRef(null);
    const cancelOvertimeButtonRef = useRef(null);
    const [viewMode, setViewMode] = useState("week");
    const [selectedDays, setSelectedDays] = useState(WEEKDAY_INDICES);
    const [currentDay, setCurrentDay] = useState(getCurrentDayIndex(new Date()));
    const [dropIndicator, setDropIndicator] = useState(null);
    
    // Custom Date selection state
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [navStateReady, setNavStateReady] = useState(false);

    useEffect(() => {
        const restored = resolveSchedulerNavState(searchParams);
        if (!restored) {
            setNavStateReady(true);
            return;
        }

        const weekDate = restored.weekStart ? parseWeekStartDate(restored.weekStart) : null;
        if (weekDate) setCurrentDate(weekDate);
        if (restored.viewMode === "custom") {
            setViewMode("custom");
            if (restored.selectedDays?.length) {
                setSelectedDays(restored.selectedDays);
                setCurrentDay(restored.selectedDays[0]);
            }
        }
        if (restored.searchQuery != null) setSearchQuery(restored.searchQuery);
        setNavStateReady(true);
    }, [searchParams]);

    useEffect(() => {
        if (!navStateReady) return;
        writeSchedulerNavState(snapshotSchedulerNavState({
            currentDate,
            viewMode,
            selectedDays,
            searchQuery,
        }));
    }, [navStateReady, currentDate, viewMode, selectedDays, searchQuery]);

    useEffect(() => {
        let cancelled = false;
        const session = getSession();
        apiClient.get("/users?role=DESIGNER")
            .then((res) => {
                if (cancelled) return;
                const designerRows = Array.isArray(res)
                    ? res.map((user) => ({
                        id: String(user?.id ?? "").trim(),
                        name: String(user?.fullName ?? "Designer"),
                        initials: toInitials(user?.fullName),
                    })).filter((d) => d.id)
                    : [];
                const hodOption = session?.role === "HOD" && isUuid(session.id)
                    ? {
                        id: String(session.id).trim(),
                        name: String(session.name ?? "HOD").trim() || "HOD",
                        initials: toInitials(session.name ?? "HOD"),
                    }
                    : null;
                const rows = hodOption
                    ? [hodOption, ...designerRows.filter((designer) => designer.id !== hodOption.id)]
                    : designerRows;
                setDesigners(rows);
            })
            .catch(() => {
                if (cancelled) return;
                setDesigners([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        let cancelled = false;
        apiClient.get("/tasks?page=1&limit=500")
            .then((res) => {
                if (cancelled) return;
                const rows = Array.isArray(res?.data)
                    ? res.data.map((task) => {
                        const mapped = mapTaskToDesignRow(task);
                        const retailHours = task?.retailDetails?.[0]?.hoursRequired;
                        const projectHours = (task?.projectDetails ?? []).reduce(
                            (sum, d) =>
                                sum +
                                (Number(d.artworkHours) || 0) +
                                (Number(d.technicalHours) || 0) +
                                (Number(d.locationHours) || 0) +
                                (Number(d.asBuiltHours) || 0),
                            0,
                        );
                        return {
                            id: mapped.id,
                            name: mapped.name,
                            designType: task?.designType || mapped.designType || "",
                            disciplineType: task?.disciplineType || "",
                            projectName: task?.project?.name || task?.project?.projectNo || "",
                            opNo: task?.opNo || "",
                            priority: task?.priority || "",
                            status: task?.status,
                            updatedAt: task?.updatedAt,
                            holdStartedAt: task?.updatedAt,
                            estimatedHours: Math.max(1, Number(retailHours ?? (projectHours || null) ?? 0) || 0),
                        };
                    })
                    : [];
                setQueueRecords(rows);
            })
            .catch(() => {
                if (cancelled) return;
                setQueueRecords([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const buildWeekSnapshotPayload = (sourceSchedules, sourceTasks) => {
        const assignments = [];
        Object.entries(sourceSchedules || {}).forEach(([designerId, dayMap]) => {
            Object.entries(dayMap || {}).forEach(([dayStr, taskIds]) => {
                const dayIndex = Number(dayStr);
                if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) return;
                (taskIds || []).forEach((taskId) => {
                    const task = sourceTasks?.[taskId];
                    if (!task) return;
                    if (task.isOvertime) return;
                    const canonicalTaskId = isUuid(task.id) ? task.id : (isUuid(task.parentId) ? task.parentId : null);
                    if (!canonicalTaskId) return;
                    assignments.push({
                        designerId,
                        taskId: canonicalTaskId,
                        dayIndex,
                        // Use || not ?? so a zero scheduledHours falls through to estimatedHours
                        assignedHours: Number(task.scheduledHours || task.estimatedHours) || 0,
                        parentId: isUuid(task.parentId) ? task.parentId : null,
                        splitIndex: Number.isFinite(task.splitIndex) ? Number(task.splitIndex) : null,
                        totalParts: Number.isFinite(task.totalParts) ? Number(task.totalParts) : null,
                        notes: null,
                    });
                });
            });
        });
        const filtered = assignments.filter((a) => Number.isFinite(a.assignedHours) && a.assignedHours > 0);
        // Pass 1 — fix same-day duplicates (same designer+day+task, e.g. after re-assignment)
        const sameDayCount = new Map();
        filtered.forEach((a) => {
            const key = `${a.designerId}|${a.dayIndex}|${a.taskId}`;
            sameDayCount.set(key, (sameDayCount.get(key) ?? 0) + 1);
        });
        const sameDaySeen = new Map();
        filtered.forEach((a) => {
            const key = `${a.designerId}|${a.dayIndex}|${a.taskId}`;
            const count = sameDayCount.get(key) ?? 1;
            if (count > 1) {
                const idx = (sameDaySeen.get(key) ?? 0) + 1;
                sameDaySeen.set(key, idx);
                a.splitIndex = idx;
                a.totalParts = count;
                a.parentId = a.parentId ?? a.taskId;
            }
        });
        // Pass 2 — assign splitIndex/totalParts for the same task spread across different days
        // or across different designers. Group by taskId only so cross-designer splits
        // are also re-sorted — e.g. if Alexander's part moves to a later day than Benjamin's,
        // the splitIndex must reflect the new dayIndex order regardless of who holds each part.
        const crossDayGroups = new Map();
        filtered.forEach((a) => {
            if (!crossDayGroups.has(a.taskId)) crossDayGroups.set(a.taskId, []);
            crossDayGroups.get(a.taskId).push(a);
        });
        crossDayGroups.forEach((parts) => {
            if (parts.length < 2) return;
            // Sort by dayIndex so splitIndex 1 = earliest day (tie-break by designerId for stability)
            parts.sort((x, y) => x.dayIndex - y.dayIndex || x.designerId.localeCompare(y.designerId));
            const total = parts.length;
            parts.forEach((a, i) => {
                a.splitIndex = i + 1;
                a.totalParts = total;
                a.parentId = a.parentId ?? a.taskId;
            });
        });
        return filtered;
    };

    const reloadWeek = useCallback(async () => {
        const weekStartStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
        try {
            const [rows, meta] = await Promise.all([
                listSchedulerAssignmentsForWeek(weekStartStr),
                getSchedulerWeekMeta(weekStartStr),
            ]);
            setWeekVersion(Number(meta?.version ?? 0));
            const locked = Boolean(meta?.isLocked);
            setIsWeekLocked(locked);
            isWeekLockedRef.current = locked;
            // Capture fetched tasks in a local variable so the overflow restoration
            // block can use accurate hour data without relying on stale React closure state.
            let weekTasks = {};
            if (Array.isArray(rows) && rows.length > 0) {
                const next = buildSchedulerStateFromErpAssignments(queueRecords, rows, designers);
                weekTasks = next.tasksObj;
                setTasks(next.tasksObj);
                setSchedules(next.schedulesObj);
                // Skip the optimizer on reload — preserve exactly what was saved.
                // applyPreparedAssignment and commitPanelDrop set this back to false.
                setLoadedFromErp(true);
            } else {
                const mock = buildMockSchedulerState(queueRecords, designers);
                weekTasks = mock.tasksObj;
                setTasks(mock.tasksObj);
                setSchedules(mock.schedulesObj);
                setLoadedFromErp(false);
            }

            // Restore any overflow hours carried forward from the previous week.
            // Place each overflow task on the first weekday that still has capacity (sequential fill).
            try {
                const stored = localStorage.getItem(SCHEDULER_OVERFLOW_KEY(weekStartStr));
                if (stored) {
                    const entries = JSON.parse(stored);
                    if (Array.isArray(entries) && entries.length > 0) {
                        const carryTasks = Object.fromEntries(
                            entries.map(({ task }) => [task.id, { ...task, status: "assigned" }])
                        );
                        setTasks((prev) => ({ ...carryTasks, ...prev }));
                        setSchedules((prev) => {
                            const next = cloneState(prev);
                            // Merge fetched week tasks + overflow tasks so capacity checks
                            // use the real task hours, not stale closure state.
                            const allTasks = { ...weekTasks, ...carryTasks };
                            entries.forEach(({ task, designerId }) => {
                                if (!next[designerId]) next[designerId] = {};
                                // Find the first weekday that still has room
                                const firstAvailable = WEEKDAY_INDICES.find((d) => {
                                    const dayKey = d.toString();
                                    const tasksInDay = next[designerId][dayKey] ?? [];
                                    const usedHours = sumTaskHours(allTasks, tasksInDay);
                                    return usedHours < DAILY_CAPACITY;
                                }) ?? 0; // fallback to Monday if all days are full
                                const dayKey = firstAvailable.toString();
                                if (!next[designerId][dayKey]) next[designerId][dayKey] = [];
                                if (!next[designerId][dayKey].includes(task.id)) {
                                    next[designerId][dayKey].push(task.id);
                                }
                            });
                            return next;
                        });
                        localStorage.removeItem(SCHEDULER_OVERFLOW_KEY(weekStartStr));
                        // Persist the Monday placements to backend immediately.
                        setTimeout(() => {
                            setTasks((t) => {
                                setSchedules((s) => {
                                    persistWeekSnapshotRef.current?.(s, t);
                                    return s;
                                });
                                return t;
                            });
                        }, 0);
                    }
                }
            } catch { /* ignore localStorage parse errors */ }
        } catch {
            const mock = buildMockSchedulerState(queueRecords, designers);
            setTasks(mock.tasksObj);
            setSchedules(mock.schedulesObj);
            setLoadedFromErp(false);
            setWeekVersion(0);
        }
    }, [currentDate, queueRecords, designers]);

    useEffect(() => {
        pendingPersistRef.current = null;
        reloadWeek();
    }, [reloadWeek]);

    const flushPersist = useCallback(async () => {
        if (persistInFlightRef.current || !pendingPersistRef.current) return;
        if (isWeekLockedRef.current) {
            pendingPersistRef.current = null;
            return;
        }
        persistInFlightRef.current = true;
        const { schedules: s, tasks: t, weekStartStr } = pendingPersistRef.current;
        pendingPersistRef.current = null;
        try {
            const payload = {
                version: weekVersionRef.current,
                assignments: buildWeekSnapshotPayload(s, t),
            };

            // Apply corrected splitIndex/totalParts from the payload immediately so
            // the display stays in sync with what was sent (Pass 2 may have reordered
            // cross-designer splits). Match each entry by (designerId, dayIndex, taskId)
            // so parts with the same taskId don't overwrite each other.
            const splitFixMap = applySplitIndexFromRows(payload.assignments, s, t);
            if (Object.keys(splitFixMap).length > 0) {
                setTasks(prev => {
                    const next = { ...prev };
                    for (const [fId, upd] of Object.entries(splitFixMap)) {
                        if (next[fId]) next[fId] = { ...next[fId], ...upd };
                    }
                    return next;
                });
            }

            const saved = await saveSchedulerWeekSnapshot(weekStartStr, payload);
            const currentWeekStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
            if (weekStartStr === currentWeekStr) {
                setWeekVersion(saved.version);
                // Reconcile split labels: backend may have recomputed splitIndex/totalParts
                // globally (cross-week). Use same per-slot matching so parts don't overwrite
                // each other.
                if (saved.assignments?.length > 0) {
                    const backendFix = applySplitIndexFromRows(saved.assignments, s, t);
                    if (Object.keys(backendFix).length > 0) {
                        setTasks(prev => {
                            const next = { ...prev };
                            for (const [fId, upd] of Object.entries(backendFix)) {
                                if (next[fId]) next[fId] = { ...next[fId], ...upd };
                            }
                            return next;
                        });
                    }
                }
            }
        } catch (error) {
            const msg = String(error?.message ?? '');
            if (msg.includes('409')) {
                toast.warning('Week was updated by someone else — reloading. Please redo your last change.');
                reloadWeek();
            } else if (msg.includes('403')) {
                // Week was locked externally — sync lock state silently
                setIsWeekLocked(true);
                isWeekLockedRef.current = true;
            } else {
                toast.error('Unable to save scheduler changes. Please try again.');
            }
            console.warn('Unable to persist scheduler snapshot', error);
        } finally {
            persistInFlightRef.current = false;
            flushPersistRef.current?.();
        }
    }, [currentDate, reloadWeek]);
    useEffect(() => {
        flushPersistRef.current = flushPersist;
    }, [flushPersist]);

    const persistWeekSnapshot = useCallback((nextSchedules, nextTasks) => {
        const weekStartStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
        pendingPersistRef.current = { schedules: nextSchedules, tasks: nextTasks, weekStartStr };
        flushPersist();

        // Carry split-overflow tasks to Monday of next week for the same designer.
        try {
            const nextWeekStart = addDaysToDateStr(weekStartStr, 7);
            const overflowEntries = [];
            Object.values(nextTasks).forEach((t) => {
                if (t.status !== "unassigned" || !isUuid(t.parentId)) return;
                // Find which designer owns a sibling part of this split in the current schedule.
                let ownerDesignerId = null;
                for (const [dId, dayMap] of Object.entries(nextSchedules)) {
                    for (const taskIds of Object.values(dayMap)) {
                        if (taskIds.some((tid) => {
                            const st = nextTasks[tid];
                            return st && (tid === t.parentId || st.parentId === t.parentId);
                        })) {
                            ownerDesignerId = dId;
                            break;
                        }
                    }
                    if (ownerDesignerId) break;
                }
                if (ownerDesignerId) {
                    overflowEntries.push({ task: t, designerId: ownerDesignerId });
                }
            });

            if (overflowEntries.length > 0) {
                localStorage.setItem(SCHEDULER_OVERFLOW_KEY(nextWeekStart), JSON.stringify(overflowEntries));
            } else {
                localStorage.removeItem(SCHEDULER_OVERFLOW_KEY(nextWeekStart));
            }
            pruneOldOverflowKeys(weekStartStr);
        } catch { /* localStorage unavailable */ }
    }, [currentDate, flushPersist]);
    useEffect(() => {
        persistWeekSnapshotRef.current = persistWeekSnapshot;
    }, [persistWeekSnapshot]);

    const [overtimePrompt, setOvertimePrompt] = useState({
        open: false,
        pendingFull: null,
        pendingAvailableOnly: null,
        totalTaskHours: 0,
        hoursWithinNormalCapacity: 0,
        backlogHoursIfSplit: 0,
        splitIdCounterAfterFull: 0,
        splitIdCounterAfterSplit: 0,
    });
    const [unassignPrompt, setUnassignPrompt] = useState({
        open: false,
        taskId: null,
        taskName: '',
        estimatedHours: 0,
        sourceId: null,
        sourceDay: null,
        designerName: '',
        projectName: '',
        designType: '',
        priority: '',
    });
    // Poll every 30s — version check only, full reload only when something changed
    useEffect(() => {
        const poll = async () => {
            if (document.hidden) return;
            const weekStartStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
            try {
                const meta = await getSchedulerWeekMeta(weekStartStr);
                const serverVersion = Number(meta?.version ?? 0);
                if (serverVersion !== weekVersionRef.current) {
                    reloadWeek();
                }
            } catch {}
        };
        const id = setInterval(poll, 30_000);
        const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [currentDate, reloadWeek]);

    useEffect(() => {
        return connectDashboardRealtime({
            onDashboardRefresh: () => reloadWeek(),
        });
    }, [reloadWeek]);

    const weekDates = useMemo(() => getWeekDays(currentDate), [currentDate]);
    const dateRangeText = useMemo(() => formatSchedulerDateRangeText(weekDates), [weekDates]);
    const customVisibleDays = useMemo(() => {
        const filtered = [...new Set(selectedDays.filter(isWeekdayIndex))].sort((a, b) => a - b);
        if (filtered.length > 0)
            return filtered;
        return [isWeekdayIndex(currentDay) ? currentDay : WEEKDAY_INDICES[0]];
    }, [selectedDays, currentDay]);
    const visibleDays = viewMode === "week" ? ALL_DAY_INDICES : customVisibleDays;
    const layoutMode = visibleDays.length === 1 ? "single-column" : visibleDays.length <= 3 ? "grid" : "horizontal-scroll";
    useEffect(() => {
        if (overtimePrompt.open) {
            cancelOvertimeButtonRef.current?.focus();
        }
    }, [overtimePrompt.open]);
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
    /** Canonical design-list id for URLs: split segments share parentId with the originating task row. */
    const getDesignListRoutingTaskId = (task) => task?.parentId && task.parentId !== task.id
        ? task.parentId
        : task?.id;
    const getNextTaskId = () => {
        splitIdCounterRef.current += 1;
        return `split-${splitIdCounterRef.current}`;
    };
    const handleToggleLock = async () => {
        if (lockInFlight) return;
        const weekStartStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
        setLockInFlight(true);
        try {
            if (isWeekLocked) {
                await unlockSchedulerWeek(weekStartStr);
                setIsWeekLocked(false);
                isWeekLockedRef.current = false;
                toast.success("Week unlocked — changes are now allowed.");
            } else {
                await lockSchedulerWeek(weekStartStr);
                setIsWeekLocked(true);
                isWeekLockedRef.current = true;
                toast.success("Week locked — no further changes can be made.");
            }
        } catch {
            toast.error("Failed to change lock status. Please try again.");
        } finally {
            setLockInFlight(false);
        }
    };

    const applyPreparedAssignment = (preparedAssignment) => {
        if (!preparedAssignment)
            return;
        setLoadedFromErp(false);
        setSchedules(preparedAssignment.updatedSchedules);
        setTasks(preparedAssignment.updatedTasks);
        setCurrentDay(preparedAssignment.targetDayIndex);
        persistWeekSnapshot(preparedAssignment.updatedSchedules, preparedAssignment.updatedTasks);
    };
    const handleDropToDay = (e, targetDesignerId, targetDayIndex, targetTaskIndex, targetPosition = "after") => {
        e.preventDefault();
        setDropIndicator(null);
        if (!visibleDays.includes(targetDayIndex))
            return;
        // Block drops on weekends (Sat=5, Sun=6)
        if (targetDayIndex >= 5)
            return;
        if (isWeekLocked) {
            toast.error("This week is locked. Unlock it first to make changes.");
            return;
        }
        const taskId = e.dataTransfer.getData("taskId");
        const sourceId = e.dataTransfer.getData("sourceId");
        const sourceDay = e.dataTransfer.getData("sourceDay");
        let targetDayStr = targetDayIndex.toString();
        if (!taskId)
            return;
        if (sourceDay &&
            sourceId !== "unassigned" &&
            sourceId !== "ON_HOLD" &&
            !visibleDays.includes(Number(sourceDay)))
            return;
        const droppedTask = tasks[taskId];
        if (!droppedTask)
            return;
        if (droppedTask.isOvertime) {
            toast.info("Approved overtime blocks are managed from overtime requests.");
            return;
        }
        // Always start from the first unfilled weekday so no day is left idle — applies to all drag sources
        const firstUnfilled = WEEKDAY_INDICES.find((d) => getDayHours(targetDesignerId, d) < DAILY_CAPACITY);
        const wasRedirected = firstUnfilled !== undefined && firstUnfilled < targetDayIndex;
        if (wasRedirected) {
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            toast.info(`Placed on ${dayNames[firstUnfilled]} — fill earlier days first`);
            targetDayIndex = firstUnfilled;
            targetDayStr = targetDayIndex.toString();
        }
        const targetList = schedules[targetDesignerId]?.[targetDayStr] ?? [];
        // When redirected, always append — the original targetTaskIndex is from a different day
        const rawInsertIndex = (wasRedirected || targetTaskIndex === undefined)
            ? targetList.length
            : targetTaskIndex + (targetPosition === "after" ? 1 : 0);
        const insertionIndex = Math.max(0, Math.min(rawInsertIndex, targetList.length));
        const assignArgs = {
            droppedTask,
            taskId,
            targetDesignerId,
            targetDayIndex,
            targetDayStr,
            insertionIndex,
            sourceId,
            sourceDay,
            schedulesSnapshot: schedules,
            tasksSnapshot: tasks,
            visibleDays,
            getNextSplitId: getNextTaskId,
        };
        const splitIdBaseline = splitIdCounterRef.current;
        const fullResult = buildPreparedDropAssignment({ ...assignArgs, allowOvertime: true });
        if (!fullResult?.preparedAssignment)
            return;
        if (!fullResult.hasOvertime) {
            applyPreparedAssignment(fullResult.preparedAssignment);
            return;
        }
        const splitIdAfterFull = splitIdCounterRef.current;
        splitIdCounterRef.current = splitIdBaseline;
        const splitResult = buildPreparedDropAssignment({ ...assignArgs, allowOvertime: false });
        if (!splitResult?.preparedAssignment)
            return;
        const splitIdAfterSplit = splitIdCounterRef.current;
        splitIdCounterRef.current = splitIdBaseline;
        setOvertimePrompt({
            open: true,
            pendingFull: fullResult.preparedAssignment,
            pendingAvailableOnly: splitResult.preparedAssignment,
            totalTaskHours: droppedTask.estimatedHours,
            hoursWithinNormalCapacity: splitResult.hoursAssignableWithinNormal,
            backlogHoursIfSplit: splitResult.backlogHoursIfSplit ?? 0,
            splitIdCounterAfterFull: splitIdAfterFull,
            splitIdCounterAfterSplit: splitIdAfterSplit,
        });
    };
    const LEGACY_STATUS_MAP = { PENDING: 'DESIGN_NEW', WIP: 'IN_PROGRESS', COMPLETED: 'DESIGN_COMPLETED', REVISION: 'REWORK', APPROVED: 'CLIENT_ACCEPTED' };
    const normalizeBackendStatus = (s) => LEGACY_STATUS_MAP[s] ?? s ?? 'DESIGN_NEW';

    const commitOvertimeRequestAction = async (taskId, sourceId, sourceDay, newStatus) => {
        const taskBefore = tasks[taskId];
        const requestId = taskBefore?.overtimeRequestIds?.[0];
        if (!requestId) {
            toast.error("Unable to find the overtime request for this scheduler block.");
            return;
        }
        if (isWeekLocked) {
            toast.error("This week is locked. Unlock it first to make changes.");
            return;
        }

        const newSchedules = cloneState(schedules);
        if (sourceId !== 'unassigned' && sourceId !== 'ON_HOLD' && newSchedules[sourceId]?.[sourceDay]) {
            newSchedules[sourceId][sourceDay] = newSchedules[sourceId][sourceDay].filter(id => id !== taskId);
        }

        const nextTasks = { ...tasks };
        delete nextTasks[taskId];
        const parentId = taskBefore?.parentId;
        if (newStatus === 'ON_HOLD' && parentId && nextTasks[parentId]) {
            nextTasks[parentId] = {
                ...nextTasks[parentId],
                status: 'ON_HOLD',
                holdStartedAt: new Date(),
                holdPreviousStatus: nextTasks[parentId].status,
            };
        }

        setLoadedFromErp(false);
        setSchedules(newSchedules);
        setTasks(nextTasks);

        try {
            await updateOvertimeRequestSchedulerAction(
                requestId,
                newStatus === 'ON_HOLD' ? 'ON_HOLD' : 'UNASSIGN',
            );
            toast.success(newStatus === 'ON_HOLD'
                ? "Overtime request moved to on hold."
                : "Overtime request unassigned.");
            reloadWeek();
        } catch (error) {
            console.warn("Unable to update overtime request scheduler action", error);
            toast.error("Failed to update overtime request. Please try again.");
            reloadWeek();
        }
    };

    const commitPanelDrop = (taskId, sourceId, sourceDay, newStatus) => {
        setLoadedFromErp(false);
        const taskBefore = tasks[taskId];
        if (taskBefore?.isOvertime) {
            commitOvertimeRequestAction(taskId, sourceId, sourceDay, newStatus);
            return;
        }
        const parentId = taskBefore?.parentId;
        const siblingIds = parentId
            ? Object.keys(tasks).filter(id => id !== taskId && tasks[id]?.parentId === parentId)
            : [];
        const isSplitPart = siblingIds.length > 0 && (newStatus === 'unassigned' || newStatus === 'ON_HOLD');

        const newSchedules = (() => {
            const s = cloneState(schedules);
            // Only remove from source calendar if task came from a designer cell, not sidebar
            if (sourceId !== 'unassigned' && sourceId !== 'ON_HOLD') {
                if (s[sourceId]?.[sourceDay]) {
                    s[sourceId][sourceDay] = s[sourceId][sourceDay].filter(id => id !== taskId);
                }
            }
            // Always remove orphaned sibling splits regardless of source
            if (siblingIds.length > 0) {
                for (const dId of Object.keys(s)) {
                    for (const dKey of Object.keys(s[dId])) {
                        s[dId][dKey] = s[dId][dKey].filter(id => !siblingIds.includes(id));
                    }
                }
                // Clean this task from ALL overflow localStorage keys (not just next week)
                try {
                    const taskIdsToClean = new Set(
                        [taskId, parentId, ...siblingIds].filter(Boolean)
                    );
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (!key?.startsWith('scheduler_overflow_v1_')) continue;
                        const stored = localStorage.getItem(key);
                        if (!stored) continue;
                        const entries = JSON.parse(stored);
                        const cleaned = entries.filter(e =>
                            !taskIdsToClean.has(e.task?.id) &&
                            !taskIdsToClean.has(e.task?.parentId)
                        );
                        if (cleaned.length > 0) {
                            localStorage.setItem(key, JSON.stringify(cleaned));
                        } else {
                            localStorage.removeItem(key);
                        }
                    }
                } catch { /* localStorage unavailable */ }
            }
            return s;
        })();
        setSchedules(newSchedules);

        let nextTasks = { ...tasks };
        if (isSplitPart) {
            // Sum hours across all parts (including this one) to restore original task
            const allPartIds = [taskId, ...siblingIds];
            const totalHours = allPartIds.reduce((acc, id) => acc + (tasks[id]?.estimatedHours ?? 0), 0);
            // Remove all split IDs
            for (const id of allPartIds) delete nextTasks[id];
            // Restore the original task at full hours as unassigned
            const parentBase = tasks[parentId] ?? taskBefore;
            nextTasks[parentId] = {
                ...parentBase,
                id: parentId,
                estimatedHours: totalHours,
                splitIndex: undefined,
                totalParts: undefined,
                parentId: undefined,
                status: newStatus,
                holdStartedAt: newStatus === "ON_HOLD" ? new Date() : undefined,
                holdPreviousStatus: newStatus === "ON_HOLD"
                    ? (parentBase.status ?? taskBefore.status)
                    : parentBase.holdPreviousStatus,
            };
        } else {
            const nextTask = {
                ...taskBefore,
                status: newStatus,
                holdStartedAt: newStatus === "ON_HOLD" ? new Date() : undefined,
                holdPreviousStatus: newStatus === "ON_HOLD"
                    ? taskBefore.status
                    : taskBefore.holdPreviousStatus,
            };
            nextTasks[taskId] = nextTask;
        }

        const backendStatus = newStatus === "ON_HOLD"
            ? "ON_HOLD"
            : normalizeBackendStatus(taskBefore?.holdPreviousStatus ?? "DESIGN_NEW");
        setTasks(nextTasks);
        // For split consolidation, the canonical UUID is parentId (not the split fragment's temp ID)
        const apiTaskId = (isSplitPart && isUuid(parentId)) ? parentId : taskId;
        if (!isUuid(apiTaskId)) {
            persistWeekSnapshot(newSchedules, nextTasks);
            return;
        }
        apiClient.patch(`/tasks/${apiTaskId}/status`, { status: backendStatus }).catch((error) => {
            console.warn("Unable to persist task status change", { apiTaskId, backendStatus, error });
            toast.error("Failed to update task status. Please try again.");
        });
        // ON_HOLD: the status PATCH above already triggers cross-week scheduler cleanup in tasks.service.ts.
        // Unassign: no status change cleans the scheduler, so call explicitly to remove other-week DB rows.
        if (newStatus !== 'ON_HOLD') {
            const clearId = isUuid(parentId) ? parentId : (isUuid(apiTaskId) ? apiTaskId : null);
            if (clearId) {
                clearTaskFromSchedule(clearId).catch(() => {/* non-fatal */});
            }
        }
        persistWeekSnapshot(newSchedules, nextTasks);
    };
    const handleDropToPanel = (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("taskId");
        const sourceId = e.dataTransfer.getData("sourceId");
        const sourceDay = e.dataTransfer.getData("sourceDay");
        if (!taskId) return;
        // Sidebar→sidebar rearrangements (already unassigned/on-hold) act immediately
        if (sourceId === 'unassigned' || sourceId === 'ON_HOLD') {
            commitPanelDrop(taskId, sourceId, sourceDay, 'unassigned');
            return;
        }
        // Assigned grid task dropped onto sidebar — show confirmation modal
        const task = tasks[taskId];
        const designer = designers.find((d) => d.id === sourceId);
        setUnassignPrompt({
            open: true,
            taskId,
            taskName: task ? (task.baseName ?? task.name) : taskId,
            estimatedHours: task?.estimatedHours ?? 0,
            sourceId,
            sourceDay,
            designerName: designer?.name || '',
            projectName: task?.projectName || '',
            designType: task?.designType || task?.tag || '',
            priority: task?.priority || '',
        });
    };
    const toggleHoldState = (taskId, shouldHold) => {
        if (!tasks[taskId]) return;
        const newStatus = shouldHold ? 'ON_HOLD' : 'unassigned';
        // Route through commitPanelDrop so sibling fragments are consolidated when holding
        commitPanelDrop(taskId, tasks[taskId].status === 'ON_HOLD' ? 'ON_HOLD' : 'unassigned', undefined, newStatus);
    };
    const lowerSearchQuery = searchQuery.toLowerCase();
    const unassignedTasks = useMemo(() => Object.values(tasks).filter((t) => t.status === "unassigned" && t.name.toLowerCase().includes(lowerSearchQuery)), [tasks, lowerSearchQuery]);
    const onHoldTasks = useMemo(() => Object.values(tasks).filter((t) => t.status === "ON_HOLD" && t.name.toLowerCase().includes(lowerSearchQuery)), [tasks, lowerSearchQuery]);
    // Shift tasks from later weekdays to earlier weekdays up to DAILY_CAPACITY.
    // When a task from a later day is too large to move whole, it is split: the portion
    // that fills the gap goes to the earlier day, the remainder stays.
    const getOptimizedSchedule = (currentSchedules, currentTasks) => {
        const newSchedules = cloneState(currentSchedules);
        const newTasks = { ...currentTasks };
        let changed = false;
        for (const designer of designers) {
            const dId = designer.id;
            if (!newSchedules[dId])
                continue;
            // Iteratively fill each target day (Mon-Thu) from subsequent days (up to Fri)
            for (let targetDay = 0; targetDay < 4; targetDay++) {
                const targetDayStr = targetDay.toString();
                for (let sourceDay = targetDay + 1; sourceDay < 5; sourceDay++) {
                    const sourceDayStr = sourceDay.toString();
                    const sourceTasks = [...(newSchedules[dId][sourceDayStr] || [])];
                    if (sourceTasks.length === 0)
                        continue;
                    // Recalculate target hours using latest newTasks (includes any splits made earlier)
                    let targetHours = sumTaskHours(newTasks, newSchedules[dId][targetDayStr] || []);
                    if (targetHours >= DAILY_CAPACITY)
                        break;
                    const keptInSource = [];
                    const originalSourceLength = sourceTasks.length;
                    for (const tid of sourceTasks) {
                        const taskInfo = newTasks[tid];
                        if (taskInfo?.isOvertime) {
                            keptInSource.push(tid);
                            continue;
                        }
                        const taskH = getRegularTaskHours(taskInfo);
                        const remaining = DAILY_CAPACITY - targetHours;
                        if (remaining <= 0) {
                            keptInSource.push(tid);
                            continue;
                        }
                        if (taskH <= remaining) {
                            // Whole task fits — move it
                            if (!newSchedules[dId][targetDayStr])
                                newSchedules[dId][targetDayStr] = [];
                            newSchedules[dId][targetDayStr].push(tid);
                            targetHours += taskH;
                            changed = true;
                        } else if (remaining >= MIN_SPLIT_HOURS) {
                            // Task too large — split: fill the gap on targetDay, keep remainder on sourceDay
                            splitIdCounterRef.current += 1;
                            const splitPartId = `split-${splitIdCounterRef.current}`;
                            const canonicalParent = newTasks[tid]?.parentId || tid;
                            if (!newSchedules[dId][targetDayStr])
                                newSchedules[dId][targetDayStr] = [];
                            newSchedules[dId][targetDayStr].push(splitPartId);
                            newTasks[splitPartId] = {
                                ...newTasks[tid],
                                id: splitPartId,
                                parentId: canonicalParent,
                                estimatedHours: remaining,
                                scheduledHours: remaining,
                                status: "assigned",
                            };
                            // Shrink original task to its remaining portion
                            newTasks[tid] = {
                                ...newTasks[tid],
                                parentId: canonicalParent,
                                estimatedHours: taskH - remaining,
                                scheduledHours: taskH - remaining,
                            };
                            targetHours += remaining;
                            changed = true;
                            keptInSource.push(tid); // reduced original stays on sourceDay
                        } else {
                            // Gap < MIN_SPLIT_HOURS — leave task where it is
                            keptInSource.push(tid);
                        }
                    }
                    if (keptInSource.length !== originalSourceLength) {
                        newSchedules[dId][sourceDayStr] = keptInSource;
                    }
                }
            }
        }
        return { optimized: newSchedules, updatedTasks: newTasks, changed };
    };
    // Automatically optimize schedule whenever it changes (skip when showing ERP snapshot).
    // Guard on schedules reference: flushPersist only patches task metadata (splitIndex/totalParts)
    // via setTasks without touching schedules — those updates must not re-trigger the optimizer
    // because cloneState on the full schedule state per setTasks call is expensive with many splits.
    useEffect(() => {
        if (loadedFromErp) return;
        if (lastOptimizerSchedulesRef.current === schedules) return;
        lastOptimizerSchedulesRef.current = schedules;
        const { optimized, updatedTasks, changed } = getOptimizedSchedule(schedules, tasks);
        if (changed) {
            setSchedules(optimized);
            setTasks(updatedTasks);
            // Persist the optimizer's gap-filling splits so the backend stays in sync
            persistWeekSnapshot(optimized, updatedTasks);
        }
    }, [schedules, tasks, loadedFromErp]);
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
    const getDayOvertimeHours = (designerId, dayIndex) => {
        const dayTasks = (schedules[designerId] || {})[dayIndex.toString()] || [];
        return dayTasks.reduce((acc, taskId) => acc + getOvertimeTaskHours(tasks[taskId]), 0);
    };
    const getDesignerBookedHours = (designerId) => {
        const days = schedules[designerId] || {};
        return WEEKDAY_INDICES.reduce((acc, dayIdx) => {
            const dayTasks = days[dayIdx.toString()] || [];
            return acc + sumTaskTotalHours(tasks, dayTasks);
        }, 0);
    };
    const isDesignerOverloaded = (designerId) => {
        return WEEKDAY_INDICES.some((dayIndex) => getDayHours(designerId, dayIndex) > DAILY_CAPACITY);
    };
    const totalScheduledHours = useMemo(() => designers.reduce((acc, designer) => {
        const days = schedules[designer.id] || {};
        const designerTotal = WEEKDAY_INDICES.reduce((dayAcc, dayIdx) => {
            const dayTasks = days[dayIdx.toString()] || [];
            return dayAcc + sumTaskTotalHours(tasks, dayTasks);
        }, 0);
        return acc + designerTotal;
    }, 0), [schedules, tasks]);
    const totalDesignersCount = designers.length;
    const overloadedCount = useMemo(() => designers.filter((designer) => WEEKDAY_INDICES.some((dayIndex) => {
        const dayTasks = (schedules[designer.id] || {})[dayIndex.toString()] || [];
        return sumTaskHours(tasks, dayTasks) > DAILY_CAPACITY;
    })).length, [schedules, tasks]);
    const totalScheduledTaskCount = useMemo(() => Object.values(schedules).reduce((acc, curr) => acc + Object.values(curr).flat().length, 0), [schedules]);

    const openDesignerDashboard = useCallback((designerId) => {
        router.push(`/designer/${designerId}`);
    }, [router]);

    return (<div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar 
        currentDate={currentDate}
        onCalendarChange={setCurrentDate}
        dateRangeText={dateRangeText}
      />

      <div className="relative z-10 flex shrink-0 items-center border-b border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 sm:px-6">
        <div className="w-64 shrink-0 border-r border-slate-200 pr-4 font-medium text-slate-800">
          Unassigned &amp; On-HOLD
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
            <div><span className="mr-1 font-medium text-slate-500">Designers:</span>{totalDesignersCount}</div>
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-sm bg-green-400" /> Scheduled: {totalScheduledTaskCount}</div>
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-sm bg-orange-400" /> Total Hours: {totalScheduledHours}h</div>
            <div className="flex items-center gap-2 text-red-500"><AlertTriangle size={14}/> Overloaded: {overloadedCount}</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentDate((d) => { const p = new Date(d); p.setDate(p.getDate() - 7); return p; })} className="ui-chip-button px-2" title="Previous week">‹</button>
              <span className="whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{dateRangeText}</span>
              <button type="button" onClick={() => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} className="ui-chip-button px-2" title="Next week">›</button>
              <div className="mx-1 h-4 w-px bg-slate-200" />
              <button type="button" onClick={() => setViewMode("week")} className={`ui-chip-button ${viewMode === "week" ? "ui-chip-button-active" : ""}`}>Week</button>
              <button type="button" onClick={() => {
                const weekdayCurrentDay = isWeekdayIndex(currentDay) ? currentDay : WEEKDAY_INDICES[0];
                setViewMode("custom");
                setCurrentDay(weekdayCurrentDay);
                setSelectedDays([weekdayCurrentDay]);
              }} className={`ui-chip-button ${viewMode === "custom" ? "ui-chip-button-active" : ""}`}>Custom</button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleToggleLock}
              disabled={lockInFlight}
              className={`ui-chip-button flex items-center gap-1.5 whitespace-nowrap font-semibold ${
                isWeekLocked
                  ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              } ${lockInFlight ? "opacity-50 cursor-not-allowed" : ""}`}
              title={isWeekLocked ? "Unlock this week" : "Lock this week"}
            >
              {isWeekLocked ? <Lock size={13} /> : <Unlock size={13} />}
              {isWeekLocked ? "Locked" : "Lock Week"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/designer/leave-planner")}
              className="ui-chip-button border border-[#f8d2d2] bg-[#fce8e6] font-semibold text-[#af5b5b] hover:bg-[#fbd8d8] whitespace-nowrap"
            >
              Leave Request
            </button>
            <button
              type="button"
              onClick={() => router.push("/designer/requests#overtime")}
              className="ui-chip-button border border-[#d2d5f8] bg-[#e6e8fc] font-semibold text-[#5d5baf] hover:bg-[#d8dcfb] whitespace-nowrap"
            >
              Overtime Request
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
        <div className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col" onDragOver={handleDragOver} onDrop={(e) => handleDropToPanel(e)}>
          <div className="p-4 flex flex-col h-full">
             <div className="flex items-center justify-between font-semibold text-slate-900 mb-2 text-xl tracking-tight">
               Design Tasks
             </div>
             <div className="flex gap-4 text-xs font-medium text-slate-500 mb-4">
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
                {onHoldTasks.map(task => (<div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id, "ON_HOLD")} onDragEnd={() => setDropIndicator(null)} onClick={() => router.push(taskViewPathForRecord({ id: getDesignListRoutingTaskId(task), designType: task.designType }, { from: FROM_DESIGN_SCHEDULER }))} className={`p-3.5 rounded-lg cursor-grab active:cursor-grabbing flex flex-col relative bg-white shadow-sm hover:shadow-md transition-shadow ${task.colorClass.replace(/bg-\S+/g, "")}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[12px] leading-tight pr-5">{getTaskLabel(task)}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleHoldState(task.id, false);
                        }}
                        className="bg-slate-200 hover:bg-slate-300 rounded-full p-0.5 text-slate-600 transition-colors absolute right-1.5 top-1.5"
                      >
                        <PauseCircle size={10}/>
                      </button>
                    </div>
                    {task.projectName && <div className="text-[11px] font-semibold leading-snug mt-1">{task.projectName}</div>}
                    <div className="flex items-center justify-between mt-1.5 gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        {(task.designType || task.opNo) && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getDesignTypeChipClass(task.designType || task.opNo)}`}>
                            {task.designType || task.opNo}
                          </span>
                        )}
                        {task.disciplineType && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getDisciplineChipClass(task.disciplineType)}`}>
                            {task.disciplineType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{`${task.estimatedHours}h`}</span>
                      </div>
                    </div>
                    <div className="text-[9px] font-bold mt-1.5 bg-red-100 text-red-600 inline-block px-1.5 py-0.5 rounded uppercase self-start">Hold: {formatHoldDuration(task.holdStartedAt)}</div>
                  </div>))}

                {unassignedTasks.map(task => (<div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id, "unassigned")} onDragEnd={() => setDropIndicator(null)} onClick={() => router.push(taskViewPathForRecord({ id: getDesignListRoutingTaskId(task), designType: task.designType }, { from: FROM_DESIGN_SCHEDULER }))} className={`p-3 rounded cursor-grab active:cursor-grabbing flex flex-col relative group bg-white shadow-sm hover:shadow-md transition-shadow ${task.colorClass.replace(/bg-\S+/g, "")}`}>
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-[12px] leading-tight pr-5">{getTaskLabel(task)}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleHoldState(task.id, true);
                        }}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full p-0.5 absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Plus size={10}/>
                      </button>
                    </div>
                    {task.projectName && <div className="text-[11px] font-semibold leading-snug mt-1">{task.projectName}</div>}
                    <div className="flex items-center justify-between mt-1.5 gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        {(task.designType || task.opNo) && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getDesignTypeChipClass(task.designType || task.opNo)}`}>
                            {task.designType || task.opNo}
                          </span>
                        )}
                        {task.disciplineType && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getDisciplineChipClass(task.disciplineType)}`}>
                            {task.disciplineType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{`${task.estimatedHours}h`}</span>
                      </div>
                    </div>
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
            return (<button key={`header-day-${dayIndex}`} type="button" onClick={() => viewMode === "custom" && handleDayToggle(dayIndex)} className={`px-2 py-2 text-center border-r ${isWeekend ? 'border-orange-100 bg-slate-100 text-slate-400' : 'border-slate-200'} ${viewMode === "custom" ? "cursor-pointer hover:bg-blue-50/70 transition-colors" : "cursor-default"}`} title={viewMode === "custom" ? "Toggle day visibility" : undefined}>
                        {date.toLocaleDateString("en-US", { weekday: "short" })} <span className={`font-normal ml-1 ${isWeekend ? 'text-slate-400' : 'text-slate-400'}`}>{date.getDate()}</span>
                        {isWeekend && <span className="block text-[8px] text-slate-400 font-normal normal-case tracking-wide">Holiday</span>}
                      </button>);
        })}
                </div>
              </div>
              
              {/* Designers Rows */}
              <div className="flex flex-col">
                {designers.map((designer) => {
            const booked = getDesignerBookedHours(designer.id);
            const overloaded = isDesignerOverloaded(designer.id);
            const designerDays = schedules[designer.id] || {};
            return (<div key={designer.id} className="flex border-b border-slate-100 group relative min-h-[56px] items-stretch">
                      {/* Left: Designer Info */}
                      <div
                        className="w-[180px] shrink-0 py-1.5 px-3 flex items-center gap-2 border-r border-slate-200 bg-white z-10 transition-colors group-hover:bg-blue-50 cursor-pointer"
                        onClick={() => openDesignerDashboard(designer.id)}
                        title={`Open ${designer.name}'s dashboard`}
                      >
                        <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold leading-none shrink-0 shadow-sm">
                          {designer.initials}
                        </div>
                        <div className="flex flex-col overflow-hidden w-full justify-center min-w-0">
                          <span className="text-[11px] font-semibold text-slate-900 truncate tracking-tight">{designer.name}</span>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-1 bg-slate-100 border border-slate-200 rounded-full mt-0.5 overflow-hidden">
                               <div className={`h-full rounded-full transition-all ${overloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((booked / WEEKLY_CAPACITY) * 100, 100)}%` }}></div>
                            </div>
                            <span className={`text-[9px] font-bold mt-0.5 ${overloaded ? 'text-red-500' : 'text-slate-400'}`}>{booked}h</span>
                          </div>
                        </div>
                        <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </div>

                      {/* Right: Explicit Day Zones */}
                      <div className="flex-1 grid relative" style={{
                    gridTemplateColumns: layoutMode === "single-column"
                        ? "minmax(0, 1fr)"
                        : `repeat(${visibleDays.length}, minmax(160px, 1fr))`,
                }}>
                        {visibleDays.map(dayIndex => {
                    const rawTasksInDay = designerDays[dayIndex.toString()] || [];
                    const regularTaskIds = rawTasksInDay.filter((taskId) => !tasks[taskId]?.isOvertime);
                    const overtimeTaskIds = rawTasksInDay.filter((taskId) => tasks[taskId]?.isOvertime);
                    const isWeekend = dayIndex >= 5;
                    const dayHours = getDayHours(designer.id, dayIndex);
                    const overtimeHours = getDayOvertimeHours(designer.id, dayIndex);
                    const isDayOverloaded = dayHours > DAILY_CAPACITY;
                    const gravityPct = Math.min((dayHours / DAILY_CAPACITY) * 100, 100);
                    return (<div key={dayIndex} className={`border-r relative flex flex-col transition-colors overflow-hidden
                                ${isWeekend
                            ? 'bg-slate-100 border-slate-200 cursor-not-allowed'
                            : isDayOverloaded
                                ? 'border-slate-100 bg-red-50/40'
                                : 'border-slate-100 hover:bg-blue-50/30'}
                              `} onDragOver={isWeekend ? undefined : handleDragOver} onDrop={isWeekend ? undefined : (e) => handleDropToDay(e, designer.id, dayIndex)}>
                              {/* Gravity fill bar (background) — weekdays only */}
                              {!isWeekend && dayHours > 0 && (<div className={`absolute bottom-0 left-0 right-0 transition-all opacity-20 ${isDayOverloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ height: `${gravityPct}%` }}/>)}
                              {/* Tasks list: regular assignments and approved overtime stay visually separate. */}
                              <div className="flex-1 min-h-0 p-1 relative z-10">
                                {isWeekend ? (<div className="w-full h-full flex items-center justify-center">
                                    <span className="text-[8px] text-slate-400 font-medium select-none">—</span>
                                  </div>) : (<div className="h-full min-h-[42px] overflow-hidden flex flex-col justify-center gap-1">
                                    <div className="min-h-[20px] w-full flex flex-nowrap items-center gap-1 pr-0.5">
                                    {regularTaskIds.map((taskId, idx) => {
                                const taskInfo = tasks[taskId];
                                if (!taskInfo)
                                    return null;
                                const taskWidth = `calc((100% - ${(Math.max(regularTaskIds.length - 1, 0)) * 4}px) / ${Math.max(regularTaskIds.length, 1)})`;
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
                                        router.push(taskViewPathForRecord({ id: getDesignListRoutingTaskId(taskInfo), designType: taskInfo.designType }, { from: FROM_DESIGN_SCHEDULER }));
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
                                    {overtimeTaskIds.length > 0 && (
                                      <div className="min-h-[18px] w-full rounded border border-red-200 bg-red-50/80 px-1 py-0.5">
                                        <div className="mb-0.5 text-[7px] font-bold uppercase tracking-wide text-red-500">Overtime</div>
                                        <div className="flex flex-nowrap items-center gap-1">
                                          {overtimeTaskIds.map((taskId, idx) => {
                                            const taskInfo = tasks[taskId];
                                            if (!taskInfo) return null;
                                            const taskWidth = `calc((100% - ${(Math.max(overtimeTaskIds.length - 1, 0)) * 4}px) / ${Math.max(overtimeTaskIds.length, 1)})`;
                                            return (
                                              <div
                                                key={`${taskId}-${designer.id}-${dayIndex}-ot-${idx}`}
                                                draggable
                                                onDragStart={(e) => {
                                                  handleDragStart(e, taskId, designer.id, dayIndex.toString());
                                                  setCurrentDay(dayIndex);
                                                }}
                                                onDragEnd={() => setDropIndicator(null)}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  router.push(taskViewPathForRecord({ id: getDesignListRoutingTaskId(taskInfo), designType: taskInfo.designType }, { from: FROM_DESIGN_SCHEDULER }));
                                                }}
                                                className={`h-[18px] min-w-0 rounded flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing shadow-sm ${taskInfo.colorClass}`}
                                                style={{ width: taskWidth, maxWidth: taskWidth }}
                                                title={`${getTaskLabel(taskInfo)} approved overtime (${taskInfo.approvedOvertimeHours || taskInfo.estimatedHours}h)`}
                                              >
                                                <div className="text-[8px] font-semibold truncate leading-none mr-1 select-none">{getTaskLabel(taskInfo)}</div>
                                                <div className="text-[7px] font-bold opacity-70 bg-black/5 rounded px-1 shrink-0">{taskInfo.approvedOvertimeHours || taskInfo.estimatedHours}h</div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>)}
                              </div>
                              {/* Day hours indicator — weekdays only */}
                              {!isWeekend && (dayHours > 0 || overtimeHours > 0) && (<div className={`text-[8px] font-bold text-center pb-0.5 relative z-10 ${isDayOverloaded ? 'text-red-600' : 'text-blue-500/70'}`}>
                                  {dayHours}/{DAILY_CAPACITY}h{overtimeHours > 0 ? ` + ${overtimeHours}h OT` : ''}
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
      {overtimePrompt.open ? (<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4" aria-modal="true" role="alertdialog">
          <div className="ui-surface w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900">Handle Overtime or Split Task</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Only part of this task fits in available hours. Choose how to proceed.
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">Hours breakdown</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 leading-6">
                <li>Total task duration: <strong>{overtimePrompt.totalTaskHours} h</strong></li>
                <li>
                  Assignable within normal capacity (visible weekdays):{" "}
                  <strong>{overtimePrompt.hoursWithinNormalCapacity} h</strong>
                </li>
                <li>
                  Stays unassigned/backlog if you split:{" "}
                  <strong>{overtimePrompt.backlogHoursIfSplit} h</strong>
                </li>
              </ul>
              <p className="mt-3 text-xs text-slate-600">
                Assign full uses overtime slots where needed within the weekly cap ({MAX_DAILY_HOURS}
                h/day).
              </p>
              {overtimePrompt.hoursWithinNormalCapacity === 0 && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  All weekdays are at full capacity (8 h). No hours can be assigned within the normal schedule —
                  use <strong>Assign Full (Overtime)</strong> to go beyond 8 h/day, or free up capacity first.
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button type="button" ref={cancelOvertimeButtonRef} onClick={() => setOvertimePrompt({
            open: false,
            pendingFull: null,
            pendingAvailableOnly: null,
            totalTaskHours: 0,
            hoursWithinNormalCapacity: 0,
            backlogHoursIfSplit: 0,
            splitIdCounterAfterFull: 0,
            splitIdCounterAfterSplit: 0
        })} className="ui-chip-button">
                Cancel
              </button>
              <button type="button" disabled={overtimePrompt.hoursWithinNormalCapacity === 0} onClick={() => {
            if (overtimePrompt.pendingAvailableOnly)
                applyPreparedAssignment(overtimePrompt.pendingAvailableOnly);
            splitIdCounterRef.current = overtimePrompt.splitIdCounterAfterSplit;
            setOvertimePrompt({
                open: false,
                pendingFull: null,
                pendingAvailableOnly: null,
                totalTaskHours: 0,
                hoursWithinNormalCapacity: 0,
                backlogHoursIfSplit: 0,
                splitIdCounterAfterFull: 0,
                splitIdCounterAfterSplit: 0
            });
        }} className={`ui-chip-button${overtimePrompt.hoursWithinNormalCapacity === 0 ? ' opacity-40 cursor-not-allowed' : ''}`}>
                Assign Available Only
              </button>
              <button type="button" onClick={() => {
            if (overtimePrompt.pendingFull)
                applyPreparedAssignment(overtimePrompt.pendingFull);
            splitIdCounterRef.current = overtimePrompt.splitIdCounterAfterFull;
            setOvertimePrompt({
                open: false,
                pendingFull: null,
                pendingAvailableOnly: null,
                totalTaskHours: 0,
                hoursWithinNormalCapacity: 0,
                backlogHoursIfSplit: 0,
                splitIdCounterAfterFull: 0,
                splitIdCounterAfterSplit: 0
            });
        }} className="ui-chip-button ui-chip-button-active">
                Assign Full (Overtime)
              </button>
            </div>
          </div>
        </div>) : null}
      {unassignPrompt.open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4" aria-modal="true" role="alertdialog">
          <div className="ui-surface w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900">Remove from Schedule?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Choose what to do with this task after removing it from the calendar.
            </p>
            {unassignPrompt.designerName && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  {unassignPrompt.designerName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span>Removing from <span className="font-semibold text-slate-900">{unassignPrompt.designerName}</span>&apos;s schedule</span>
              </div>
            )}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900 truncate">{unassignPrompt.taskName}</div>
              {unassignPrompt.projectName && (
                <div className="mt-1 text-xs text-slate-500 truncate">{unassignPrompt.projectName}</div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {unassignPrompt.designType && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${getDesignTypeChipClass(unassignPrompt.designType)}`}>
                    {unassignPrompt.designType}
                  </span>
                )}
                {unassignPrompt.priority && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    unassignPrompt.priority === 'High' ? 'bg-red-50 text-red-700 border-red-200' :
                    unassignPrompt.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    {unassignPrompt.priority}
                  </span>
                )}
                {unassignPrompt.estimatedHours > 0 && (
                  <span className="text-[10px] text-slate-500">{unassignPrompt.estimatedHours}h estimated</span>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnassignPrompt({ open: false, taskId: null, taskName: '', estimatedHours: 0, sourceId: null, sourceDay: null, designerName: '', projectName: '', designType: '', priority: '' })}
                className="ui-chip-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  commitPanelDrop(unassignPrompt.taskId, unassignPrompt.sourceId, unassignPrompt.sourceDay, 'ON_HOLD');
                  setUnassignPrompt({ open: false, taskId: null, taskName: '', estimatedHours: 0, sourceId: null, sourceDay: null, designerName: '', projectName: '', designType: '', priority: '' });
                }}
                className="ui-chip-button"
              >
                Move to On Hold
              </button>
              <button
                type="button"
                onClick={() => {
                  commitPanelDrop(unassignPrompt.taskId, unassignPrompt.sourceId, unassignPrompt.sourceDay, 'unassigned');
                  setUnassignPrompt({ open: false, taskId: null, taskName: '', estimatedHours: 0, sourceId: null, sourceDay: null, designerName: '', projectName: '', designType: '', priority: '' });
                }}
                className="ui-chip-button ui-chip-button-active"
              >
                Unassign Task
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>);
}
function ClockIcon() {
    return (<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>);
}






