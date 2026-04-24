// @ts-nocheck
import { CalendarDays, X } from 'lucide-react';
function formatDateLabel(value) {
    if (!value)
        return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    return new Intl.DateTimeFormat('en-GB').format(date);
}
export function DateRangeFilter({ startDate, endDate, onStartDateChange, onEndDateChange, className = '', }) {
    const rangeLabel = startDate || endDate
        ? `${formatDateLabel(startDate) || 'Start'} - ${formatDateLabel(endDate) || 'End'}`
        : 'Select Date Range';
    const canClear = Boolean(startDate || endDate);
    return (<div className={`flex min-w-[220px] items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 ${className}`}>
      <CalendarDays className="h-4 w-4 shrink-0 text-slate-500"/>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-slate-600">{rangeLabel}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} className="h-7 w-full min-w-0 rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300" aria-label="Created start date"/>
          <span className="text-[10px] text-slate-400">to</span>
          <input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} className="h-7 w-full min-w-0 rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300" aria-label="Created end date"/>
        </div>
      </div>

      {canClear ? (<button type="button" onClick={() => {
                onStartDateChange('');
                onEndDateChange('');
            }} className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100" aria-label="Clear date range">
          <X className="h-3.5 w-3.5"/>
        </button>) : null}
    </div>);
}
