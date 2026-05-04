"use client";

import { Reply, ThumbsUp } from "lucide-react";
import { LUCIDE_ICON_STROKE } from "@/constants/icons";
import { formatRelative } from "../lib/teamActivityFilters";

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
              rel="noreferrer"
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
  const { item, nowMs } = props;
  if (item.kind === "project_milestone") {
    const ts = formatRelative(new Date(item.occurredAt).getTime(), nowMs);
    return (
      <li className="flex gap-4 py-4">
        <div className="w-9 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug text-slate-900">Project: {item.project}</p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-slate-600">{item.team}</p>
          <p className="mt-2 text-xs text-slate-500">{ts}</p>
        </div>
        <div className="flex shrink-0 items-start gap-0.5">
          <button type="button" className="ui-icon-button h-8 w-8 text-slate-500" aria-label="Reply">
            <Reply className="h-5 w-5" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
          </button>
          <button type="button" className="ui-icon-button h-8 w-8 text-slate-500" aria-label="Like">
            <ThumbsUp className="h-5 w-5" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
          </button>
        </div>
      </li>
    );
  }

  const { liked, onToggleLike } = props;

  const ts = formatRelative(new Date(item.occurredAt).getTime(), nowMs);

  return (
    <li className="flex gap-4 py-4">
      <div className="shrink-0">
        <img
          src={item.user.avatarUrl}
          alt=""
          className="size-10 rounded-full object-cover ring-1 ring-slate-200"
        />
      </div>
      <div className="min-w-0 flex-1">
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
