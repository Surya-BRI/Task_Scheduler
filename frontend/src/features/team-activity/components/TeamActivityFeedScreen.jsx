"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { connectDashboardRealtime, isDashboardRealtimeConnected } from "@/lib/realtime";
import { fetchTeamActivities, fetchUserActivities } from "../services/activities.api";
import { filterActivities } from "../lib/teamActivityFilters";
import { TeamActivityFilters } from "./TeamActivityFilters";
import { ActivityFeedList } from "./ActivityFeedList";
import { IndividualsPeopleList } from "./IndividualsPeopleList";

import { toUserFacingError } from "@/lib/api-error"
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

const COLD_LIMIT = 40;
const DELTA_LIMIT = 20;
const POLL_MS = 90_000;

export function TeamActivityFeedScreenInner() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const seededFromDesignList = useRef(false);

  const [teammateMode, setTeammateMode] = useState("all");
  const [activityKind, setActivityKind] = useState("all");
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
  const [activityError, setActivityError] = useState("");
  const lastActivityErrorRef = useRef("");
  const loadGenerationRef = useRef(0);
  const newestOccurredAtRef = useRef(null);

  const mergeDelta = useCallback((incoming) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setActivities((prev) => {
      const seen = new Set(prev.map((a) => a.id));
      const fresh = incoming.filter((a) => a?.id && !seen.has(a.id));
      if (fresh.length === 0) return prev;
      setLikes((prevLikes) => ({ ...buildInitialLikes(fresh), ...prevLikes }));
      const next = [...fresh, ...prev];
      const top = next[0]?.occurredAt;
      if (top) newestOccurredAtRef.current = top;
      return next;
    });
  }, []);

  const loadActivities = useCallback((opts = {}) => {
    const { silent = false, delta = false } = opts;
    const generation = ++loadGenerationRef.current;
    if (!silent) setLoading(true);

    const params = delta
      ? {
          limit: DELTA_LIMIT,
          ...(newestOccurredAtRef.current ? { since: newestOccurredAtRef.current } : {}),
        }
      : { limit: COLD_LIMIT };

    return fetchTeamActivities(params)
      .then((page) => {
        if (generation !== loadGenerationRef.current) return;
        const data = page.data;
        if (delta && newestOccurredAtRef.current) {
          mergeDelta(data);
        } else {
          setActivities(data);
          setLikes(buildInitialLikes(data));
          newestOccurredAtRef.current = data[0]?.occurredAt ?? null;
        }
        setActivityError("");
        lastActivityErrorRef.current = "";
        setLoading(false);
      })
      .catch((err) => {
        if (generation !== loadGenerationRef.current) return;
        const message = toUserFacingError(err, "Failed to load activities.");
        setActivityError(message);
        setLoading(false);
        if (lastActivityErrorRef.current !== message) {
          lastActivityErrorRef.current = message;
          console.warn("Team Activity feed temporarily unavailable:", message);
        }
      });
  }, [mergeDelta]);

  useEffect(() => {
    void loadActivities({ silent: false, delta: false });
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      // When WS is healthy, dashboard:refresh drives deltas — skip fat/full polls.
      if (isDashboardRealtimeConnected()) return;
      void loadActivities({ silent: true, delta: true });
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadActivities({ silent: true, delta: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      loadGenerationRef.current += 1;
    };
  }, [loadActivities]);

  useEffect(() => {
    let timer = null;
    const unsub = connectDashboardRealtime({
      onDashboardRefresh: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (document.visibilityState === "visible") {
            void loadActivities({ silent: true, delta: true });
          }
        }, 400);
      },
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [loadActivities]);

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
    fetchUserActivities(selectedPersonId, { limit: COLD_LIMIT })
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

        {activityError ? (
          <div className="ui-alert-warning">
            Team Activity is temporarily unavailable: {activityError}. The feed will retry automatically.
          </div>
        ) : null}

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
