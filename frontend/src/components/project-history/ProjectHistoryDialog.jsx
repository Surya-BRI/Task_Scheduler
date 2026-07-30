'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { LUCIDE_ICON_STROKE } from '@/constants/icons'
import { fetchProjectActivities } from '@/features/team-activity/services/activities.api'
import { HISTORY_FIELD_ACTIONS } from './history-event-meta'
import { ProjectHistoryTimeline } from './ProjectHistoryTimeline'

/**
 * Full Project / Field History modal with paginated timeline.
 * Preserves existing fetch, filter, and pagination behavior.
 */
export function ProjectHistoryDialog({ title, projectId, type = 'project', onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [cursorStack, setCursorStack] = useState([null])
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    if (!onClose) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!projectId) return undefined
    let alive = true
    setLoading(true)
    const cursor = cursorStack[pageIndex]
    fetchProjectActivities(projectId, { limit: 20, cursor: cursor ?? undefined })
      .then((response) => {
        if (!alive) return
        let data = response?.data ?? []
        if (type === 'field') data = data.filter((i) => HISTORY_FIELD_ACTIONS.has(i.action))
        setItems(data)
        setNextCursor(response?.pageInfo?.nextCursor ?? null)
        setHasMore(Boolean(response?.pageInfo?.hasMore))
      })
      .catch(() => {
        if (alive) setItems([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [projectId, type, cursorStack, pageIndex])

  const handlePrevious = () => {
    if (pageIndex <= 0) return
    setPageIndex((i) => i - 1)
  }

  const handleNext = () => {
    if (!hasMore || !nextCursor) return
    setCursorStack((prev) => {
      const updated = [...prev]
      if (updated.length <= pageIndex + 1) updated.push(nextCursor)
      return updated
    })
    setPageIndex((i) => i + 1)
  }

  const handleLatest = () => {
    setCursorStack([null])
    setPageIndex(0)
  }

  const emptyTitle =
    type === 'field' ? 'No field history available.' : 'No project history available.'
  const emptySubtitle =
    type === 'field'
      ? 'Field changes will appear here once updates are made.'
      : 'Activities will appear here once changes are made.'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-label="Close history dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-history-dialog-title"
        className="relative z-10 flex max-h-[80vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3
            id="project-history-dialog-title"
            className="text-[15px] font-semibold text-slate-900"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
          </button>
        </div>

        <div
          className="history-dialog-body min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth px-6 py-5"
          tabIndex={0}
          role="region"
          aria-label={title}
        >
          <ProjectHistoryTimeline
            items={items}
            loading={loading}
            emptyTitle={emptyTitle}
            emptySubtitle={emptySubtitle}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLatest}
              disabled={pageIndex === 0 || loading}
              className="rounded text-[11px] font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Latest
            </button>
            <button
              type="button"
              onClick={handlePrevious}
              disabled={pageIndex === 0 || loading}
              className="rounded text-[11px] font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
          </div>
          <span className="text-[10px] text-slate-400">Page {pageIndex + 1}</span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!hasMore || loading}
            className="rounded text-[11px] font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
