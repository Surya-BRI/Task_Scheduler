"use client";

import { Reply, ThumbsUp, MessageSquare } from "lucide-react";
import { LUCIDE_ICON_STROKE } from "@/constants/icons";
import { formatRelative } from "../lib/teamActivityFilters";

const ACTION_BADGE = {
  TASK_CREATED:           { label: "Task Created",      color: "bg-emerald-100 text-emerald-700" },
  ASSIGNED_TASK:          { label: "Assigned",          color: "bg-blue-100 text-blue-700" },
  STATUS_CHANGED:         { label: "Status Changed",    color: "bg-violet-100 text-violet-700" },
  TASK_WORK_SUBMITTED:    { label: "Work Submitted",    color: "bg-amber-100 text-amber-700" },
  PROJECT_FILE_UPLOADED:  { label: "File Uploaded",     color: "bg-sky-100 text-sky-700" },
  PROJECT_FILE_DELETED:   { label: "File Deleted",      color: "bg-red-100 text-red-700" },
  TASK_FILE_UPLOADED:     { label: "File Uploaded",     color: "bg-sky-100 text-sky-700" },
  CREATED_CHATTER_POST:   { label: "Chatter Post",      color: "bg-fuchsia-100 text-fuchsia-700", icon: true },
  CREATED_CHATTER_COMMENT:{ label: "Chatter Comment",   color: "bg-cyan-100 text-cyan-700",    icon: true },
  SCHEDULER_WEEK_SAVED:   { label: "Schedule Saved",    color: "bg-teal-100 text-teal-700" },
  SCHEDULER_WEEK_LOCKED:          { label: "Schedule Locked",        color: "bg-orange-100 text-orange-700" },
  SCHEDULER_WEEK_UNLOCKED:        { label: "Schedule Unlocked",      color: "bg-orange-100 text-orange-700" },
  LEAVE_REQUEST_SUBMITTED:        { label: "Leave Request",          color: "bg-indigo-100 text-indigo-700" },
  LEAVE_REQUEST_STATUS_CHANGED:   { label: "Leave Updated",          color: "bg-indigo-100 text-indigo-700" },
  REGULARIZATION_SUBMITTED:       { label: "Regularization",         color: "bg-purple-100 text-purple-700" },
  REGULARIZATION_APPROVED:        { label: "Regularization Updated", color: "bg-purple-100 text-purple-700" },
  REGULARIZATION_REJECTED:        { label: "Regularization Updated", color: "bg-purple-100 text-purple-700" },
  REGULARIZATION_STATUS_CHANGED:  { label: "Regularization Updated", color: "bg-purple-100 text-purple-700" },
  OVERTIME_REQUEST_SUBMITTED:     { label: "Overtime Request",       color: "bg-rose-100 text-rose-700" },
  OVERTIME_REQUEST_STATUS_CHANGED:{ label: "Overtime Updated",       color: "bg-rose-100 text-rose-700" },
};

function MessageBody({ segments }) {
  return (
    <p className="text-sm leading-6 text-slate-800">
      {segments.map((seg, i) => {
        if (seg.type === "link") {
          return (
            <a
              key={i}
              href={seg.href}
              className="font-medium text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {seg.label}
            </a>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </p>
  );
}

export function ActivityFeedItem(props) {
  const { item, nowMs, liked, onToggleLike } = props;

  const ts = formatRelative(new Date(item.occurredAt).getTime(), nowMs);
  const badge = ACTION_BADGE[item.action];
  const isChatter = item.action === "CREATED_CHATTER_POST" || item.action === "CREATED_CHATTER_COMMENT";

  return (
    <li className={`flex gap-4 py-4 ${isChatter ? "rounded-lg bg-fuchsia-50/40 px-3 -mx-3" : ""}`}>
      <div className="shrink-0">
        <img
          src={item.user.avatarUrl}
          alt=""
          className="size-10 rounded-full object-cover ring-1 ring-slate-200"
        />
      </div>
      <div className="min-w-0 flex-1">
        {badge && (
          <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${badge.color}`}>
            {badge.icon && <MessageSquare className="h-3 w-3" strokeWidth={2} />}
            {badge.label}
          </span>
        )}
        <MessageBody segments={item.messageSegments} />
        <p className="mt-1.5 text-xs leading-normal text-slate-500">{ts}</p>
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        <button type="button" className="ui-icon-button h-8 w-8 text-slate-500" aria-label="Reply">
          <Reply className="h-5 w-5" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onToggleLike(item.id)}
          className={`ui-icon-button h-8 w-8 text-slate-500 ${liked ? "text-slate-800" : ""}`}
          aria-pressed={liked}
          aria-label="Like"
        >
          <ThumbsUp className={`h-5 w-5 ${liked ? "fill-current" : ""}`} strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
        </button>
      </div>
    </li>
  );
}
