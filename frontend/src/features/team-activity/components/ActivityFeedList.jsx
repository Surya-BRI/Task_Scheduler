"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { VirtualScrollList } from "@/components/VirtualScrollList";
import { ActivityFeedItem } from "./ActivityFeedItem";

const SECTION = {
  all: "Team Activity",
  task_update: "Task Update",
  project_milestone: "Project Milestone",
};

export function ActivityFeedList({
  items,
  likes,
  onToggleLike,
  activityKind,
  heading,
  onBack,
}) {
  const title = heading ?? SECTION[activityKind];
  const [nowMs] = useState(() => Date.now());

  return (
    <section className="ui-surface flex min-h-[220px] flex-1 flex-col overflow-hidden p-3 sm:min-h-[min(520px,calc(100dvh-10rem))] sm:p-4">
      {title ? (
        <div className="mb-1.5 flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="ui-icon-button h-8 w-8 text-slate-600"
              aria-label="Back to individuals"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-16 text-center text-sm text-slate-500">
          No activity matches your filters.
        </p>
      ) : (
        <VirtualScrollList
          items={items}
          estimateSize={96}
          overscan={10}
          gap={0}
          className="min-h-0 flex-1 overflow-y-auto pr-1"
          getItemKey={(item) => item.id}
          renderItem={(item) => (
            <div className="border-b border-slate-100">
              <ActivityFeedItem
                item={item}
                liked={Boolean(likes[item.id])}
                onToggleLike={onToggleLike}
                nowMs={nowMs}
              />
            </div>
          )}
        />
      )}
    </section>
  );
}
