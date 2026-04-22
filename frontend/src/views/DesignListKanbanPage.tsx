// @ts-nocheck
import { KanbanCard } from '../components/KanbanCard'
import { DesignListShell } from './DesignListShell'
import { useDesignListStore } from '../state/DesignListContext'

const COLUMNS = [
  { key: 'WIP', title: 'WIP', dot: 'bg-blue-500', status: 'WIP' },
  {
    key: 'Completed',
    title: 'Completed',
    dot: 'bg-emerald-500',
    status: 'Completed',
  },
  {
    key: 'Pending',
    title: 'Confirmation Pending',
    dot: 'bg-yellow-500',
    status: 'Pending',
  },
  { key: 'Revision', title: 'Revision', dot: 'bg-orange-500', status: 'Revision' },
  { key: 'Approved', title: 'Approved', dot: 'bg-purple-500', status: 'Approved' },
]

export function DesignListKanbanPage() {
  const { status, setStatus } = useDesignListStore()

  return (
    <DesignListShell>
      {(rows) => (
        <div className="h-full flex flex-col overflow-auto pb-6 relative">
          <div className="sticky top-0 z-20 shrink-0 bg-white pb-4 pt-2">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              {COLUMNS.map((col) => {
                const active = status === 'All' ? true : status === col.status
                const isSelected = status === col.status
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => setStatus(isSelected ? 'All' : col.status)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-3 text-left text-sm font-semibold ring-1 transition ${
                      active ? 'opacity-100' : 'opacity-40'
                    } ${
                      col.status === 'WIP'
                        ? 'bg-blue-100 ring-blue-200'
                        : col.status === 'Completed'
                          ? 'bg-emerald-100 ring-emerald-200'
                          : col.status === 'Pending'
                            ? 'bg-yellow-100 ring-yellow-200'
                            : col.status === 'Revision'
                              ? 'bg-orange-100 ring-orange-200'
                              : 'bg-purple-100 ring-purple-200'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    {col.title}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-5 lg:grid-cols-5">
            {COLUMNS.map((col) => {
              const list = rows.filter((r) => r.status === col.status)
              return (
                <section key={col.key} className="space-y-4">
                  {list.map((r) => (
                    <KanbanCard key={r.id} row={r} />
                  ))}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </DesignListShell>
  )
}

