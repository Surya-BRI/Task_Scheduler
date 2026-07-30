'use client'

import { ProjectHistoryTimeline } from './ProjectHistoryTimeline'

/**
 * Compact Project / Field History card for the task sidebar.
 */
export function ProjectHistoryPanel({
  title = 'Project History',
  items = [],
  previewLimit = 4,
  hasMore = false,
  emptyTitle = 'No project history available.',
  emptySubtitle,
  onShowAll,
}) {
  const previewItems = items.slice(0, previewLimit)
  const totalLabel = `${items.length}${hasMore ? '+' : ''}`

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <h2 className="text-xs font-semibold text-slate-900">{title}</h2>
      <div className="mt-2">
        <ProjectHistoryTimeline
          items={previewItems}
          compact
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
        />
      </div>
      {items.length > previewLimit && typeof onShowAll === 'function' ? (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-1 text-[11px] font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded"
        >
          Show all ({totalLabel})
        </button>
      ) : null}
    </section>
  )
}
