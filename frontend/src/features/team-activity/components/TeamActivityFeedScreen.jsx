"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { MOCK_ACTIVITIES } from "../data/mockActivities";
import { filterActivities } from "../lib/teamActivityFilters";
import { TeamActivityFilters } from "./TeamActivityFilters";
import { ActivityFeedList } from "./ActivityFeedList";

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

export function TeamActivityFeedScreenInner({ designerMode = false }) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const seededFromDesignList = useRef(false);

  const [teammateMode, setTeammateMode] = useState(designerMode ? "individuals" : "all");
  const [activityKind, setActivityKind] = useState("task_update");
  const [sortMonthIndex, setSortMonthIndex] = useState("all");
  const [priority, setPriority] = useState("all");
  const [dateRange, setDateRange] = useState(DEFAULT_RANGE);
  const [timeOrder, setTimeOrder] = useState("latest");
  const [likes, setLikes] = useState(buildInitialLikes);

  useEffect(() => {
    if (from === "design-list" && !seededFromDesignList.current) {
      seededFromDesignList.current = true;
      setActivityKind("task_update");
      setTimeOrder("latest");
      setSortMonthIndex("all");
      setTeammateMode(designerMode ? "individuals" : "all");
      setPriority("all");
    }
  }, [designerMode, from]);

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

  return (
    <div className="app-shell flex min-h-dvh flex-col overflow-x-hidden font-sans antialiased">
      <Navbar />

      <main className="ui-page-shell ta-page-shell">
        <TeamActivityFilters
          teammateMode={teammateMode}
          onTeammateMode={setTeammateMode}
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
          showTeammateFilter={!designerMode}
        />

        <ActivityFeedList items={visible} likes={likes} onToggleLike={onToggleLike} activityKind={activityKind} />
      </main>
    </div>
  );
}
