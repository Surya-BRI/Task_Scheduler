'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Ellipsis, Inbox, Search, UserRound } from 'lucide-react';
import { Navbar } from '@/components/Navbar';

const scheduledTasks = [
  { id: 'S-101', description: 'Review Q3 report', assignee: 'AM', dueDate: '12 Oct 2023' },
  { id: 'S-102', description: 'Review complement', assignee: 'JR', dueDate: '12 Oct 2023' },
  { id: 'S-103', description: 'Review Q3 report', assignee: 'MS', dueDate: '12 Oct 2023' },
  { id: 'S-104', description: 'Review Q4 commation', assignee: 'DK', dueDate: '12 Oct 2023' },
  { id: 'S-105', description: 'Review Q3 report', assignee: 'AR', dueDate: '12 Oct 2023' },
];

const completedTasks = [
  { id: 'C-115', description: 'Finalize design', completed: '12 Oct 2023' },
  { id: 'C-114', description: 'Finalize design', completed: '20 Apr 2023' },
  { id: 'C-120', description: 'Finalize design', completed: '20 Apr 2023' },
  { id: 'C-121', description: 'Finalize design', completed: '20 Apr 2023' },
];

const holdTasks = [
  { id: 'H-201', description: 'Awaiting client sign-off', holdDate: '16 Apr 2023', reason: 'Pending approval' },
  { id: 'H-202', description: 'Awaiting client sign-off', holdDate: '16 Apr 2023', reason: 'Pending approval' },
  { id: 'H-203', description: 'Awaiting client sign-off', holdDate: '18 Apr 2023', reason: 'Pending approval' },
];

const reallocatedTasks = [
  { id: 'R-301', description: 'Move task to new team' },
  { id: 'R-302', description: 'Move task to new team' },
  { id: 'R-303', description: 'Move task to new team' },
];

function CompactCard({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm ${className}`}>
      <h2 className="mb-1.5 text-[13px] font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function MiniTable({ headers, rows, renderRow }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100">
      <table className="w-full text-left text-[11px] text-slate-700">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-2 py-0.5 font-semibold">
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

export function ProjectsOverviewScreen() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3));
  const weekLabel = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - 3);
    const end = new Date(currentDate);
    end.setDate(end.getDate() + 3);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [currentDate]);

  const handleDateChange = (event) => {
    if (!event.target.value) return;
    const [yyyy, mm, dd] = event.target.value.split('-');
    setCurrentDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto h-[calc(100vh-165px)] w-full max-w-[1450px] overflow-y-auto px-3 py-1.5 sm:px-5">
        <div className="mb-1.5 flex items-center justify-between">
          <h1 className="text-[30px] font-bold tracking-tight text-slate-900">Projects</h1>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-40 items-center rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-500">
              <Search className="mr-1.5 h-3 w-3" />
              Project Filter
            </div>
            <div className="relative">
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                {weekLabel}
                <CalendarDays className="h-3 w-3" />
              </button>
              <input
                type="date"
                aria-label="Select date range reference"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={currentDate.toISOString().split('T')[0]}
                onChange={handleDateChange}
                onClick={(event) => {
                  if ('showPicker' in event.currentTarget) {
                    try {
                      event.currentTarget.showPicker();
                    } catch {}
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="h-7 rounded-md border border-slate-200 bg-[#dce7df] px-2.5 text-[12px] font-semibold text-slate-700"
            >
              Filter: All
            </button>
          </div>
        </div>

        <div className="grid min-h-[calc(100%-36px)] gap-1.5 lg:grid-cols-[1fr_1fr_220px]">
          <CompactCard title="Scheduled Tasks">
            <MiniTable
              headers={['ID', 'Description', 'Assignee', 'Due Date']}
              rows={scheduledTasks}
              renderRow={(row) => (
                <tr key={row.id}>
                  <td className="px-2 py-0.5">{row.id}</td>
                  <td className="px-2 py-0.5">{row.description}</td>
                  <td className="px-2 py-0.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600">
                      {row.assignee}
                    </span>
                  </td>
                  <td className="px-2 py-0.5">{row.dueDate}</td>
                </tr>
              )}
            />
          </CompactCard>

          <CompactCard title="Completed Tasks">
            <MiniTable
              headers={['ID', 'Description', 'Completed', '']}
              rows={completedTasks}
              renderRow={(row) => (
                <tr key={row.id}>
                  <td className="px-2 py-0.5">{row.id}</td>
                  <td className="px-2 py-0.5">{row.description}</td>
                  <td className="px-2 py-0.5">{row.completed}</td>
                  <td className="px-2 py-0.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  </td>
                </tr>
              )}
            />
          </CompactCard>

          <CompactCard title="Inbox" className="h-full">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 text-[11px] text-slate-500">
              <Inbox className="h-3.5 w-3.5" />
              <span>0</span>
            </div>
            <div className="grid h-[132px] place-items-center text-xs text-slate-400">EMPTY</div>
          </CompactCard>

          <CompactCard title="On Hold Tasks">
            <MiniTable
              headers={['ID', 'Description', 'Hold Date', 'Reason']}
              rows={holdTasks}
              renderRow={(row) => (
                <tr key={row.id}>
                  <td className="px-2 py-0.5">{row.id}</td>
                  <td className="px-2 py-0.5">⌛ {row.description}</td>
                  <td className="px-2 py-0.5">{row.holdDate}</td>
                  <td className="px-2 py-0.5">{row.reason}</td>
                </tr>
              )}
            />
          </CompactCard>

          <CompactCard title="Reallocated Tasks">
            <MiniTable
              headers={['ID', 'Description']}
              rows={reallocatedTasks}
              renderRow={(row) => (
                <tr key={row.id}>
                  <td className="px-2 py-0.5">{row.id}</td>
                  <td className="px-2 py-0.5">✈ {row.description}</td>
                </tr>
              )}
            />
          </CompactCard>

          <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-slate-900">Task Summary</h2>
              <Ellipsis className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <div className="mx-auto h-20 w-20 rounded-full bg-[conic-gradient(#1d4f91_0_42%,#24a14d_42%_67%,#e6b422_67%_100%)] p-3">
              <div className="grid h-full w-full place-items-center rounded-full bg-white text-[9px] text-slate-500">
                Total
                <span className="text-sm font-semibold text-slate-900">19</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-1">
                <p className="text-slate-500">On-Time Completion %</p>
                <p className="text-base font-semibold text-emerald-600">80.0%</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-1">
                <p className="text-slate-500">Reallocated Rate</p>
                <p className="text-base font-semibold text-slate-900">0.0%</p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-slate-500">Overall Task Status</p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-full bg-[linear-gradient(90deg,#1d4f91_0_40%,#24a14d_40%_72%,#e6b422_72%_100%)]" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
              <UserRound className="h-3 w-3" />
              Updated just now
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
