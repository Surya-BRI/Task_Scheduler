"use client";
import { formatHoursAsHm } from "@/lib/format-duration";

function StatPulse({ widthClass = "w-10" }) {
  return <span className={`inline-block h-3 ${widthClass} rounded bg-slate-200 animate-pulse align-middle`} aria-hidden="true" />;
}

export default function StatsBar({ stats, isScheduleLoading = false }) {
  const {
    workLoad,
    workTill,
    monthlyTaskCount,
    weeklyCompletedCount = 0,
    pendingRegularization,
  } = stats;
  const slotCount = workLoad.tasks ?? 0;
  const hoursLabel = (!workLoad.hours || workLoad.hours === 0)
    ? "No Hours Assigned"
    : formatHoursAsHm(workLoad.hours);

  return (
    <div className="bg-white border-b border-slate-200 flex items-center flex-wrap gap-x-6 gap-y-1 px-6 py-2 text-xs shrink-0">
      {/* Scheduled slots (this week — scheduler assignments) */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          This Week Slots: {isScheduleLoading ? <StatPulse widthClass="w-6" /> : slotCount}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Workload hours (this week — scheduler assignments) */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          This Week Hours: {isScheduleLoading ? <StatPulse widthClass="w-14" /> : hoursLabel}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Work Till: last scheduled work day this week + hours on that day */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          Work Till: {isScheduleLoading
            ? <StatPulse widthClass="w-24" />
            : <>{workTill.label}{workTill.hours > 0 ? ` - ${formatHoursAsHm(workTill.hours)}` : ""}</>}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Tasks finished in the viewed week (completedAt) */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          Tasks Closed This Week: {weeklyCompletedCount}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Monthly closed — CLIENT_ACCEPTED + CLIENT_REJECTED via completedAt */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          Monthly Closed Task Count: {monthlyTaskCount}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Pending Regularization — display only, not navigable */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400 shrink-0" />
        <span className="font-semibold text-slate-700">
          Pending Regularization: {pendingRegularization}
        </span>
      </div>
    </div>
  );
}
