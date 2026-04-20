// @ts-nocheck
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, History, Pencil, UserPlus } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { useDesignListStore } from '../state/DesignListContext'

function IconButton({ label, children, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  )
}

export const TABLE_COLUMN_CLASSES = [
  'text-left', // OP No
  'text-left', // Project No
  'text-center', // Design Type
  'text-left', // Business Unit
  'text-left', // Name
  'text-left', // Status
  'text-left', // Sales Person
  'text-left', // Created
  'text-left', // Deadline
  'text-left', // Aging
  'text-center', // Actions
]

export function TableRow({ row, gridClass }) {
  const { cycleStatus } = useDesignListStore()
  const router = useRouter()
  const agingIsHigh = row.agingDays > 20

  return (
    <div className="group border-b border-slate-100 px-4 py-0 hover:bg-slate-50">
      <div
        className={`grid ${gridClass} items-center text-[11px] text-slate-700`}
      >
        <Link
          href={`/design-list/task/${row.id}`}
          className="truncate px-2 text-left text-[#1e5aa7] hover:underline"
          title={row.opNo}
        >
          {row.opNo}
        </Link>
        <div className="truncate px-2 text-left text-[#1e5aa7] hover:underline" title={row.projectNo}>
          {row.projectNo}
        </div>
        <div className="flex items-center justify-center whitespace-nowrap px-2 text-center">
          {row.designType}
        </div>
        <div className="truncate px-2 text-left" title={row.businessUnit}>{row.businessUnit}</div>
        <div className="truncate px-2 text-left">{row.name}</div>
        <div className="px-2 text-left">
          <button
            type="button"
            onClick={() => cycleStatus(row.id)}
            className="rounded-full"
            title="Click to change status (demo)"
          >
            <StatusBadge status={row.status} />
          </button>
        </div>
        <div className="whitespace-nowrap px-2 text-left">{row.salesPerson}</div>
        <div className="whitespace-nowrap px-2 text-left">{row.created}</div>
        <div className="whitespace-nowrap px-2 text-left">{row.deadline}</div>
        <div className="flex items-center justify-start px-2">
          <span
            className={`whitespace-nowrap ${agingIsHigh ? 'font-semibold text-rose-600' : ''
              }`}
          >
            {row.agingLabel}
          </span>
        </div>
        <div className="flex flex-nowrap items-center justify-center gap-1 px-2">
          <IconButton
            label="View"
            onClick={() => router.push(`/design-list/task/${row.id}`)}
          >
            <Eye className="h-3 w-3" />
          </IconButton>
          <IconButton label="Edit">
            <Pencil className="h-3 w-3" />
          </IconButton>
          <IconButton label="Assign">
            <UserPlus className="h-3 w-3" />
          </IconButton>
          <IconButton label="History">
            <History className="h-3 w-3" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

