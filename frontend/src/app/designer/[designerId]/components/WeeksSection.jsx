"use client";
import { useState } from "react";

export default function WeeksSection({ completedTasksByWeek }) {
  const weekKeys = Object.keys(completedTasksByWeek); // ["Week 1", "Week 2", ...]
  const [activeWeek, setActiveWeek] = useState(weekKeys[0]);

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
      <CompletedTable tasks={tasks} />
    </div>
  );
}

function CompletedTable({ tasks }) {
  return (
    <div className="ui-surface overflow-hidden rounded-lg">
      <table className="w-full text-xs">
        <thead>
          <tr className="ui-table-header border-b border-slate-200">
            <th className="py-2.5 px-3 text-left">Task No</th>
            <th className="py-2.5 px-3 text-left">Project Details</th>
            <th className="py-2.5 px-3 text-left">% Complete</th>
            <th className="py-2.5 px-3 text-left">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, idx) => (
            <tr key={task.taskNo} className={idx % 2 === 0 ? "bg-white transition-colors hover:bg-slate-50" : "bg-slate-50/60 transition-colors hover:bg-slate-100/70"}>
              <td className="py-2.5 px-3 font-semibold text-slate-900">{task.taskNo}</td>
              <td className="py-2.5 px-3 text-slate-700">{task.projectDetails}</td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${task.pctComplete}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap font-medium text-slate-700">{task.pctComplete} %</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-slate-700">{task.deadline}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
