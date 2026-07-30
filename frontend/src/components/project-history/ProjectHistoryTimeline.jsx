'use client'

import { LUCIDE_ICON_STROKE } from '@/constants/icons'
import {
  formatHistoryDateShort,
  formatHistoryTimestamp,
  getHistoryEventMeta,
  getHistoryToneStyles,
  HistoryEmptyIcon,
} from './history-event-meta'

function HistoryTimelineItem({ entry, compact = false, isLast = false }) {
  const meta = getHistoryEventMeta(entry.action)
  const tone = getHistoryToneStyles(meta.tone)
  const Icon = meta.icon
  const actorName = entry.actor?.name?.trim() || 'Unknown'
  const summary = String(entry.summary ?? '').trim()
  const description = summary || actorName
  const timestamp = compact
    ? formatHistoryDateShort(entry.occurredAt)
    : formatHistoryTimestamp(entry.occurredAt)

  return (
    <li className="relative flex gap-3">
      {!isLast ? (
        <span
          className={`absolute left-[15px] top-8 bottom-0 w-px ${tone.connector}`}
          aria-hidden
        />
      ) : null}
      <div
        className={`relative z-[1] mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${tone.soft}`}
        aria-hidden
      >
        <Icon className={`h-3.5 w-3.5 ${tone.icon}`} strokeWidth={LUCIDE_ICON_STROKE} />
      </div>
      <div className={`min-w-0 flex-1 ${compact ? 'pb-3.5' : 'pb-5'}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
          <h4
            className={`min-w-0 font-semibold text-slate-900 ${
              compact ? 'text-[12px] leading-4' : 'text-[14px] leading-5'
            }`}
          >
            {meta.title}
          </h4>
          <time
            dateTime={entry.occurredAt}
            className={`shrink-0 text-slate-500 ${
              compact ? 'text-[10px] leading-4' : 'text-[12px] leading-5'
            }`}
          >
            {timestamp}
          </time>
        </div>
        <p
          className={`mt-1 break-words text-slate-600 ${
            compact ? 'text-[11px] leading-4 line-clamp-2' : 'text-[13px] leading-5'
          }`}
        >
          {description}
        </p>
      </div>
    </li>
  )
}

export function ProjectHistoryEmptyState({
  compact = false,
  title = 'No project history available.',
  subtitle = 'Activities will appear here once changes are made.',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'px-2 py-5' : 'px-6 py-12'
      }`}
      role="status"
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">
        <HistoryEmptyIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
      </div>
      <p className={`mt-3 font-medium text-slate-700 ${compact ? 'text-[11px]' : 'text-sm'}`}>{title}</p>
      {!compact ? (
        <p className="mt-1 max-w-xs text-[13px] leading-5 text-slate-500">{subtitle}</p>
      ) : null}
    </div>
  )
}

/**
 * Timeline / activity-feed list for project or field history entries.
 */
export function ProjectHistoryTimeline({
  items = [],
  compact = false,
  emptyTitle,
  emptySubtitle,
  loading = false,
}) {
  if (loading) {
    return (
      <div className={`space-y-3 ${compact ? 'py-1' : 'px-1 py-2'}`} aria-busy="true" aria-label="Loading history">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex gap-3">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <ProjectHistoryEmptyState
        compact={compact}
        {...(emptyTitle ? { title: emptyTitle } : {})}
        {...(emptySubtitle ? { subtitle: emptySubtitle } : {})}
      />
    )
  }

  return (
    <ol className="space-y-0" aria-label="History timeline">
      {items.map((entry, index) => (
        <HistoryTimelineItem
          key={entry.id}
          entry={entry}
          compact={compact}
          isLast={index === items.length - 1}
        />
      ))}
    </ol>
  )
}
