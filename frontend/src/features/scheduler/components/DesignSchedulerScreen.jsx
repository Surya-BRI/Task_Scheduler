"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Search, Plus, PauseCircle, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import {
    SCHEDULER_DASHBOARD_SYNC_EVENT,
    SCHEDULER_DASHBOARD_SYNC_KEY,
    buildDesignerSnapshot,
    buildSchedulerSnapshot
} from "../utils/designerDashboardSync";
import {
    getSchedulerWeekMeta,
    listSchedulerAssignmentsForWeek,
    saveSchedulerWeekSnapshot,
} from "../services/scheduler-assignments.api";
import {
    DEFAULT_SCHEDULER_REFERENCE_DATE,
    formatSchedulerDateRangeText,
    getCurrentDayIndex,
    getWeekDays,
} from "../utils/schedulerWeek";
import { FROM_DESIGN_SCHEDULER, taskViewPathForRecord } from "@/lib/design-list-routes";
import { apiClient } from "@/lib/api-client";
import { mapTaskToDesignRow } from "@/features/design-list/task-view-model";
// Capacity constants
const DAILY_CAPACITY = 8; // 8hrs per day = normal capacity (green/blue)
const MAX_DAILY_HOURS = 12; // absolute max assignable per day
const WEEKLY_CAPACITY = 40; // 5 working days × 8hrs
const WEEKDAY_INDICES = [0, 1, 2, 3, 4];
const ALL_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
const isWeekdayIndex = (dayIndex) => WEEKDAY_INDICES.includes(dayIndex);
const cloneState = (value) => JSON.parse(JSON.stringify(value));
const sumTaskHours = (taskMap, taskIds) => taskIds.reduce((acc, taskId) => acc + (taskMap[taskId]?.estimatedHours || 0), 0);

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
    const visibleWeekdays = [...visibleDays].filter((d) => d < 5).sort((a, b) => a - b);
    let remainingHours = droppedTask.estimatedHours;
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
            if (availableHours === 0) {
                currentDayIndex = nextVisibleWeekdayAfter(currentDayIndex, visibleWeekdays) ?? 7;
                continue;
            }
            partHours = Math.min(remainingHours, availableHours);
            if (partHours > regularHoursLeft) {
                hasOvertimeFlag = true;
            }
        } else if (regularHoursLeft === 0) {
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
            opNo: record.opNo || "",
            estimatedHours: Number(record.estimatedHours) > 0 ? Number(record.estimatedHours) : (idx % 3) + 2,
            status,
            colorClass: status === "ON_HOLD" || status === "unassigned" && idx % 3 === 0
                ? "bg-slate-50 border border-slate-200 text-slate-700"
                : TASK_COLORS[idx % TASK_COLORS.length],
            baseName: record.name,
            holdStartedAt: status === "ON_HOLD"
                ? (record.holdStartedAt instanceof Date ? record.holdStartedAt : record.updatedAt)
                : undefined,
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
            opNo: record.opNo || "",
            estimatedHours: Number(record.estimatedHours) > 0 ? Number(record.estimatedHours) : (idx % 3) + 2,
            status: sourceStatus === "ON_HOLD" ? "ON_HOLD" : "unassigned",
            colorClass: TASK_COLORS[idx % TASK_COLORS.length],
            baseName: record.name,
            holdStartedAt: sourceStatus === "ON_HOLD"
                ? (record.holdStartedAt instanceof Date ? record.holdStartedAt : record.updatedAt)
                : undefined,
        };
    });
    const assignedIds = new Set();
    for (const row of rows) {
        const designerId = String(row.designerId ?? "").trim();
        if (!designerId)
            continue;
        const dayIdx = Number(row.dayIndex);
        if (!Number.isFinite(dayIdx) || dayIdx < 0 || dayIdx > 6)
            continue;
        if (!schedulesObj[designerId]) {
            schedulesObj[designerId] = {
                "0": [],
                "1": [],
                "2": [],
                "3": [],
                "4": [],
                "5": [],
                "6": [],
            };
        }
        const dayStr = String(dayIdx);
        if (!schedulesObj[designerId][dayStr])
            schedulesObj[designerId][dayStr] = [];
        const taskId = String(row.taskId ?? "").trim();
        if (!taskId)
            continue;
        if (!schedulesObj[designerId][dayStr].includes(taskId))
            schedulesObj[designerId][dayStr].push(taskId);
        assignedIds.add(taskId);
        const baseRecord = recordById[taskId];
        const parentIdNorm = normalizeParentIdFromErp(row.parentId);
        const totalPartsNum = row.totalParts != null ? Number(row.totalParts) : 0;
        const splitTotal = totalPartsNum > 1;
        const prev = tasksObj[taskId];
        let colorIdx = 0;
        for (let i = 0; i < taskId.length; i++)
            colorIdx += taskId.charCodeAt(i);
        const baseFromRecord = baseRecord
            ? {
                id: taskId,
                name: baseRecord.name,
                tag: baseRecord.designType,
                projectName: baseRecord.projectName || "",
                designType: baseRecord.designType || "",
                priority: baseRecord.priority || "",
                baseName: baseRecord.name,
                colorClass: prev?.colorClass ?? TASK_COLORS[colorIdx % TASK_COLORS.length],
            }
            : {
                id: taskId,
                name: `Design task (${taskId.slice(0, 24)}${taskId.length > 24 ? "…" : ""})`,
                tag: "ERP",
                projectName: "",
                designType: "",
                priority: "",
                baseName: "Design task",
                colorClass: "bg-slate-100 border border-slate-200 text-slate-700",
            };
        tasksObj[taskId] = {
            ...baseFromRecord,
            estimatedHours: Number(row.assignedHours) || 0,
            status: "assigned",
            parentId: parentIdNorm,
            splitIndex: splitTotal && row.splitIndex != null ? Number(row.splitIndex) : undefined,
            totalParts: splitTotal ? totalPartsNum : undefined,
        };
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
    const [designers, setDesigners] = useState([]);
    const [queueRecords, setQueueRecords] = useState([]);

    const [tasks, setTasks] = useState({});
    const [schedules, setSchedules] = useState({});
    const [loadedFromErp, setLoadedFromErp] = useState(false);
    const [weekVersion, weekVersionRef, setWeekVersion] = useStateRef(0);
    const persistInFlightRef = useRef(false);
    const pendingPersistRef  = useRef(null);
    const flushPersistRef    = useRef(null);

    const [searchQuery, setSearchQuery] = useState("");
    const splitIdCounterRef = useRef(0);
    const cancelOvertimeButtonRef = useRef(null);
    const [viewMode, setViewMode] = useState("week");
    const [selectedDays, setSelectedDays] = useState(WEEKDAY_INDICES);
    const [currentDay, setCurrentDay] = useState(getCurrentDayIndex(new Date()));
    const [dropIndicator, setDropIndicator] = useState(null);
    
    // Custom Date selection state
    const [currentDate, setCurrentDate] = useState(DEFAULT_SCHEDULER_REFERENCE_DATE);
    useEffect(() => {
        let cancelled = false;
        apiClient.get("/users?role=DESIGNER")
            .then((res) => {
                if (cancelled) return;
                const rows = Array.isArray(res)
                    ? res.map((user) => ({
                        id: String(user?.id ?? "").trim(),
                        name: String(user?.fullName ?? "Designer"),
                        initials: toInitials(user?.fullName),
                    })).filter((d) => d.id)
                    : [];
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
                        const retailHours = task?.retailDetails?.hoursRequired;
                        const projectHours = task?.projectDetails
                            ? (Number(task.projectDetails.artworkHours) || 0) +
                              (Number(task.projectDetails.technicalHours) || 0) +
                              (Number(task.projectDetails.locationHours) || 0) +
                              (Number(task.projectDetails.asBuiltHours) || 0)
                            : 0;
                        return {
                            id: mapped.id,
                            name: mapped.name,
                            designType: task?.designType || mapped.designType || "",
                            projectName: task?.project?.name || task?.project?.projectNo || "",
                            opNo: task?.opNo || "",
                            priority: task?.priority || "",
                            status: task?.status,
                            updatedAt: task?.updatedAt,
                            holdStartedAt: task?.updatedAt,
                            estimatedHours: Number(retailHours ?? (projectHours || null) ?? task?.hoursRequired ?? task?.estimatedHours ?? 0) || 0,
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
                    const canonicalTaskId = isUuid(task.id) ? task.id : (isUuid(task.parentId) ? task.parentId : null);
                    if (!canonicalTaskId) return;
                    assignments.push({
                        designerId,
                        taskId: canonicalTaskId,
                        dayIndex,
                        assignedHours: Number(task.estimatedHours) || 0,
                        parentId: isUuid(task.parentId) ? task.parentId : null,
                        splitIndex: Number.isFinite(task.splitIndex) ? Number(task.splitIndex) : null,
                        totalParts: Number.isFinite(task.totalParts) ? Number(task.totalParts) : null,
                        notes: null,
                    });
                });
            });
        });
        return assignments.filter((a) => a.assignedHours > 0);
    };

    const reloadWeek = useCallback(async () => {
        const weekStartStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
        try {
            const [rows, meta] = await Promise.all([
                listSchedulerAssignmentsForWeek(weekStartStr),
                getSchedulerWeekMeta(weekStartStr),
            ]);
            setWeekVersion(Number(meta?.version ?? 0));
            if (Array.isArray(rows) && rows.length > 0) {
                const next = buildSchedulerStateFromErpAssignments(queueRecords, rows, designers);
                setTasks(next.tasksObj);
                setSchedules(next.schedulesObj);
                setLoadedFromErp(true);
            } else {
                const mock = buildMockSchedulerState(queueRecords, designers);
                setTasks(mock.tasksObj);
                setSchedules(mock.schedulesObj);
                setLoadedFromErp(false);
            }
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
        persistInFlightRef.current = true;
        const { schedules: s, tasks: t, weekStartStr } = pendingPersistRef.current;
        pendingPersistRef.current = null;
        try {
            const payload = {
                version: weekVersionRef.current,
                assignments: buildWeekSnapshotPayload(s, t),
            };
            const saved = await saveSchedulerWeekSnapshot(weekStartStr, payload);
            const currentWeekStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
            if (weekStartStr === currentWeekStr) {
                setWeekVersion(saved.version);
            }
        } catch (error) {
            const msg = String(error?.message ?? '');
            if (msg.includes('409')) {
                toast.warning('Week was updated by someone else — reloading. Please redo your last change.');
                reloadWeek();
            } else {
                toast.error('Unable to save scheduler changes. Please try again.');
            }
            console.warn('Unable to persist scheduler snapshot', error);
        } finally {
            persistInFlightRef.current = false;
            flushPersistRef.current?.();
        }
    }, [currentDate, reloadWeek]);
    flushPersistRef.current = flushPersist;

    const persistWeekSnapshot = useCallback((nextSchedules, nextTasks) => {
        const weekStartStr = formatLocalYyyyMmDd(getWeekDays(currentDate)[0]);
        pendingPersistRef.current = { schedules: nextSchedules, tasks: nextTasks, weekStartStr };
        flushPersist();
    }, [currentDate, flushPersist]);

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
    const getDesignListRoutingTaskId = (task) => task?.totalParts > 1 && task.parentId
        ? task.parentId
        : task?.id;
    const getNextTaskId = () => {
        splitIdCounterRef.current += 1;
        return `split-${splitIdCounterRef.current}`;
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
        // Always start from the first unfilled weekday so no day is left idle
        if (sourceId === "unassigned" || sourceId === "ON_HOLD") {
            const firstUnfilled = WEEKDAY_INDICES.find((d) => getDayHours(targetDesignerId, d) < DAILY_CAPACITY);
            if (firstUnfilled !== undefined && firstUnfilled < targetDayIndex) {
                targetDayIndex = firstUnfilled;
                targetDayStr = targetDayIndex.toString();
            }
        }
        const targetList = schedules[targetDesignerId]?.[targetDayStr] ?? [];
        const rawInsertIndex = targetTaskIndex === undefined
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
    const commitPanelDrop = (taskId, sourceId, sourceDay, newStatus) => {
        setLoadedFromErp(false);
        const taskBefore = tasks[taskId];
        const parentId = taskBefore?.parentId;
        const isSplitPart = taskBefore?.totalParts > 1 && parentId && newStatus === 'unassigned';

        // Collect all sibling split IDs sharing the same parentId
        const siblingIds = isSplitPart
            ? Object.keys(tasks).filter(id => id !== taskId && tasks[id]?.parentId === parentId)
            : [];

        const newSchedules = (sourceId === 'unassigned' || sourceId === 'ON_HOLD')
            ? schedules
            : (() => {
                const s = cloneState(schedules);
                // Remove the dragged task from its day
                if (s[sourceId]?.[sourceDay]) {
                    s[sourceId][sourceDay] = s[sourceId][sourceDay].filter(id => id !== taskId);
                }
                // Remove all orphaned sibling splits from every day
                if (siblingIds.length > 0) {
                    for (const dId of Object.keys(s)) {
                        for (const dKey of Object.keys(s[dId])) {
                            s[dId][dKey] = s[dId][dKey].filter(id => !siblingIds.includes(id));
                        }
                    }
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
            nextTasks[parentId] = {
                ...(tasks[parentId] ?? taskBefore),
                id: parentId,
                estimatedHours: totalHours,
                splitIndex: undefined,
                totalParts: undefined,
                status: 'unassigned',
                holdStartedAt: undefined,
            };
        } else {
            const nextTask = {
                ...taskBefore,
                status: newStatus,
                holdStartedAt: newStatus === "ON_HOLD" ? new Date() : undefined,
            };
            nextTasks[taskId] = nextTask;
        }

        const backendStatus = newStatus === "ON_HOLD" ? "ON_HOLD" : "PENDING";
        setTasks(nextTasks);
        if (!isUuid(taskId)) {
            persistWeekSnapshot(newSchedules, nextTasks);
            return;
        }
        apiClient.patch(`/tasks/${taskId}/status`, { status: backendStatus }).catch((error) => {
            console.warn("Unable to persist task status change", { taskId, backendStatus, error });
            toast.error("Failed to update task status. Please try again.");
        });
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
        const taskBefore = tasks[taskId];
        if (!taskBefore)
            return;
        const nextStatus = shouldHold ? "ON_HOLD" : "unassigned";
        setTasks((prev) => ({
            ...prev,
            [taskId]: {
                ...taskBefore,
                status: nextStatus,
                holdStartedAt: shouldHold ? new Date() : undefined,
            },
        }));
        const backendStatus = shouldHold ? "ON_HOLD" : "PENDING";
        if (!isUuid(taskId)) return;
        apiClient.patch(`/tasks/${taskId}/status`, { status: backendStatus }).catch((error) => {
            console.warn("Unable to persist hold toggle", { taskId, backendStatus, error });
        });
    };
    const lowerSearchQuery = searchQuery.toLowerCase();
    const unassignedTasks = useMemo(() => Object.values(tasks).filter((t) => t.status === "unassigned" && t.name.toLowerCase().includes(lowerSearchQuery)), [tasks, lowerSearchQuery]);
    const onHoldTasks = useMemo(() => Object.values(tasks).filter((t) => t.status === "ON_HOLD" && t.name.toLowerCase().includes(lowerSearchQuery)), [tasks, lowerSearchQuery]);
    // Shift tasks from later weekdays to earlier weekdays up to DAILY_CAPACITY.
    const getOptimizedSchedule = (currentSchedules, currentTasks) => {
        const newSchedules = cloneState(currentSchedules);
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
    // Automatically optimize schedule whenever it changes (skip when showing ERP snapshot)
    useEffect(() => {
        if (loadedFromErp)
            return;
        const { optimized, changed } = getOptimizedSchedule(schedules, tasks);
        if (changed) {
            setSchedules(optimized);
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
    const totalScheduledHours = useMemo(() => designers.reduce((acc, designer) => {
        const days = schedules[designer.id] || {};
        const designerTotal = WEEKDAY_INDICES.reduce((dayAcc, dayIdx) => {
            const dayTasks = days[dayIdx.toString()] || [];
            return dayAcc + sumTaskHours(tasks, dayTasks);
        }, 0);
        return acc + designerTotal;
    }, 0), [schedules, tasks]);
    const totalDesignersCount = designers.length;
    const overloadedCount = useMemo(() => designers.filter((designer) => WEEKDAY_INDICES.some((dayIndex) => {
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
            <button type="button" onClick={() => setCurrentDate((d) => { const p = new Date(d); p.setDate(p.getDate() - 7); return p; })} className="ui-chip-button px-2" title="Previous week">‹</button>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 whitespace-nowrap">{dateRangeText}</span>
            <button type="button" onClick={() => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} className="ui-chip-button px-2" title="Next week">›</button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button type="button" onClick={() => setViewMode("week")} className={`ui-chip-button ${viewMode === "week" ? "ui-chip-button-active" : ""}`}>Week</button>
            <button type="button" onClick={() => {
            const weekdayCurrentDay = isWeekdayIndex(currentDay) ? currentDay : WEEKDAY_INDICES[0];
            setViewMode("custom");
            setCurrentDay(weekdayCurrentDay);
            setSelectedDays([weekdayCurrentDay]);
        }} className={`ui-chip-button ${viewMode === "custom" ? "ui-chip-button-active" : ""}`}>Custom</button>
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
                      {(task.designType || task.opNo) && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate max-w-[70%] ${getDesignTypeChipClass(task.designType || task.opNo)}`}>
                          {task.designType || task.opNo}
                        </span>
                      )}
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        {task.estimatedHours > 0 && <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{task.estimatedHours}h</span>}
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
                      {(task.designType || task.opNo) && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate max-w-[70%] ${getDesignTypeChipClass(task.designType || task.opNo)}`}>
                          {task.designType || task.opNo}
                        </span>
                      )}
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        {task.estimatedHours > 0 && <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{task.estimatedHours}h</span>}
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
                      <div className="w-[180px] shrink-0 py-1.5 px-3 flex items-center gap-2 border-r border-slate-200 bg-white z-10 transition-colors group-hover:bg-blue-50 cursor-pointer" onClick={() => {
                          const routeData = buildDesignerSnapshot(tasks, designerDays);
                          sessionStorage.setItem(`designer_data_${designer.id}`, JSON.stringify(routeData));
                          router.push(`/designer/${designer.id}`);
                      }} title={`Open ${designer.name}'s dashboard`}>
                        <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold leading-none shrink-0 shadow-sm">
                          {designer.initials}
                        </div>
                        <div className="flex flex-col overflow-hidden w-full justify-center">
                          <span className="text-[11px] font-semibold text-slate-900 truncate tracking-tight">{designer.name}</span>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-1 bg-slate-100 border border-slate-200 rounded-full mt-0.5 overflow-hidden">
                               <div className={`h-full rounded-full transition-all ${overloaded ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((booked / WEEKLY_CAPACITY) * 100, 100)}%` }}></div>
                            </div>
                            <span className={`text-[9px] font-bold mt-0.5 ${overloaded ? 'text-red-500' : 'text-slate-400'}`}>{booked}h</span>
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
                    const tasksInDay = rawTasksInDay;
                    const isWeekend = dayIndex >= 5;
                    const dayHours = getDayHours(designer.id, dayIndex);
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
                              {/* Tasks list (single horizontal lane; auto-fit within cell width) */}
                              <div className="flex-1 min-h-0 p-1 relative z-10">
                                {isWeekend ? (<div className="w-full h-full flex items-center justify-center">
                                    <span className="text-[8px] text-slate-400 font-medium select-none">—</span>
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
              {overtimePrompt.hoursWithinNormalCapacity === 0 ? (<p className="mt-3 text-xs text-slate-600">
                  No open normal capacity on visible weekdays from this drop; split keeps the entire task off the calendar.
                </p>) : null}
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
              <button type="button" onClick={() => {
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
        }} className="ui-chip-button">
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
                <span>Removing from <span className="font-semibold text-slate-900">{unassignPrompt.designerName}</span>'s schedule</span>
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






