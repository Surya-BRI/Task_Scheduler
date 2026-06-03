"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { fetchTeamActivities, fetchUserActivities } from "../services/activities.api";
import { filterActivities } from "../lib/teamActivityFilters";
import { TeamActivityFilters } from "./TeamActivityFilters";
import { ActivityFeedList } from "./ActivityFeedList";
import { IndividualsPeopleList } from "./IndividualsPeopleList";

function buildInitialLikes(activities) {
  const o = {};
  for (const a of activities) {
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
  const [likes, setLikes] = useState({});
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

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    function load() {
      fetchTeamActivities({ limit: 100 })
        .then(data => {
          if (active) {
            setActivities(data);
            setLikes(buildInitialLikes(data));
            setLoading(false);
          }
        })
        .catch(err => {
          console.error("Failed to load activities", err);
          if (active) setLoading(false);
        });
    }
    load();
    const interval = setInterval(load, 20000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const handleTeammateMode = useCallback((mode) => {
    setTeammateMode(mode);
    if (mode !== "individuals") {
      setSelectedPersonId(null);
    }
  }, []);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(
    () =>
      filterActivities(activities, {
        teammateMode,
        activityKind,
        sortMonthIndex,
        dateRange,
        timeOrder,
        priority,
      }),
    [activities, teammateMode, activityKind, sortMonthIndex, dateRange, timeOrder, priority],
  );

  const onToggleLike = useCallback((id) => {
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const individualsRoster = useMemo(() => {
    if (teammateMode !== "individuals") return [];
    const peopleById = new Map();
    for (const item of visible) {
      if (!item.user?.id) continue;
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

  const [userFeed, setUserFeed] = useState([]);
  const [userFeedLoading, setUserFeedLoading] = useState(false);

  useEffect(() => {
    if (!selectedPersonId) { setUserFeed([]); return; }
    let active = true;
    setUserFeedLoading(true);
    fetchUserActivities(selectedPersonId, { limit: 100 })
      .then(data => { if (active) { setUserFeed(data); setUserFeedLoading(false); } })
      .catch(() => { if (active) setUserFeedLoading(false); });
    return () => { active = false; };
  }, [selectedPersonId]);

  const individualFeedItems = useMemo(() => {
    if (teammateMode !== "individuals" || !selectedPersonId) return [];
    return filterActivities(userFeed, { teammateMode: "all", activityKind, sortMonthIndex, dateRange, timeOrder, priority });
  }, [selectedPersonId, teammateMode, userFeed, activityKind, sortMonthIndex, dateRange, timeOrder, priority]);

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
          loading ? <div className="p-4 text-center text-slate-500">Loading...</div> :
          <IndividualsPeopleList
            people={individualsRoster}
            selectedPersonId={selectedPersonId}
            onSelect={setSelectedPersonId}
            nowMs={nowMs}
          />
        ) : null}

        {showIndividualFeed ? (
          userFeedLoading
            ? <div className="p-4 text-center text-slate-500">Loading...</div>
            : <ActivityFeedList
                items={individualFeedItems}
                likes={likes}
                onToggleLike={onToggleLike}
                activityKind={activityKind}
                heading={selectedPerson ? `${selectedPerson.name}'s updates` : "Individual updates"}
                onBack={() => setSelectedPersonId(null)}
              />
        ) : null}

        {teammateMode !== "individuals" ? (
          loading ? <div className="p-4 text-center text-slate-500">Loading...</div> :
          <ActivityFeedList items={visible} likes={likes} onToggleLike={onToggleLike} activityKind={activityKind} />
        ) : null}
      </main>
    </div>
  );
}
