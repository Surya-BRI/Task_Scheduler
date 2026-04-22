// @ts-nocheck
import { Navbar } from '../components/Navbar'
import { DesignListToolbar } from '../components/DesignListToolbar'
import { useDesignListStore } from '../state/DesignListContext'

export function DesignListShell({ children }) {
  const {
    query,
    setQuery,
    filtered,
    typeOptions,
    typeFilters,
    setTypeFilters,
    statusOptions,
    status,
    setStatus,
    salesPersonOptions,
    salesPerson,
    setSalesPerson,
    createdDateRange,
    setCreatedDateRange,
    resetFilters,
  } = useDesignListStore()

  const handleApplyFilters = (filters) => {
    setTypeFilters(filters.types)
    setStatus(filters.status)
    setSalesPerson(filters.salesPerson)
    setCreatedDateRange(filters.createdDateRange)
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <Navbar />

      <main className="flex w-full flex-1 flex-col overflow-hidden px-4 py-2 sm:px-6 sm:py-3">
        <div className="flex shrink-0 flex-col gap-2 sm:gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="whitespace-nowrap text-lg font-semibold text-slate-900">
            Design List
          </div>
          <DesignListToolbar
            query={query}
            onQueryChange={setQuery}
            typeOptions={typeOptions}
            selectedTypes={typeFilters}
            statusOptions={statusOptions}
            selectedStatus={status}
            salesPersonOptions={salesPersonOptions}
            selectedSalesPerson={salesPerson}
            createdDateRange={createdDateRange}
            onApplyFilters={handleApplyFilters}
            onResetFilters={resetFilters}
          />
        </div>

        <div className="mt-2 flex-1 overflow-hidden transition-opacity duration-200">
          {children(filtered)}
        </div>
      </main>
    </div>
  )
}

