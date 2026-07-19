"use client";
import { useEffect, useState } from "react";

export default function WeeksSection({ completedTasksByWeek, onOpenTask }) {
  const weekKeys = Object.keys(completedTasksByWeek);
  const [activeWeek, setActiveWeek] = useState(weekKeys[0]);

  useEffect(() => {
    if (!weekKeys.includes(activeWeek)) {
      setActiveWeek(weekKeys[0]);
    }
  }, [activeWeek, weekKeys]);

  const tasks = completedTasksByWeek[activeWeek] || [];

  return (
    <div className="ui-surface ui-card-pad">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">Closed By Week</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Client Accepted + Client Rejected. Monthly Closed counts only this calendar month.
          </p>
        </div>

        {weekKeys.length > 0 && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {weekKeys.map((week) => (
              <button
                key={week}
                type="button"
                onClick={() => setActiveWeek(week)}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  activeWeek === week
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {week}
              </button>
            ))}
          </div>
        )}
      </div>

      <CompletedTable tasks={tasks} onOpenTask={onOpenTask} />
    </div>
  );
}

function CompletedTable({ tasks, onOpenTask }) {
  const formatClosedOn = (dateLike) => {
    if (!dateLike) return "—";
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB");
  };

  return (
    <div className="ui-surface overflow-hidden rounded-lg">
      <table className="w-full text-xs">
        <thead>
          <tr className="ui-table-header border-b border-slate-200">
            <th className="py-2.5 px-3 text-left">Task No</th>
            <th className="py-2.5 px-3 text-left">Op No</th>
            <th className="py-2.5 px-3 text-left">Revision</th>
            <th className="py-2.5 px-3 text-left">Project Details</th>
            <th className="py-2.5 px-3 text-left">Design Type</th>
            <th className="py-2.5 px-3 text-left">Status</th>
            <th className="py-2.5 px-3 text-left">Closed On</th>
            <th className="py-2.5 px-3 text-left">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr>
              <td className="py-6 px-3 text-center text-slate-500" colSpan={8}>
                No Closed Tasks
              </td>
            </tr>
          )}
          {tasks.map((task, idx) => (
            <tr
              key={task.id ?? task.taskNo}
              onClick={() => onOpenTask?.(task)}
              className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} cursor-pointer transition-colors hover:bg-slate-100/70`}
            >
              <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">{task.taskNo}</td>
              <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">{task.opNo ?? "—"}</td>
              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{task.revisionCode ?? "—"}</td>
              <td className="py-2.5 px-3 text-slate-700 max-w-[220px]">
                <span className="block truncate" title={task.projectDetails}>{task.projectDetails}</span>
              </td>
              <td className="py-2.5 px-3">
                {task.designType ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 whitespace-nowrap">{task.designType}</span>
                ) : <span className="text-slate-400">—</span>}
              </td>
              <td className="py-2.5 px-3">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {task.status ?? "CLOSED"}
                </span>
              </td>
              <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{formatClosedOn(task.completedAt)}</td>
              <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{task.deadline}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
