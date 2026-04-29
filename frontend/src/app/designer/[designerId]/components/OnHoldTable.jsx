"use client";
import { AlertTriangle } from "lucide-react";

export default function OnHoldTable({ tasks }) {
  return (
    <div className="ui-surface overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="ui-table-header border-b border-slate-200">
            <th className="px-4 py-2.5 text-left">No</th>
            <th className="px-4 py-2.5 text-left">Details</th>
            <th className="px-4 py-2.5 text-left">Task No</th>
            <th className="px-4 py-2.5 text-left">Project Details</th>
            <th className="px-4 py-2.5 text-left">%</th>
            <th className="px-4 py-2.5 text-left">Deadlines</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, idx) => (
            <tr
              key={task.no}
              className={idx % 2 === 0 ? "bg-white transition-colors hover:bg-slate-50" : "bg-slate-50/60 transition-colors hover:bg-slate-100/70"}
            >
              <td className="px-4 py-2.5 font-semibold text-slate-800">{task.no}</td>
              <td className="px-4 py-2.5 text-slate-700">{task.details}</td>
              <td className="px-4 py-2.5 font-semibold text-slate-800">{task.taskNo}</td>
              <td className="px-4 py-2.5 font-semibold text-slate-900">{task.projectDetails}</td>
              <td className="px-4 py-2.5 text-slate-700">{task.pct}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-800">{task.deadline}</span>
                  {task.urgent && (
                    <AlertTriangle
                      className="h-3.5 w-3.5 text-red-500 fill-red-100 shrink-0"
                      aria-label="Urgent deadline"
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
