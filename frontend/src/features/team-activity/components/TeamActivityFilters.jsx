"use client";

import { TogglePillGroup } from "./TogglePillGroup";
import { DateRangePicker } from "./DateRangePicker";
import { FloatingSelect } from "./FloatingSelect";
import { MONTH_LABELS } from "../lib/teamActivityFilters";

const PRIORITY_OPTS = [
  { label: "All priorities", value: "all" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
];

const SORT_OPTS = [
  { label: "Latest first", value: "latest" },
  { label: "Oldest first", value: "oldest" },
];

export function TeamActivityFilters({
  teammateMode,
  onTeammateMode,
  activityKind,
  onActivityKind,
  sortMonthIndex,
  onSortMonthIndex,
  timeOrder,
  onTimeOrderChange,
  dateRange,
  onDateRangeChange,
  priority,
  onPriorityChange,
  showTeammateFilter = true,
}) {
  const monthOpts = [{ label: "All months", value: "all" }].concat(
    MONTH_LABELS.map((label, i) => ({ label, value: i })),
  );

  return (
    <section className="ta-filter-panel ta-filter-toolbar ui-surface flex flex-wrap items-center gap-x-1.5 gap-y-2 px-3 py-2.5 sm:gap-x-2 sm:px-4 sm:py-2.5">
      <div className="flex shrink-0 items-center">
        <h1 className="whitespace-nowrap text-base font-semibold leading-tight tracking-tight text-slate-900 sm:text-lg">
          Team Activity
        </h1>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-end justify-evenly gap-x-2 gap-y-2 lg:flex-nowrap lg:gap-x-2.5">
        {showTeammateFilter ? (
          <TogglePillGroup
            label="Designer"
            value={teammateMode}
            onChange={onTeammateMode}
            options={[
              { label: "All", value: "all" },
              { label: "Individuals", value: "individuals" },
            ]}
            className="shrink-0"
          />
        ) : null}

        <DateRangePicker value={dateRange} onChange={onDateRangeChange} className="shrink-0" />

        <TogglePillGroup
          label="Status"
          value={activityKind}
          onChange={onActivityKind}
          options={[
            { label: "Task update", value: "task_update" },
            { label: "Milestone", value: "project_milestone" },
          ]}
          className="shrink-0"
        />

        <FloatingSelect
          label="Priority"
          value={priority}
          onChange={onPriorityChange}
          options={PRIORITY_OPTS}
          className="min-w-[8rem] shrink-0 sm:min-w-[8.75rem]"
        />

        <FloatingSelect
          label="Month"
          value={sortMonthIndex}
          onChange={onSortMonthIndex}
          options={monthOpts}
          className="min-w-[8rem] shrink-0 sm:min-w-[8.75rem]"
        />

        <FloatingSelect
          label="Sort"
          value={timeOrder}
          onChange={onTimeOrderChange}
          options={SORT_OPTS}
          className="min-w-[8rem] shrink-0 sm:min-w-[8.75rem]"
        />
      </div>
    </section>
  );
}
