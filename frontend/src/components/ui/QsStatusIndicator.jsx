'use client'

import { Lock, Pencil } from 'lucide-react'

/**
 * Display-only QS status control. Highlights the active mode as a filled tab
 * so Pending/editable vs Completed/read-only is obvious at a glance.
 */
export function QsStatusIndicator({ status }) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return null

  const isCompleted = normalized === 'completed'
  const pendingLabel =
    normalized === 'in progress' ? 'QS In Progress' : 'QS Pending'

  return (
    <div
      role="status"
      aria-label={
        isCompleted
          ? 'QS Completed, Read Only'
          : `${pendingLabel}, Editable`
      }
      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100/90 p-0.5 shadow-sm"
    >
      <span
        className={
          'inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ' +
          (isCompleted
            ? 'text-slate-400'
            : 'bg-[#10a6e3] text-white shadow-sm')
        }
        aria-current={!isCompleted ? 'true' : undefined}
      >
        <Pencil className="h-3 w-3 shrink-0" aria-hidden />
        {pendingLabel}
        <span
          className={
            'ml-0.5 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ' +
            (isCompleted ? 'bg-slate-200/80 text-slate-400' : 'bg-white/20 text-white')
          }
        >
          Editable
        </span>
      </span>

      <span
        className={
          'inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ' +
          (isCompleted
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-slate-400')
        }
        aria-current={isCompleted ? 'true' : undefined}
      >
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        QS Completed
        <span
          className={
            'ml-0.5 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ' +
            (isCompleted ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-400')
          }
        >
          Read Only
        </span>
      </span>
    </div>
  )
}
