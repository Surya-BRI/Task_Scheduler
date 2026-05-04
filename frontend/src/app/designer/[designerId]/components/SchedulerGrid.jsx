"use client";

const HOUR_COLS = [
  "0-1 HR", "1-2 HR", "2-3 HR", "3-4 HR",
  "4-5 HR", "5-6 HR", "6-7 HR", "7-8 HR",
  "8-9 HR", "9-10 HR", "10-11 HR", "11-12 HR",
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Normal hours: 0-8 (columns 0-7), Overtime: 8-12 (columns 8-11)
const NORMAL_COL_COUNT = 8;
const OVERTIME_COL_COUNT = 4;
const TOTAL_COLS = HOUR_COLS.length; // 12

const TASK_BG = {
  "#3b82f6": "bg-blue-100 border border-blue-300 text-blue-800",
  "#ef4444": "bg-red-100 border border-red-300 text-red-800",
  "#22c55e": "bg-green-100 border border-green-300 text-green-800",
  "#f59e0b": "bg-orange-100 border border-orange-300 text-orange-800",
  "#8b5cf6": "bg-purple-100 border border-purple-300 text-purple-800",
  "#1e3a5f": "bg-slate-100 border border-slate-300 text-slate-800",
};

function TaskBlock({ task }) {
  const bgClass = task.colorClass || TASK_BG[task.color] || "bg-gray-100 border border-gray-300 text-gray-800";
  return (
    <div className="h-full flex items-center w-full relative z-10 px-0.5">
      <div className={`h-[24px] w-full min-w-0 rounded flex items-center justify-between px-1 shadow-sm transition-shadow truncate ${bgClass}`}>
        <div className="text-[9px] font-semibold truncate leading-none mr-1 select-none pointer-events-none">{task.label}</div>
        <span className="text-[8px] font-bold opacity-70 shrink-0 pointer-events-none">{task.estimatedHours || (task.endHr - task.startHr)}h</span>
      </div>
    </div>
  );
}

function SchedulerRow({ day, daySlot }) {
  const isWeekend = day === "Saturday" || day === "Sunday";
  const tasks = daySlot?.tasks || [];
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

  return (
    <div className="flex border-b border-gray-100 group relative min-h-[56px] items-stretch">
      {/* Day label */}
      <div
        className={`w-[180px] shrink-0 py-1.5 px-4 flex items-center border-r border-gray-200 z-10 transition-colors group-hover:bg-gray-50 ${isWeekend ? 'bg-gray-50' : 'bg-white'}`}
      >
        <span className={`text-[11px] font-semibold truncate tracking-tight ${isWeekend ? 'text-gray-400' : 'text-gray-900'}`}>{day}</span>
      </div>

      {/* Time grid with exact hour-based positioning */}
      <div className="flex-1 relative">
        <div
          className={`h-full grid relative ${
            isWeekend ? "bg-gray-100" : "bg-white group-hover:bg-blue-50/20"
          }`}
          style={{ gridTemplateColumns: `repeat(${TOTAL_COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: TOTAL_COLS }).map((_, index) => {
            const isOvertime = index >= NORMAL_COL_COUNT;
            const isOutsideAssigned = index < boundedStart || index >= boundedEnd;
            return (
              <div
                key={`${day}-cell-${index}`}
                className={`border-r border-gray-100 ${
                  isWeekend
                    ? "bg-gray-100 border-gray-200"
                    : isOutsideAssigned
                      ? isOvertime
                        ? "bg-red-50/25"
                        : "bg-gray-50"
                      : isOvertime
                        ? "bg-red-50/40"
                        : "bg-white"
                }`}
              />
            );
          })}

          {!isWeekend && (
            <div className="absolute inset-0 pointer-events-none">
              {timelineTasks.map((task, index) => {
                const leftPct = (task.startHr / TOTAL_COLS) * 100;
                const widthPct = ((task.endHr - task.startHr) / TOTAL_COLS) * 100;
                return (
                  <div
                    key={`${day}-task-${task.id ?? task.label}-${index}`}
                    className="absolute top-1 bottom-1 pointer-events-auto"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    <TaskBlock task={task} />
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

export default function SchedulerGrid({ schedule }) {
  return (
    <div className="border border-gray-300 rounded-sm overflow-hidden text-xs">
      {/* Header row */}
      <div className="flex bg-[#f0f3fa] text-gray-600 text-xs uppercase font-semibold outline outline-1 outline-gray-200 shadow-sm" style={{ minHeight: 32 }}>
        <div className="w-[180px] shrink-0 px-4 py-2 border-r border-gray-200 flex items-center">DAY</div>
        {/* Normal hour headers */}
        {HOUR_COLS.slice(0, NORMAL_COL_COUNT).map((h) => (
          <div
            key={h}
            className="flex-1 flex items-center justify-center text-[10px] font-semibold border-r border-gray-200 px-2 text-center"
            style={{ minWidth: 0 }}
          >
            {h}
          </div>
        ))}
        {/* Overtime hour headers */}
        {HOUR_COLS.slice(NORMAL_COL_COUNT).map((h) => (
          <div
            key={h}
            className="flex-1 flex items-center justify-center text-[10px] font-semibold border-r border-gray-200 px-2 text-center bg-red-50/50"
            style={{ minWidth: 0 }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Day rows */}
      {DAYS.map((day) => (
        <SchedulerRow key={day} day={day} daySlot={schedule[day] || { tasks: [], assignedStartHr: 0, assignedEndHr: 0 }} />
      ))}
    </div>
  );
}
