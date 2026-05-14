"use client";

import { formatRelative } from "../lib/teamActivityFilters";

export function IndividualsPeopleList({ people, selectedPersonId, onSelect, nowMs }) {
  if (people.length === 0) {
    return (
      <section className="ui-surface flex min-h-[220px] flex-1 flex-col overflow-hidden p-3 sm:min-h-[min(520px,calc(100dvh-10rem))] sm:p-4">
        <h2 className="mb-1.5 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Individuals</h2>
        <p className="flex flex-1 items-center justify-center py-16 text-center text-sm text-slate-500">
          No individuals match your filters.
        </p>
      </section>
    );
  }

  return (
    <section className="ui-surface flex min-h-[220px] flex-1 flex-col overflow-hidden p-3 sm:min-h-[min(520px,calc(100dvh-10rem))] sm:p-4">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Individuals</h2>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((person) => {
            const isSelected = selectedPersonId === person.id;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onSelect(person.id)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <img
                    src={person.avatarUrl}
                    alt=""
                    className="size-11 rounded-full object-cover ring-1 ring-slate-200"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{person.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {person.activityCount} update{person.activityCount === 1 ? "" : "s"}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      Latest {formatRelative(new Date(person.latestAt).getTime(), nowMs)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
