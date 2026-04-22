// @ts-nocheck
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Funnel,
  Grid2x2,
  LayoutGrid,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { UnifiedFilterPanel } from './filters/UnifiedFilterPanel'

function ViewLink({ to, active, icon, children }) {
  const Icon = icon

  return (
    <Link
      href={to}
      className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset transition ${
        active
          ? 'bg-slate-200 text-slate-900 ring-slate-300'
          : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
      }`}
      aria-label={children}
    >
      <Icon className="h-4 w-4" />
    </Link>
  )
}

export function DesignListToolbar({
  query,
  onQueryChange,
  typeOptions,
  selectedTypes,
  statusOptions,
  selectedStatus,
  salesPersonOptions,
  selectedSalesPerson,
  createdDateRange,
  onApplyFilters,
  onResetFilters,
  rightSlot,
}) {
  const pathname = usePathname()
  const isTable = pathname.endsWith('/table')
  const isKanban = pathname.endsWith('/kanban')
  const [openFilterPanel, setOpenFilterPanel] = useState(false)
  const currentFilters = useMemo(
    () => ({
      types: selectedTypes,
      status: selectedStatus,
      salesPerson: selectedSalesPerson,
      createdDateRange,
    }),
    [createdDateRange, selectedSalesPerson, selectedStatus, selectedTypes],
  )
  const [draftFilters, setDraftFilters] = useState(currentFilters)

  return (
    <div className="relative flex w-full flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by OP No, Project ..."
            className="w-[190px] min-w-0 bg-transparent text-xs outline-none placeholder:text-slate-400 sm:w-[300px]"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            setOpenFilterPanel((prev) => {
              const next = !prev
              if (next) {
                setDraftFilters(currentFilters)
              }
              return next
            })
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          <Funnel className="h-3.5 w-3.5" />
          Filter
        </button>

        {openFilterPanel ? (
          <UnifiedFilterPanel
            draftFilters={draftFilters}
            onDraftChange={setDraftFilters}
            typeOptions={typeOptions}
            statusOptions={statusOptions}
            salesPersonOptions={salesPersonOptions}
            onApply={() => {
              onApplyFilters(draftFilters)
              setOpenFilterPanel(false)
            }}
            onClearAll={() => {
              onResetFilters()
              setOpenFilterPanel(false)
            }}
            onClose={() => setOpenFilterPanel(false)}
          />
        ) : null}
      </div>

      <div className="ml-1 flex items-center gap-1">
        <ViewLink to="/design-list/table" active={isTable} icon={LayoutGrid}>
          Table
        </ViewLink>
        <ViewLink to="/design-list/kanban" active={isKanban} icon={Grid2x2}>
          Kanban
        </ViewLink>
      </div>

      {rightSlot}
    </div>
  )
}

