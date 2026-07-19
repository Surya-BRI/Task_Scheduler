"use client";
import { useRouter } from "next/navigation";
import { Calendar, ClipboardList } from "lucide-react";
import { formatHoursAsHm } from "@/lib/format-duration";
import {
  getSystemBlockBadge,
  getSystemBlockHatchStyle,
} from "@/features/scheduler/utils/scheduler-system-block.ui";

const HOUR_COLS = [
  "0-1 HR", "1-2 HR", "2-3 HR", "3-4 HR",
  "4-5 HR", "5-6 HR", "6-7 HR", "7-8 HR",
  "8-9 HR", "9-10 HR", "10-11 HR", "11-12 HR",
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Normal hours: 0-8 (columns 0-7), Overtime: 8-12 (columns 8-11)
const NORMAL_COL_COUNT = 8;
const TOTAL_COLS = HOUR_COLS.length; // 12

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSchedulerTaskRecord(task) {
  if (!task || task.isSystemBlock) return null;
  let id = task.parentId || task.id;
  if (!id) return null;
  const idStr = String(id);
  if (!UUID_RE.test(idStr)) {
    const splitMatch = idStr.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (splitMatch) id = splitMatch[1];
    else return null;
  }
  return { id, designType: task.designType ?? null };
}

const TASK_BG = {
  "#3b82f6": "bg-blue-100 border border-blue-300 text-blue-800",
  "#ef4444": "bg-red-100 border border-red-300 text-red-800",
  "#22c55e": "bg-green-100 border border-green-300 text-green-800",
  "#f59e0b": "bg-orange-100 border border-orange-300 text-orange-800",
  "#8b5cf6": "bg-purple-100 border border-purple-300 text-purple-800",
  "#1e3a5f": "bg-slate-100 border border-slate-300 text-slate-800",
};

function SystemBlockIcon({ requestType }) {
  if (requestType === "LEAVE") {
    return <Calendar className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden="true" />;
  }
  if (requestType === "REGULARIZATION") {
    return <ClipboardList className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden="true" />;
  }
  return null;
}

function TaskBlock({ task, onOtClick, onOpenTask }) {
  const systemBadge = getSystemBlockBadge(task.requestType);
  const hatchStyle = getSystemBlockHatchStyle(task.requestType);
  const bgClass = systemBadge
    ? (task.colorClass || "")
    : task.isOvertime
      ? "bg-red-100 border border-red-300 text-red-800"
      : task.colorClass || TASK_BG[task.color] || "bg-slate-100 border border-slate-300 text-slate-800";
  const canRequestOvertime = onOtClick && !task.isSystemBlock && !task.isOvertime;
  const canOpenTask = onOpenTask && !task.isSystemBlock;
  const label = task.requestLabel || task.label;
  return (
    <div className="h-full flex items-center w-full relative z-10 px-0.5 group/task">
      <div
        className={`h-[24px] w-full min-w-0 rounded flex items-center justify-between px-1 transition-shadow truncate ${systemBadge ? "" : "shadow-sm"} ${bgClass} ${canOpenTask ? "cursor-pointer hover:shadow-md" : ""}`}
        style={hatchStyle}
        title={label}
        onClick={canOpenTask ? () => {
          const record = resolveSchedulerTaskRecord(task);
          if (!record) return;
          onOpenTask(record);
        } : undefined}
        onKeyDown={canOpenTask ? (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          const record = resolveSchedulerTaskRecord(task);
          if (!record) return;
          onOpenTask(record);
        } : undefined}
        role={canOpenTask ? "button" : undefined}
        tabIndex={canOpenTask ? 0 : undefined}
      >
        <div className="flex items-center gap-0.5 min-w-0 mr-1 select-none pointer-events-none">
          <SystemBlockIcon requestType={task.requestType} />
          {systemBadge ? (
            <span className={`text-[7px] font-bold rounded px-0.5 py-px leading-none shrink-0 ${systemBadge.className}`}>
              {systemBadge.label}
            </span>
          ) : null}
          {!systemBadge && (
            <div className="text-[9px] font-semibold truncate leading-none">{label}</div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-[8px] font-bold opacity-70">{formatHoursAsHm(task.estimatedHours || (task.endHr - task.startHr))}</span>
          {task.isOvertime && !systemBadge && (
            <span className="text-[7px] font-bold bg-red-500 text-white rounded px-0.5 py-px leading-none ml-0.5">OT</span>
          )}
          {canRequestOvertime && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOtClick(task); }}
              className="hidden group-hover/task:flex items-center text-[7px] font-bold bg-orange-400 text-white rounded px-0.5 py-px leading-none ml-0.5"
              title="Request Overtime"
            >OT</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SchedulerRow({ day, daySlot, dayDate, onOtClick, onOpenTask }) {
  const isWeekend = day === "Saturday" || day === "Sunday";
  const dayLabel = dayDate
    ? `${dayDate.toLocaleDateString("en-US", { weekday: "short" })} ${dayDate.getDate()}`
    : day;
  const tasks = daySlot?.tasks || [];
  const overflowTasks = daySlot?.overflowTasks || [];
  const assignedStartHr = daySlot?.assignedStartHr ?? 0;
  const assignedEndHr = daySlot?.assignedEndHr ?? TOTAL_COLS;
  const boundedStart = Math.max(0, Math.min(assignedStartHr, TOTAL_COLS));
  const boundedEnd = Math.max(boundedStart, Math.min(assignedEndHr, TOTAL_COLS));
  const timelineTasks = tasks
    .map((task) => ({
      ...task,
      startHr: Math.max(task.startHr ?? 0, boundedStart),
      endHr: Math.min(task.endHr ?? 0, boundedEnd),
    }))
    .filter((task) => task.endHr > task.startHr);
  const hasOvertimeTasks = timelineTasks.some((t) => t.isOvertime);
  const hasOverflow = !isWeekend && overflowTasks.length > 0;
  const rowMinHeight = hasOverflow ? 84 : 56;

  return (
    <div
      className="flex border-b border-slate-100 group relative items-stretch"
      style={{ minHeight: rowMinHeight }}
    >
      {/* Day label */}
      <div
        className={`w-[100px] shrink-0 py-1.5 px-2 flex items-center border-r border-slate-200 z-10 transition-colors group-hover:bg-slate-50 ${isWeekend ? 'bg-slate-50' : 'bg-white'}`}
      >
        <div className="min-w-0">
          <span className={`text-[11px] font-semibold truncate tracking-tight block ${isWeekend ? 'text-slate-400' : 'text-slate-900'}`}>{dayLabel}</span>
          {hasOverflow ? (
            <span className="mt-0.5 block text-[9px] font-medium text-violet-600">
              +{overflowTasks.length} reg overflow
            </span>
          ) : null}
        </div>
      </div>

      {/* Time grid with exact hour-based positioning */}
      <div className="flex-1 relative">
        <div
          className={`h-full grid relative ${
            isWeekend ? "bg-slate-100" : "bg-white group-hover:bg-blue-50/20"
          }`}
          style={{ gridTemplateColumns: `repeat(${TOTAL_COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: TOTAL_COLS }).map((_, index) => {
            const isOvertime = index >= NORMAL_COL_COUNT;
            const isOutsideAssigned = index < boundedStart || index >= boundedEnd;
            return (
              <div
                key={`${day}-cell-${index}`}
                className={`border-r border-slate-100 ${
                  isWeekend
                    ? "bg-slate-100 border-slate-200"
                    : isOutsideAssigned
                      ? isOvertime
                        ? "bg-red-50/25"
                        : "bg-slate-50"
                      : isOvertime
                        ? "bg-red-50/40"
                        : "bg-white"
                }`}
              />
            );
          })}

          {!isWeekend && hasOvertimeTasks && (
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
              style={{ left: `${(NORMAL_COL_COUNT / TOTAL_COLS) * 100}%` }}
            >
              <div className="w-px h-full bg-red-400/60" />
              <span className="absolute top-1 text-[7px] font-bold text-red-500 bg-white/90 px-0.5 rounded leading-none whitespace-nowrap -translate-x-1/2">OVERTIME</span>
            </div>
          )}
          {!isWeekend && (
            <div
              className={`absolute inset-x-0 pointer-events-none ${hasOverflow ? "top-1 h-[28px]" : "inset-y-1"}`}
            >
              {timelineTasks.map((task, index) => {
                const leftPct = (task.startHr / TOTAL_COLS) * 100;
                const widthPct = ((task.endHr - task.startHr) / TOTAL_COLS) * 100;
                return (
                  <div
                    key={`${day}-task-${task.id ?? task.label}-${index}`}
                    className="absolute top-0 bottom-0 pointer-events-auto"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    <TaskBlock task={task} onOtClick={onOtClick} onOpenTask={onOpenTask} />
                  </div>
                );
              })}
            </div>
          )}
          {hasOverflow && (
            <div className="absolute inset-x-0 bottom-1 h-[28px] pointer-events-none border-t border-dashed border-violet-200/80">
              <span className="absolute left-1 top-0 text-[7px] font-bold uppercase tracking-wide text-violet-500 leading-none">
                Reg
              </span>
              {overflowTasks.map((task, index) => {
                const leftPct = (task.startHr / TOTAL_COLS) * 100;
                const widthPct = ((task.endHr - task.startHr) / TOTAL_COLS) * 100;
                return (
                  <div
                    key={`${day}-overflow-${task.id ?? task.label}-${index}`}
                    className="absolute top-1 bottom-0 pointer-events-auto"
                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, (1 / TOTAL_COLS) * 100)}%` }}
                  >
                    <TaskBlock task={task} onOtClick={null} onOpenTask={null} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SchedulerGridSkeleton({ weekDates = [], visibleDays }) {
  return (
    <div className="border border-slate-300 rounded-sm overflow-hidden text-xs" aria-busy="true" aria-label="Loading schedule">
      <div className="flex bg-[#f0f3fa] text-slate-600 text-xs uppercase font-semibold outline outline-1 outline-slate-200 shadow-sm" style={{ minHeight: 32 }}>
        <div className="w-[100px] shrink-0 px-2 py-2 border-r border-slate-200 flex items-center">DAY</div>
        {HOUR_COLS.slice(0, NORMAL_COL_COUNT).map((h) => (
          <div
            key={`sk-h-${h}`}
            className="flex-1 flex items-center justify-center text-[10px] font-semibold border-r border-slate-200 px-0.5 text-center"
            style={{ minWidth: 0 }}
          >
            {h}
          </div>
        ))}
        {HOUR_COLS.slice(NORMAL_COL_COUNT).map((h) => (
          <div
            key={`sk-h-ot-${h}`}
            className="flex-1 flex items-center justify-center text-[10px] font-semibold border-r border-slate-200 px-0.5 text-center bg-red-50/50"
            style={{ minWidth: 0 }}
          >
            {h}
          </div>
        ))}
      </div>
      {visibleDays.map((dayIndex) => {
        const day = DAYS[dayIndex];
        if (!day) return null;
        const isWeekend = dayIndex >= 5;
        const dayDate = weekDates[dayIndex];
        const dayLabel = dayDate
          ? `${dayDate.toLocaleDateString("en-US", { weekday: "short" })} ${dayDate.getDate()}`
          : day;
        const barWidths = ["38%", "52%", "28%", "64%"];
        return (
          <div
            key={`sk-row-${day}`}
            className="flex border-b border-slate-100 items-stretch animate-pulse"
            style={{ minHeight: 56 }}
          >
            <div
              className={`w-[100px] shrink-0 py-1.5 px-2 flex items-center border-r border-slate-200 ${isWeekend ? "bg-slate-50" : "bg-white"}`}
            >
              <span className={`text-[11px] font-semibold tracking-tight ${isWeekend ? "text-slate-400" : "text-slate-900"}`}>
                {dayLabel}
              </span>
            </div>
            <div
              className={`flex-1 relative grid ${isWeekend ? "bg-slate-100" : "bg-white"}`}
              style={{ gridTemplateColumns: `repeat(${TOTAL_COLS}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: TOTAL_COLS }).map((_, index) => (
                <div
                  key={`sk-cell-${day}-${index}`}
                  className={`border-r border-slate-100 ${
                    isWeekend
                      ? "bg-slate-100 border-slate-200"
                      : index >= NORMAL_COL_COUNT
                        ? "bg-red-50/40"
                        : "bg-white"
                  }`}
                />
              ))}
              {!isWeekend && (
                <div className="absolute inset-y-1 inset-x-2 flex items-center gap-2 pointer-events-none">
                  {barWidths.map((width, i) => (
                    <div
                      key={`sk-bar-${day}-${i}`}
                      className="h-5 rounded bg-slate-200/90"
                      style={{ width }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SchedulerGrid({ schedule, weekDates = [], designerId, isDesignerMode, visibleDays, isLoading = false, onOpenTask }) {
  const router = useRouter();
  const effectiveVisibleDays = visibleDays ?? [0, 1, 2, 3, 4, 5, 6];

  const handleOtClick = isDesignerMode && designerId
    ? (task) => {
        const hrs = task.estimatedHours || (task.endHr - task.startHr) || "";
        const taskId = task.parentId || task.id || "";
        router.push(
          `/designer/requests?tab=overtime&taskId=${taskId}&estimated=${hrs}#overtime`
        );
      }
    : null;

  if (isLoading) {
    return <SchedulerGridSkeleton weekDates={weekDates} visibleDays={effectiveVisibleDays} />;
  }

  return (
    <div className="border border-slate-300 rounded-sm overflow-hidden text-xs">
      {/* Header row */}
      <div className="flex bg-[#f0f3fa] text-slate-600 text-xs uppercase font-semibold outline outline-1 outline-slate-200 shadow-sm" style={{ minHeight: 32 }}>
        <div className="w-[100px] shrink-0 px-2 py-2 border-r border-slate-200 flex items-center">DAY</div>
        {/* Normal hour headers */}
        {HOUR_COLS.slice(0, NORMAL_COL_COUNT).map((h) => (
          <div
            key={h}
            className="flex-1 flex items-center justify-center text-[10px] font-semibold border-r border-slate-200 px-0.5 text-center"
            style={{ minWidth: 0 }}
          >
            {h}
          </div>
        ))}
        {/* Overtime hour headers */}
        {HOUR_COLS.slice(NORMAL_COL_COUNT).map((h) => (
          <div
            key={h}
            className="flex-1 flex items-center justify-center text-[10px] font-semibold border-r border-slate-200 px-0.5 text-center bg-red-50/50"
            style={{ minWidth: 0 }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Day rows — filtered by visibleDays */}
      {effectiveVisibleDays.map((dayIndex) => {
        const day = DAYS[dayIndex];
        if (!day) return null;
        return (
          <SchedulerRow
            key={day}
            day={day}
            dayDate={weekDates[dayIndex]}
            daySlot={schedule[day] || { tasks: [], assignedStartHr: 0, assignedEndHr: 0 }}
            onOtClick={handleOtClick}
            onOpenTask={onOpenTask}
          />
        );
      })}
    </div>
  );
}
