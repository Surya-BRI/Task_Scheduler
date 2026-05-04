"use client";

import { CalendarDays } from "lucide-react";
import { LUCIDE_ICON_STROKE } from "@/constants/icons";
 
export function DateRangePicker({ value, onChange, className = "" }) {
  const startDate = value?.startDate ?? "";
  const endDate = value?.endDate ?? "";

  return (
    <div className={`flex min-w-0 shrink-0 flex-col sm:min-w-[13.5rem] md:min-w-[15rem] ${className}`}>
      <span className="ui-filter-label">Date range</span>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <label className="ui-select-trigger relative min-h-9 cursor-pointer gap-1.5 pr-8">
          <input
            type="date"
            aria-label="Start date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="w-full min-w-0 bg-transparent pr-0.5 text-xs text-slate-800 outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />
          <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
        </label>
        <label className="ui-select-trigger relative min-h-9 cursor-pointer gap-1.5 pr-8">
          <input
            type="date"
            aria-label="End date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="w-full min-w-0 bg-transparent pr-0.5 text-xs text-slate-800 outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />
          <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
        </label>
      </div>
    </div>
  );
}
