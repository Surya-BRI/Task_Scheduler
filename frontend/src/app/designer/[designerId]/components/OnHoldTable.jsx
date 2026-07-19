"use client";
import { AlertTriangle } from "lucide-react";

const STATUS_PILL = {
  ON_HOLD: "bg-amber-100 text-amber-700",
  IN_REVIEW: "bg-violet-100 text-violet-700",
  ACTIVE: "bg-blue-100 text-blue-700",
  default: "bg-blue-100 text-blue-700",
};

export default function OnHoldTable({
  tasks,
  onOpenTask,
  emptyLabel = "No On Hold Tasks",
  statusTone = "ON_HOLD",
  showScheduledOn = false,
}) {
  const pillClass = STATUS_PILL[statusTone] ?? STATUS_PILL.default;
  const colSpan = showScheduledOn ? 8 : 7;

  return (
    <div className="ui-surface overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="ui-table-header border-b border-slate-200">
            <th className="px-4 py-2.5 text-left">No</th>
            <th className="px-4 py-2.5 text-left">Task No</th>
            <th className="px-4 py-2.5 text-left">Op No</th>
            <th className="px-4 py-2.5 text-left">Revision</th>
            <th className="px-4 py-2.5 text-left">Project Details</th>
            <th className="px-4 py-2.5 text-left">Status</th>
            {showScheduledOn ? (
              <th className="px-4 py-2.5 text-left">Scheduled On</th>
            ) : null}
            <th className="px-4 py-2.5 text-left">Deadlines</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={colSpan}>
                {emptyLabel}
              </td>
            </tr>
          )}
          {tasks.map((task, idx) => (
            <tr
              key={task.id ?? task.taskNo}
              onClick={() => onOpenTask?.(task)}
              className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} cursor-pointer transition-colors hover:bg-slate-100/70`}
            >
              <td className="px-4 py-2.5 font-semibold text-slate-800">{task.no}</td>
              <td className="px-4 py-2.5 font-semibold text-slate-800">{task.taskNo}</td>
              <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{task.opNo ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">{task.revisionCode ?? "—"}</td>
              <td className="px-4 py-2.5 font-semibold text-slate-900">{task.projectDetails}</td>
              <td className="px-4 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass}`}>
                  {task.status ?? statusTone}
                </span>
              </td>
              {showScheduledOn ? (
                <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                  {task.scheduledOn ?? "—"}
                </td>
              ) : null}
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
