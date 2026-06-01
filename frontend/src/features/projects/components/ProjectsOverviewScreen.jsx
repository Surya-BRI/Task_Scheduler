'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Ellipsis, Inbox, Search, UserRound } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { getProjectsOverview } from '../services/projects-overview.api';
import DonutChart from '@/app/designer/[designerId]/components/DonutChart';

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CompactCard({ title, children, className = '' }) {
  return (
    <section className={`ui-surface ui-card-pad flex flex-col ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function MiniTable({ headers, rows, renderRow }) {
  return (
    <div className="ui-surface overflow-hidden rounded-lg">
      <table className="w-full text-left text-xs text-slate-700">
        <thead className="ui-table-header border-b border-slate-200">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-semibold">
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

function EmptyRow({ cols }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-4 text-center text-xs text-slate-400">
        No data for this week
      </td>
    </tr>
  );
}

const INBOX_PAGE_SIZE = 3;

function InboxCard({ inbox, fmt }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(inbox.length / INBOX_PAGE_SIZE));
  const slice = inbox.slice(page * INBOX_PAGE_SIZE, page * INBOX_PAGE_SIZE + INBOX_PAGE_SIZE);

  useEffect(() => { setPage(0); }, [inbox]);

  return (
    <CompactCard title="Inbox" className="h-full">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs font-semibold text-slate-500">
        <Inbox className="h-4 w-4" />
        <span>{inbox.length}</span>
      </div>
      {inbox.length === 0 ? (
        <div className="flex-1 grid place-items-center text-sm font-medium text-slate-400 min-h-[120px]">EMPTY</div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 h-[192px]">
            {slice.map((item) => (
              <li key={item.id} className="px-1 h-16 flex flex-col justify-center">
                <p className="text-xs text-slate-700 leading-snug">{item.summary}</p>
                {item.taskNo && (
                  <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{item.taskNo}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">{fmt(item.occurredAt)}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[10px] text-slate-400 font-medium">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </CompactCard>
  );
}

export function ProjectsOverviewScreen() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const weekLabel = useMemo(() => {
    const monday = new Date(getMondayOfWeek(currentDate));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [currentDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProjectsOverview(getMondayOfWeek(currentDate))
      .then((data) => {
        if (!cancelled) {
          setOverview(data);
          setUpdatedAt(new Date());
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentDate]);

  const data = useMemo(() => {
    if (!overview || !searchTerm.trim()) return overview;
    const q = searchTerm.toLowerCase();
    const f = (arr) => arr.filter(
      (t) => t.taskNo?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q),
    );
    return {
      ...overview,
      scheduledTasks: f(overview.scheduledTasks),
      completedTasks: f(overview.completedTasks),
      onHoldTasks: f(overview.onHoldTasks),
      reallocatedTasks: f(overview.reallocatedTasks),
    };
  }, [overview, searchTerm]);

  const handleDateChange = (event) => {
    if (!event.target.value) return;
    const [yyyy, mm, dd] = event.target.value.split('-');
    setCurrentDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
  };

  const summary = data?.summary;
  const hasDonut = summary && summary.total > 0;

  const progressStyle = hasDonut ? {
    background: `linear-gradient(90deg, #4f8ef7 0 ${summary.donut.active.pct}%, #7ed321 ${summary.donut.active.pct}% ${summary.donut.active.pct + summary.donut.completed.pct}%, #f5a623 ${summary.donut.active.pct + summary.donut.completed.pct}% 100%)`,
  } : { background: '#e2e8f0' };

  return (
    <div className="app-shell">
      <Navbar />
      <main className="h-[calc(100vh-165px)] w-full overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Projects Overview
          </h1>
          <div className="flex items-center gap-3">
            <div className="relative w-48 max-w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Project Filter"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
              />
            </div>
            <div className="relative">
              <button type="button" className="ui-chip-button flex items-center gap-2">
                {weekLabel}
                <CalendarDays className="h-4 w-4 text-slate-500" />
              </button>
              <input
                type="date"
                aria-label="Select date range reference"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={currentDate.toISOString().split('T')[0]}
                onChange={handleDateChange}
                onClick={(event) => {
                  if ('showPicker' in event.currentTarget) {
                    try { event.currentTarget.showPicker(); } catch {}
                  }
                }}
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            Loading…
          </div>
        )}

        {!loading && (
          <div className="grid min-h-[calc(100%-36px)] gap-1.5 lg:grid-cols-[1fr_0.8fr_270px]">
            {/* Scheduled Tasks */}
            <CompactCard title="Scheduled Tasks">
              <MiniTable
                headers={['Task No', 'Title', 'Rev', 'Assignee', 'Due Date']}
                rows={data?.scheduledTasks ?? []}
                renderRow={(row) => (
                  <tr key={row.taskNo}>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{row.taskNo}</td>
                    <td className="px-3 py-2 max-w-[160px]">
                      <div className="flex items-start gap-1.5 min-w-0">
                        {row.title && <span className="truncate" title={row.title}>{row.title}</span>}
                        {row.designType && (
                          <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 leading-none">
                            {row.designType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-500">
                      {row.revisionCode || '—'}
                    </td>
                    <td className="px-3 py-2 max-w-[100px] truncate" title={row.assigneeName}>
                      {row.assigneeName || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(row.dueDate)}</td>
                  </tr>
                )}
              />
              {(data?.scheduledTasks?.length ?? 0) === 0 && !loading && (
                <p className="text-xs text-slate-400 text-center py-4">No scheduled tasks this week</p>
              )}
            </CompactCard>

            {/* Completed Tasks */}
            <CompactCard title="Completed Tasks">
              <MiniTable
                headers={['Task No', 'Title', 'Rev', 'Completed', '']}
                rows={data?.completedTasks ?? []}
                renderRow={(row) => (
                  <tr key={row.taskNo}>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{row.taskNo}</td>
                    <td className="px-3 py-2 max-w-[160px]">
                      <div className="flex items-start gap-1.5 min-w-0">
                        {row.title && <span className="truncate" title={row.title}>{row.title}</span>}
                        {row.designType && (
                          <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 leading-none">
                            {row.designType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-500">{row.revisionCode || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(row.completedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <CheckCircle2 className="h-4 w-4 inline-block text-emerald-600" />
                    </td>
                  </tr>
                )}
              />
              {(data?.completedTasks?.length ?? 0) === 0 && !loading && (
                <p className="text-xs text-slate-400 text-center py-4">No completions this week</p>
              )}
            </CompactCard>

            {/* Inbox */}
            <InboxCard inbox={data?.inbox ?? []} fmt={fmt} />

            {/* On Hold Tasks */}
            <CompactCard title="On Hold Tasks">
              <MiniTable
                headers={['Task No', 'Title', 'Rev', 'Hold Date', 'Reason']}
                rows={data?.onHoldTasks ?? []}
                renderRow={(row) => (
                  <tr key={row.taskNo}>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{row.taskNo}</td>
                    <td className="px-3 py-2 max-w-[140px]">
                      <div className="flex items-start gap-1.5 min-w-0">
                        {row.title && <span className="truncate" title={row.title}>{row.title}</span>}
                        {row.designType && (
                          <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 leading-none">
                            {row.designType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-500">{row.revisionCode || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(row.holdDate)}</td>
                    <td className="px-3 py-2 text-slate-500">{row.reason ?? 'Pending approval'}</td>
                  </tr>
                )}
              />
              {(data?.onHoldTasks?.length ?? 0) === 0 && !loading && (
                <p className="text-xs text-slate-400 text-center py-4">No tasks on hold</p>
              )}
            </CompactCard>

            {/* Reallocated Tasks */}
            <CompactCard title="Reallocated Tasks">
              <MiniTable
                headers={['Task No', 'Title', 'Rev', 'Assigned From', 'Reassigned To']}
                rows={data?.reallocatedTasks ?? []}
                renderRow={(row) => (
                  <tr key={row.taskNo + row.reassignedAt}>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{row.taskNo}</td>
                    <td className="px-3 py-2 max-w-[130px]">
                      <div className="flex items-start gap-1.5 min-w-0">
                        {row.title && <span className="truncate" title={row.title}>{row.title}</span>}
                        {row.designType && (
                          <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 leading-none">
                            {row.designType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-500">{row.revisionCode || '—'}</td>
                    <td className="px-3 py-2 max-w-[90px] truncate text-slate-400" title={row.fromAssigneeName ?? ''}>{row.fromAssigneeName || '—'}</td>
                    <td className="px-3 py-2 max-w-[90px] truncate text-slate-700" title={row.newAssigneeName}>{row.newAssigneeName}</td>
                  </tr>
                )}
              />
              {(data?.reallocatedTasks?.length ?? 0) === 0 && !loading && (
                <p className="text-xs text-slate-400 text-center py-4">No reallocations this week</p>
              )}
            </CompactCard>

            {/* Task Summary */}
            <section className="ui-surface ui-card-pad flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Task Summary</h2>
                <button className="text-slate-400 hover:text-slate-600 transition">
                  <Ellipsis className="h-4 w-4" />
                </button>
              </div>

              {hasDonut ? (
                <div className="flex justify-center">
                  <DonutChart donut={summary.donut} />
                </div>
              ) : (
                <div className="mx-auto h-24 w-24 rounded-full bg-slate-100 flex items-center justify-center">
                  <span className="text-xs text-slate-400">No data</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 shadow-sm text-center">
                  <p className="text-slate-500 font-medium mb-0.5">On-Time %</p>
                  <p className="text-lg font-bold text-emerald-600">{summary?.onTimePct ?? 0}%</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 shadow-sm text-center">
                  <p className="text-slate-500 font-medium mb-0.5">Reallocated</p>
                  <p className="text-lg font-bold text-slate-900">{summary?.reallocatedPct ?? 0}%</p>
                </div>
              </div>

              <div className="flex-1 mt-2">
                <p className="mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Task Status</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  <div className="h-full w-full" style={progressStyle} />
                </div>
              </div>

              <div className="mt-auto flex items-center justify-end gap-1.5 text-xs font-medium text-slate-400">
                <UserRound className="h-3.5 w-3.5" />
                {updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Updated just now'}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
