"use client";
import { useRouter } from "next/navigation";

export default function StatsBar({ stats, isDesignerMode = true, isHOD = false, isViewingOther = false }) {
  const router = useRouter();
  const { workLoad, workTill, monthlyTaskCount, monthlyHourCount, score, pendingRegularization } = stats;

  return (
    <div className="bg-white border-b border-slate-200 flex items-center flex-wrap gap-x-6 gap-y-1 px-6 py-2 text-xs shrink-0">
      {/* Work Load */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          Work Load: {(!workLoad.hours || workLoad.hours === 0) ? "No hours assigned" : `${workLoad.tasks}T / ${workLoad.hours}H`}
        </span>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Work Till */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
        <span className="font-semibold text-slate-700">
          Work Till: {workTill.label} - {workTill.hours}H
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Monthly Task Count */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="text-slate-700 leading-tight">
          <span className="font-semibold">Monthly Comp.</span>
          <br />
          <span className="font-semibold">Task Count: {monthlyTaskCount}</span>
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Monthly Hour Count */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="text-slate-700 leading-tight">
          <span className="font-semibold">Monthly Comp.</span>
          <br />
          <span className="font-semibold">Hour Count: {monthlyHourCount}</span>
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Score */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-slate-700">Score %: {score}%</span>
      </div>

      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

      {/* Pending Regularization */}
      {isDesignerMode ? (
        <button
          type="button"
          onClick={() => router.push(`/designer/requests?tab=regularization`)}
          className="flex items-center gap-1.5 hover:bg-slate-100 p-1 -m-1 rounded cursor-pointer transition-colors text-left"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400 shrink-0" />
          <span className="text-slate-700 leading-tight">
            <span className="font-semibold">Pending</span>
            <br />
            <span className="font-semibold">Regularization: {pendingRegularization}</span>
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 p-1 -m-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400 shrink-0" />
          <span className="text-slate-700 leading-tight">
            <span className="font-semibold">Pending</span>
            <br />
            <span className="font-semibold">Regularization: {pendingRegularization}</span>
          </span>
        </div>
      )}
    </div>
  );
}
