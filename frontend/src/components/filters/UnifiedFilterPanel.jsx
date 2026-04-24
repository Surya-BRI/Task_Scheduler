// @ts-nocheck
import { CalendarDays, ListFilter, Shapes, UserRound } from 'lucide-react';
import { DateRangeFilter } from './DateRangeFilter';
import { FilterDropdown } from './FilterDropdown';
const STATUS_STYLES = {
    WIP: 'bg-blue-100 text-blue-700 ring-blue-200',
    Completed: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    Pending: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
    Revision: 'bg-orange-100 text-orange-700 ring-orange-200',
    Approved: 'bg-purple-100 text-purple-700 ring-purple-200',
};
export function UnifiedFilterPanel({ draftFilters, onDraftChange, typeOptions, statusOptions, salesPersonOptions, onApply, onClearAll, onClose, }) {
    return (<div onClick={onClose} className="fixed inset-0 z-40 bg-black/20 p-3 sm:absolute sm:inset-auto sm:right-0 sm:top-11 sm:w-[380px] sm:bg-transparent sm:p-0">
      <div onClick={(event) => event.stopPropagation()} className="mx-auto w-full max-w-xl rounded-xl bg-white p-3 shadow-xl ring-1 ring-slate-200 sm:mx-0">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Filters</div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        <div className="space-y-3">
          <FilterDropdown icon={Shapes} placeholder="Select Type" options={typeOptions.map((value) => ({ value, label: value }))} values={draftFilters.types} onChange={(types) => onDraftChange({ ...draftFilters, types })} multiple className="w-full"/>

          <FilterDropdown icon={ListFilter} placeholder="Select Status" options={statusOptions
            .filter((item) => item !== 'All')
            .map((value) => ({ value, label: value }))} value={draftFilters.status === 'All' ? '' : draftFilters.status} onChange={(status) => onDraftChange({
            ...draftFilters,
            status: status || 'All',
        })} optionRenderer={(item) => {
            const style = STATUS_STYLES[item.value] ?? 'bg-slate-100 text-slate-700 ring-slate-200';
            return (<span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style}`}>
                  {item.label}
                </span>);
        }} className="w-full"/>

          <FilterDropdown icon={UserRound} placeholder="Select Sales Person" options={salesPersonOptions.map((value) => ({ value, label: value }))} value={draftFilters.salesPerson} onChange={(salesPerson) => onDraftChange({
            ...draftFilters,
            salesPerson,
        })} searchable className="w-full"/>

          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5"/>
              Created Date
            </div>
            <DateRangeFilter startDate={draftFilters.createdDateRange.startDate} endDate={draftFilters.createdDateRange.endDate} onStartDateChange={(startDate) => onDraftChange({
            ...draftFilters,
            createdDateRange: {
                ...draftFilters.createdDateRange,
                startDate,
            },
        })} onEndDateChange={(endDate) => onDraftChange({
            ...draftFilters,
            createdDateRange: {
                ...draftFilters.createdDateRange,
                endDate,
            },
        })} className="min-w-0"/>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClearAll} className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
            Clear All
          </button>
          <button type="button" onClick={onApply} className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700">
            Apply
          </button>
        </div>
      </div>
    </div>);
}
