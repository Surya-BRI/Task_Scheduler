"use client";
import { useEffect, useState } from "react";

export default function WeeksSection({ completedTasksByWeek, onOpenTask }) {
  const weekKeys = Object.keys(completedTasksByWeek); // ["Week 1", "Week 2", ...]
  const [activeWeek, setActiveWeek] = useState(weekKeys[0]);

  useEffect(() => {
    if (!weekKeys.includes(activeWeek)) {
      setActiveWeek(weekKeys[0]);
    }
  }, [activeWeek, weekKeys]);

  const tasks = completedTasksByWeek[activeWeek] || [];

  return (
    <div className="ui-surface ui-card-pad">
      <h3 className="mb-3 text-sm font-bold text-slate-800">Weeks Completed</h3>

      {/* Week buttons */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {weekKeys.map((week) => (
          <button
            key={week}
            type="button"
            onClick={() => setActiveWeek(week)}
            className={`ui-chip-button flex-1 min-w-[100px] ${
              activeWeek === week
                ? "ui-chip-button-active"
                : ""
            }`}
          >
            {week}
          </button>
        ))}
      </div>

      {/* Completed Tasks Table */}
      <CompletedTable tasks={tasks} onOpenTask={onOpenTask} />
    </div>
  );
}

function CompletedTable({ tasks, onOpenTask }) {
  return (
    <div className="ui-surface overflow-hidden rounded-lg">
      <table className="w-full text-xs">
        <thead>
          <tr className="ui-table-header border-b border-slate-200">
            <th className="py-2.5 px-3 text-left">Task No</th>
            <th className="py-2.5 px-3 text-left">Project Details</th>
            <th className="py-2.5 px-3 text-left">Design Type</th>
            <th className="py-2.5 px-3 text-left">Rev</th>
            <th className="py-2.5 px-3 text-left">Status</th>
            <th className="py-2.5 px-3 text-left">% Complete</th>
            <th className="py-2.5 px-3 text-left">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr>
              <td className="py-6 px-3 text-center text-slate-500" colSpan={7}>
                No completed tasks
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
              <td className="py-2.5 px-3 text-slate-700 max-w-[220px]">
                <span className="block truncate" title={task.projectDetails}>{task.projectDetails}</span>
              </td>
              <td className="py-2.5 px-3">
                {task.designType ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 whitespace-nowrap">{task.designType}</span>
                ) : <span className="text-slate-400">—</span>}
              </td>
              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{task.revisionCode ?? "—"}</td>
              <td className="py-2.5 px-3">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {task.status ?? "COMPLETED"}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${task.pctComplete}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap font-medium text-slate-700">{task.pctComplete} %</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{task.deadline}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
