"use client";

import { ActivityFeedItem } from "./ActivityFeedItem";

const SECTION = {
  task_update: "Task Update",
  project_milestone: "Project Milestone",
};

export function ActivityFeedList({ items, likes, onToggleLike, activityKind }) {
  const title = SECTION[activityKind];
  const nowMs = Date.now();

  return (
    <section className="ui-surface flex min-h-[220px] flex-1 flex-col overflow-hidden p-3 sm:min-h-[min(520px,calc(100dvh-10rem))] sm:p-4">
      {title ? <h2 className="mb-1.5 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h2> : null}
      {items.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-16 text-center text-sm text-slate-500">
          No activity matches your filters.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="m-0 list-none divide-y divide-slate-100 p-0">
            {items.map((item) => (
              <ActivityFeedItem
                key={item.id}
                item={item}
                liked={Boolean(likes[item.id])}
                onToggleLike={onToggleLike}
                nowMs={nowMs}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
