"use client";
import { Flame, Star } from "lucide-react";

export default function StatsBar({ stats }) {
  const { workLoad, workTill, monthlyTaskCount, monthlyHourCount, score, pendingRegularization, xp, streak } = stats;

  return (
    <div className="bg-white border-b border-gray-200 flex items-center flex-wrap gap-x-6 gap-y-1 px-6 py-2 text-xs shrink-0">
      {/* Work Load */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-gray-700">
          Work Load: {(!workLoad.hours || workLoad.hours === 0) ? "No hours assigned" : `${workLoad.tasks}T / ${workLoad.hours}H`}
        </span>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {/* Work Till */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
        <span className="font-semibold text-gray-700">
          Work Till: {workTill.label} - {workTill.hours}H
        </span>
      </div>

      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {/* Monthly Task Count */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="text-gray-700 leading-tight">
          <span className="font-semibold">Monthly Comp.</span>
          <br />
          <span className="font-semibold">Task Count: {monthlyTaskCount}</span>
        </span>
      </div>

      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {/* Monthly Hour Count */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="text-gray-700 leading-tight">
          <span className="font-semibold">Monthly Comp.</span>
          <br />
          <span className="font-semibold">Hour Count: {monthlyHourCount}</span>
        </span>
      </div>

      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {/* Score */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
        <span className="font-semibold text-gray-700">Score %: {score}%</span>
      </div>

      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {/* Pending Regularization */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400 shrink-0" />
        <span className="text-gray-700 leading-tight">
          <span className="font-semibold">Pending</span>
          <br />
          <span className="font-semibold">Regularization: {pendingRegularization}</span>
        </span>
      </div>

      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {/* XP + Streak */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
          <span className="font-bold text-gray-800">+{xp} XP!</span>
        </div>
        <div className="flex items-center gap-1">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          <span className="font-semibold text-gray-700">{streak} days streak</span>
        </div>
      </div>
    </div>
  );
}
