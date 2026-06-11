'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { getProjectsOverview } from '../services/projects-overview.api';
import { reviewLeaveRequest } from '@/features/requests/services/requests.api';
import { reviewOvertimeRequest } from '@/features/requests/services/overtime-requests.api';
import { reviewRegularizationRequest } from '@/features/requests/services/regularization-requests.api';
import DonutChart from '@/app/designer/[designerId]/components/DonutChart';
import {
  dateInputToUtcReference,
  formatUtcWeekLabel,
  getUtcMondayOfDate,
} from '@/lib/week-utils';
import { connectDashboardRealtime } from '@/lib/realtime';

const POLL_MS = 45_000;

function fmt(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CompactCard({ title, children, className = '', state = 'ready' }) {
  return (
    <section className={`ui-surface ui-card-pad flex min-w-0 flex-col ${className}`}>
      <h2 className="mb-3 shrink-0 text-sm font-semibold text-slate-900">{title}</h2>
      <div className="min-w-0 flex-1">
        {state === 'loading' ? (
          <div className="flex h-32 animate-pulse flex-col gap-2">
            <div className="h-3 rounded bg-slate-100" />
            <div className="h-3 rounded bg-slate-100" />
            <div className="h-3 w-2/3 rounded bg-slate-100" />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function ResponsiveTable({ headers, rows, renderRow, emptyMessage, errorMessage }) {
  if (errorMessage) {
    return <p className="py-4 text-center text-xs text-red-600">{errorMessage}</p>;
  }
  if (!rows.length) {
    return <p className="py-4 text-center text-xs text-slate-400">{emptyMessage}</p>;
  }
  return (
    <div className="min-w-0 overflow-hidden rounded-lg">
      <table className="w-full table-fixed text-left text-xs text-slate-700">
        <thead className="ui-table-header border-b border-slate-200">
          <tr>
            {headers.map((header) => (
              <th key={header} className="truncate px-2 py-2 font-semibold sm:px-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

function requestTypeBadge(type) {
  if (type === 'regularization') return 'Reg';
  if (type === 'overtime') return 'OT';
  if (type === 'leave') return 'Leave';
  return null;
}

function InboxCard({ inbox, fmt, onNavigate, onRefresh, cardState, errorMessage }) {
  const containerRef = useRef(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(8);
  const [actingId, setActingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [actionError, setActionError] = useState('');

  const recalcPageSize = useCallback(() => {
    const height = containerRef.current?.clientHeight ?? 320;
    setPageSize(Math.max(6, Math.min(20, Math.floor(height / 52))));
  }, []);

  useEffect(() => {
    recalcPageSize();
    window.addEventListener('resize', recalcPageSize);
    return () => window.removeEventListener('resize', recalcPageSize);
  }, [recalcPageSize]);

  useEffect(() => {
    setPage(0);
  }, [inbox, pageSize]);

  const totalPages = Math.max(1, Math.ceil(inbox.length / pageSize));
  const slice = inbox.slice(page * pageSize, page * pageSize + pageSize);
  const actionCount = inbox.filter((item) => item.requiresAction).length;

  const handleApprove = async (item) => {
    setActionError('');
    setActingId(item.id);
    try {
      if (item.requestType === 'leave') {
        await reviewLeaveRequest(item.id, { status: 'APPROVED' });
      } else if (item.requestType === 'overtime') {
        await reviewOvertimeRequest(item.id, {
          status: 'APPROVED_BY_MANAGER',
          comments: 'Approved from inbox',
        });
      } else if (item.requestType === 'regularization') {
        await reviewRegularizationRequest(item.id, { status: 'Approved' });
      }
      await onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not approve request');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectRemarks.trim()) {
      setActionError('Remarks are required when rejecting');
      return;
    }
    setActionError('');
    setActingId(rejectTarget.id);
    try {
      if (rejectTarget.requestType === 'leave') {
        await reviewLeaveRequest(rejectTarget.id, { status: 'REJECTED', remarks: rejectRemarks.trim() });
      } else if (rejectTarget.requestType === 'overtime') {
        await reviewOvertimeRequest(rejectTarget.id, {
          status: 'REJECTED_BY_MANAGER',
          comments: rejectRemarks.trim(),
        });
      } else if (rejectTarget.requestType === 'regularization') {
        await reviewRegularizationRequest(rejectTarget.id, {
          status: 'Rejected',
          remarks: rejectRemarks.trim(),
        });
      }
      setRejectTarget(null);
      setRejectRemarks('');
      await onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reject request');
    } finally {
      setActingId(null);
    }
  };

  const rejectTitle =
    rejectTarget?.requestType === 'overtime'
      ? 'Reject overtime request'
      : rejectTarget?.requestType === 'regularization'
        ? 'Reject regularization request'
        : 'Reject leave request';

  return (
    <CompactCard title="Inbox" className="h-full min-h-[280px]" state={cardState}>
      <div className="mb-2 flex shrink-0 items-center justify-between border-b border-slate-100 pb-2 text-xs font-semibold text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <Inbox className="h-4 w-4" />
          <span>{inbox.length} items</span>
          {actionCount > 0 ? (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
              {actionCount} need action
            </span>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p className="py-4 text-center text-xs text-red-600">{errorMessage}</p>
      ) : inbox.length === 0 ? (
        <div className="grid min-h-[120px] flex-1 place-items-center text-sm font-medium text-slate-400">
          No inbox items
        </div>
      ) : (
        <>
          <div ref={containerRef} className="min-h-[200px] flex-1 overflow-y-auto lg:min-h-[240px]">
            <ul className="divide-y divide-slate-100">
              {slice.map((item) => (
                <li key={item.itemKey ?? `${item.requestType ?? 'activity'}-${item.id}`}>
                  <div
                    className={`flex w-full flex-col px-1 py-2.5 text-left ${
                      item.requiresAction ? 'border-l-2 border-orange-400 pl-2' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => item.linkUrl && onNavigate(item.linkUrl)}
                      disabled={!item.linkUrl}
                      className={`w-full text-left transition-colors ${
                        item.linkUrl ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-xs leading-snug text-slate-700">
                          {item.summary}
                        </p>
                        {requestTypeBadge(item.requestType) ? (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">
                            {requestTypeBadge(item.requestType)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        {item.requesterName ? <span>{item.requesterName}</span> : null}
                        {item.taskNo ? <span className="font-mono">{item.taskNo}</span> : null}
                        <span>{fmt(item.occurredAt)}</span>
                        {item.requiresAction ? (
                          <span className="font-semibold text-orange-600">Action required</span>
                        ) : null}
                      </div>
                    </button>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.requiresAction ? (
                        <>
                          <button
                            type="button"
                            disabled={actingId === item.id}
                            onClick={() => handleApprove(item)}
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actingId === item.id ? 'Working…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === item.id}
                            onClick={() => {
                              setActionError('');
                              setRejectTarget(item);
                              setRejectRemarks('');
                            }}
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {totalPages > 1 ? (
            <div className="mt-auto flex shrink-0 items-center justify-between border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded p-1 text-slate-400 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[10px] font-medium text-slate-400">
                {page + 1} / {totalPages} · {pageSize} per page
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="rounded p-1 text-slate-400 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {actionError ? (
            <p className="mt-2 text-[10px] font-medium text-red-600">{actionError}</p>
          ) : null}
        </>
      )}

      {rejectTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setRejectTarget(null);
              setRejectRemarks('');
              setActionError('');
            }
          }}
          role="presentation"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl" role="dialog">
            <h3 className="text-sm font-semibold text-slate-900">{rejectTitle}</h3>
            <p className="mt-1 text-xs text-slate-500">{rejectTarget.summary}</p>
            <textarea
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (required)"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectRemarks('');
                  setActionError('');
                }}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actingId === rejectTarget.id}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {actingId === rejectTarget.id ? 'Rejecting…' : 'Confirm reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CompactCard>
  );
}

export function ProjectsOverviewScreen() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const weekStart = useMemo(() => getUtcMondayOfDate(currentDate), [currentDate]);
  const weekLabel = useMemo(() => formatUtcWeekLabel(weekStart), [weekStart]);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getProjectsOverview(weekStart);
      setOverview(data);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects overview');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadOverview();
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadOverview(true);
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [loadOverview]);

  useEffect(() => {
    return connectDashboardRealtime({
      onDashboardRefresh: () => void loadOverview(true),
    });
  }, [loadOverview]);

  const data = useMemo(() => {
    if (!overview) return null;
    if (!searchTerm.trim()) return overview;
    const q = searchTerm.toLowerCase();
    const matchTask = (t) =>
      t.taskNo?.toLowerCase().includes(q)
      || t.projectName?.toLowerCase().includes(q)
      || t.title?.toLowerCase().includes(q);
    const matchInbox = (item) =>
      item.summary?.toLowerCase().includes(q)
      || item.requesterName?.toLowerCase().includes(q)
      || item.taskNo?.toLowerCase().includes(q);
    return {
      ...overview,
      scheduledTasks: overview.scheduledTasks.filter(matchTask),
      completedTasks: overview.completedTasks.filter(matchTask),
      onHoldTasks: overview.onHoldTasks.filter(matchTask),
      reallocatedTasks: overview.reallocatedTasks.filter(matchTask),
      inbox: overview.inbox.filter(matchInbox),
    };
  }, [overview, searchTerm]);

  const handleDateChange = (event) => {
    if (!event.target.value) return;
    setCurrentDate(dateInputToUtcReference(event.target.value));
  };

  const summary = data?.summary;
  const hasDonut = summary && summary.total > 0;
  const cardState = loading && !overview ? 'loading' : 'ready';
  const tableError = error && !overview ? error : null;

  const progressStyle = hasDonut
    ? {
        background: `linear-gradient(90deg, #4f8ef7 0 ${summary.donut.active.pct}%, #7ed321 ${summary.donut.active.pct}% ${summary.donut.active.pct + summary.donut.completed.pct}%, #f5a623 ${summary.donut.active.pct + summary.donut.completed.pct}% 100%)`,
      }
    : { background: '#e2e8f0' };

  return (
    <div className="app-shell overflow-x-hidden">
      <Navbar />
      <main className="h-[calc(100vh-165px)] w-full overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5 lg:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Projects Overview
            </h1>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Filter tasks & inbox"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                />
              </div>
              <div className="relative shrink-0">
                <button type="button" className="ui-chip-button flex items-center gap-2">
                  <span className="max-w-[180px] truncate sm:max-w-none">{weekLabel}</span>
                  <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
                <input
                  type="date"
                  aria-label="Select date range reference"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={weekStart}
                  onChange={handleDateChange}
                  onClick={(event) => {
                    if ('showPicker' in event.currentTarget) {
                      try {
                        event.currentTarget.showPicker();
                      } catch {
                        /* unsupported */
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : null}

          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2 xl:auto-rows-[minmax(280px,1fr)]">
            <CompactCard title="Scheduled Tasks" className="h-full min-h-[280px]" state={cardState}>
              <ResponsiveTable
                headers={['Task No', 'Project', 'Rev', 'Assignee', 'Due']}
                rows={data?.scheduledTasks ?? []}
                emptyMessage="No scheduled tasks this week"
                errorMessage={tableError}
                renderRow={(row) => (
                  <tr key={row.taskNo}>
                    <td className="truncate px-2 py-2 font-mono sm:px-3">{row.taskNo}</td>
                    <td className="truncate px-2 py-2 sm:px-3" title={row.projectName}>{row.projectName || '—'}</td>
                    <td className="truncate px-2 py-2 font-mono text-slate-500 sm:px-3">{row.revisionCode || '—'}</td>
                    <td className="truncate px-2 py-2 sm:px-3" title={row.assigneeName}>{row.assigneeName || '—'}</td>
                    <td className="truncate px-2 py-2 sm:px-3">{fmt(row.dueDate)}</td>
                  </tr>
                )}
              />
            </CompactCard>

            <CompactCard title="Completed Tasks" className="h-full min-h-[280px]" state={cardState}>
              <ResponsiveTable
                headers={['Task No', 'Project', 'Rev', 'Completed', '']}
                rows={data?.completedTasks ?? []}
                emptyMessage="No completions this week"
                errorMessage={tableError}
                renderRow={(row) => (
                  <tr key={row.taskNo}>
                    <td className="truncate px-2 py-2 font-mono sm:px-3">{row.taskNo}</td>
                    <td className="truncate px-2 py-2 sm:px-3" title={row.projectName}>{row.projectName || '—'}</td>
                    <td className="truncate px-2 py-2 font-mono text-slate-500 sm:px-3">{row.revisionCode || '—'}</td>
                    <td className="truncate px-2 py-2 sm:px-3">{fmt(row.completedAt)}</td>
                    <td className="px-2 py-2 text-right sm:px-3">
                      <CheckCircle2 className="inline-block h-4 w-4 text-emerald-600" />
                    </td>
                  </tr>
                )}
              />
            </CompactCard>

            <InboxCard
              inbox={data?.inbox ?? []}
              fmt={fmt}
              onNavigate={(url) => router.push(url)}
              onRefresh={() => loadOverview(true)}
              cardState={cardState}
              errorMessage={tableError}
            />

            <CompactCard title="On Hold Tasks" className="h-full min-h-[280px]" state={cardState}>
              <ResponsiveTable
                headers={['Task No', 'Project', 'Rev', 'Hold Date', 'Reason']}
                rows={data?.onHoldTasks ?? []}
                emptyMessage="No tasks on hold"
                errorMessage={tableError}
                renderRow={(row) => (
                  <tr key={row.taskNo}>
                    <td className="truncate px-2 py-2 font-mono sm:px-3">{row.taskNo}</td>
                    <td className="truncate px-2 py-2 sm:px-3" title={row.projectName}>{row.projectName || '—'}</td>
                    <td className="truncate px-2 py-2 font-mono text-slate-500 sm:px-3">{row.revisionCode || '—'}</td>
                    <td className="truncate px-2 py-2 sm:px-3">{fmt(row.holdDate)}</td>
                    <td className="truncate px-2 py-2 text-slate-500 sm:px-3">{row.reason ?? 'On hold'}</td>
                  </tr>
                )}
              />
            </CompactCard>

            <CompactCard title="Reallocated Tasks" className="h-full min-h-[280px]" state={cardState}>
              <ResponsiveTable
                headers={['Task No', 'Project', 'From', 'To']}
                rows={data?.reallocatedTasks ?? []}
                emptyMessage="No reallocations this week"
                errorMessage={tableError}
                renderRow={(row) => (
                  <tr key={`${row.taskNo}-${row.reassignedAt}`}>
                    <td className="truncate px-2 py-2 font-mono sm:px-3">{row.taskNo}</td>
                    <td className="truncate px-2 py-2 sm:px-3" title={row.projectName}>{row.projectName || '—'}</td>
                    <td className="truncate px-2 py-2 text-slate-400 sm:px-3" title={row.fromAssigneeName ?? ''}>{row.fromAssigneeName || '—'}</td>
                    <td className="truncate px-2 py-2 sm:px-3" title={row.newAssigneeName}>{row.newAssigneeName}</td>
                  </tr>
                )}
              />
            </CompactCard>

            <section className="ui-surface ui-card-pad flex h-full min-h-[280px] min-w-0 flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Task Summary</h2>
                {loading ? (
                  <span className="text-[10px] text-slate-400">Refreshing…</span>
                ) : null}
              </div>

              {cardState === 'loading' ? (
                <div className="mx-auto flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-slate-100" />
              ) : tableError ? (
                <p className="py-4 text-center text-xs text-red-600">{tableError}</p>
              ) : hasDonut ? (
                <div className="flex justify-center">
                  <DonutChart donut={summary.donut} />
                </div>
              ) : (
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-slate-100">
                  <span className="text-xs text-slate-400">No tasks in scope</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center shadow-sm">
                  <p className="mb-0.5 font-medium text-slate-500">On-Time %</p>
                  <p className="text-lg font-bold text-emerald-600">{summary?.onTimePct ?? 0}%</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center shadow-sm">
                  <p className="mb-0.5 font-medium text-slate-500">Reallocated</p>
                  <p className="text-lg font-bold text-slate-900">{summary?.reallocatedPct ?? 0}%</p>
                </div>
              </div>

              <div className="mt-2 flex-1">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Overall Task Status</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  <div className="h-full w-full" style={progressStyle} />
                </div>
                {summary ? (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {summary.total} tasks · {summary.active} active · {summary.onHold} on hold · {summary.completed} completed
                  </p>
                ) : null}
              </div>

              <div className="mt-auto flex items-center justify-end gap-1.5 text-xs font-medium text-slate-400">
                <UserRound className="h-3.5 w-3.5" />
                {updatedAt
                  ? `Updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC`
                  : 'Updated just now'}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
