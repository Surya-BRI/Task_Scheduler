"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { MOCK_ACTIVITIES } from "../data/mockActivities";
import { filterActivities } from "../lib/teamActivityFilters";
import { TeamActivityFilters } from "./TeamActivityFilters";
import { ActivityFeedList } from "./ActivityFeedList";
import { IndividualsPeopleList } from "./IndividualsPeopleList";

function buildInitialLikes() {
  const o = {};
  for (const a of MOCK_ACTIVITIES) {
    if (a.kind === "task_update" && typeof a.liked === "boolean") o[a.id] = a.liked;
  }
  return o;
}

const DEFAULT_RANGE = () => ({
  startDate: "",
  endDate: "",
});

export function TeamActivityFeedScreenInner() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const seededFromDesignList = useRef(false);

  const [teammateMode, setTeammateMode] = useState("all");
  const [activityKind, setActivityKind] = useState("task_update");
  const [sortMonthIndex, setSortMonthIndex] = useState("all");
  const [priority, setPriority] = useState("all");
  const [dateRange, setDateRange] = useState(DEFAULT_RANGE);
  const [timeOrder, setTimeOrder] = useState("latest");
  const [likes, setLikes] = useState(buildInitialLikes);
  const [selectedPersonId, setSelectedPersonId] = useState(null);

  useEffect(() => {
    if (from === "design-list" && !seededFromDesignList.current) {
      seededFromDesignList.current = true;
      setActivityKind("task_update");
      setTimeOrder("latest");
      setSortMonthIndex("all");
      setTeammateMode("all");
      setPriority("all");
      setSelectedPersonId(null);
    }
  }, [from]);

  const handleTeammateMode = useCallback((mode) => {
    setTeammateMode(mode);
    if (mode !== "individuals") {
      setSelectedPersonId(null);
    }
  }, []);

  const [nowMs] = useState(() => Date.now());

  const visible = useMemo(
    () =>
      filterActivities(MOCK_ACTIVITIES, {
        teammateMode,
        activityKind,
        sortMonthIndex,
        dateRange,
        timeOrder,
        priority,
      }),
    [teammateMode, activityKind, sortMonthIndex, dateRange, timeOrder, priority],
  );

  const onToggleLike = useCallback((id) => {
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const individualsRoster = useMemo(() => {
    if (teammateMode !== "individuals") return [];
    const peopleById = new Map();
    for (const item of visible) {
      if (item.kind !== "task_update" || !item.user?.id) continue;
      const existing = peopleById.get(item.user.id);
      if (!existing) {
        peopleById.set(item.user.id, {
          id: item.user.id,
          name: item.user.name,
          avatarUrl: item.user.avatarUrl,
          activityCount: 1,
          latestAt: item.occurredAt,
        });
        continue;
      }
      existing.activityCount += 1;
      if (new Date(item.occurredAt).getTime() > new Date(existing.latestAt).getTime()) {
        existing.latestAt = item.occurredAt;
      }
    }
    return [...peopleById.values()].sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );
  }, [teammateMode, visible]);

  const selectedPerson = useMemo(
    () => individualsRoster.find((person) => person.id === selectedPersonId) ?? null,
    [individualsRoster, selectedPersonId],
  );

  const individualFeedItems = useMemo(() => {
    if (teammateMode !== "individuals" || !selectedPersonId) return [];
    return visible.filter((item) => item.user?.id === selectedPersonId);
  }, [selectedPersonId, teammateMode, visible]);

  const showIndividualsRoster = teammateMode === "individuals" && !selectedPersonId;
  const showIndividualFeed = teammateMode === "individuals" && Boolean(selectedPersonId);

  return (
    <div className="app-shell flex min-h-dvh flex-col overflow-x-hidden font-sans antialiased">
      <Navbar />

      <main className="ui-page-shell ta-page-shell">
        <TeamActivityFilters
          teammateMode={teammateMode}
          onTeammateMode={handleTeammateMode}
          activityKind={activityKind}
          onActivityKind={setActivityKind}
          sortMonthIndex={sortMonthIndex}
          onSortMonthIndex={setSortMonthIndex}
          timeOrder={timeOrder}
          onTimeOrderChange={setTimeOrder}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          priority={priority}
          onPriorityChange={setPriority}
        />

        {showIndividualsRoster ? (
          <IndividualsPeopleList
            people={individualsRoster}
            selectedPersonId={selectedPersonId}
            onSelect={setSelectedPersonId}
            nowMs={nowMs}
          />
        ) : null}

        {showIndividualFeed ? (
          <ActivityFeedList
            items={individualFeedItems}
            likes={likes}
            onToggleLike={onToggleLike}
            activityKind={activityKind}
            heading={selectedPerson ? `${selectedPerson.name}'s updates` : "Individual updates"}
            onBack={() => setSelectedPersonId(null)}
          />
        ) : null}

        {teammateMode !== "individuals" ? (
          <ActivityFeedList items={visible} likes={likes} onToggleLike={onToggleLike} activityKind={activityKind} />
        ) : null}
      </main>
    </div>
  );
}
