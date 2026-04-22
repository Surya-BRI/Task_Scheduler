// @ts-nocheck
import { useDesignListStore } from '../state/DesignListContext'
import { Clock, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STATUS_BG = {
  WIP: 'bg-blue-100 ring-blue-200',
  Completed: 'bg-emerald-100 ring-emerald-200',
  Pending: 'bg-yellow-100 ring-yellow-200',
  Revision: 'bg-orange-100 ring-orange-200',
  Approved: 'bg-purple-100 ring-purple-200',
}

function MiniAvatar({ name }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
      {initials || 'BR'}
    </div>
  )
}

export function KanbanCard({ row }) {
  const { cycleStatus } = useDesignListStore()
  const router = useRouter()
  const overdue = row.agingDays > 30
  const bg = STATUS_BG[row.status] ?? 'bg-white ring-slate-200'

  return (
    <div
      onClick={() => router.push(`/design-list/record/${row.id}`)}
      className={`group rounded-xl p-4 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${bg}`}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          router.push(`/design-list/record/${row.id}`)
        }
      }}
    >
      <div className="text-xs font-semibold text-slate-900">
        {row.opNo}{' '}
        <span className="font-medium text-slate-700">{row.projectNo}</span>
      </div>

      <div className="mt-1 text-xs text-slate-700">
        {row.businessUnit} {row.designType} {row.name}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1e3a8a] text-white shadow-sm">
            <Shield className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Clock className="h-4 w-4 text-slate-700" />
            <span className={overdue ? 'text-rose-600' : ''}>
              Aging {row.agingLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MiniAvatar name={row.assignee?.name || 'BR'} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              cycleStatus(row.id)
            }}
            className="text-[11px] font-semibold text-slate-700 opacity-0 transition hover:text-slate-900 group-hover:opacity-100"
            title="Change status (demo)"
          >
            Change
          </button>
        </div>
      </div>
    </div>
  )
}

