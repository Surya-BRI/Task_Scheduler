import { getWeekDays } from "./schedulerWeek";

export const SCHEDULER_NAV_STATE_KEY = "design_scheduler_nav_state_v1";

export function formatLocalYyyyMmDd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseWeekStartDate(weekStart) {
  const trimmed = String(weekStart ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function snapshotSchedulerNavState({
  currentDate,
  viewMode,
  selectedDays,
  searchQuery,
}) {
  const weekDates = getWeekDays(currentDate);
  return {
    weekStart: formatLocalYyyyMmDd(weekDates[0]),
    viewMode: viewMode === "custom" ? "custom" : "week",
    selectedDays: Array.isArray(selectedDays)
      ? selectedDays.filter((day) => Number.isFinite(day) && day >= 0 && day <= 6)
      : [],
    searchQuery: String(searchQuery ?? ""),
  };
}

export function readSchedulerNavState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCHEDULER_NAV_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      weekStart: typeof parsed.weekStart === "string" ? parsed.weekStart : null,
      viewMode: parsed.viewMode === "custom" ? "custom" : "week",
      selectedDays: Array.isArray(parsed.selectedDays)
        ? parsed.selectedDays.filter((day) => Number.isFinite(day) && day >= 0 && day <= 6)
        : [],
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
    };
  } catch {
    return null;
  }
}

export function writeSchedulerNavState(state) {
  if (typeof window === "undefined" || !state) return;
  try {
    sessionStorage.setItem(
      SCHEDULER_NAV_STATE_KEY,
      JSON.stringify({
        weekStart: state.weekStart ?? null,
        viewMode: state.viewMode === "custom" ? "custom" : "week",
        selectedDays: Array.isArray(state.selectedDays) ? state.selectedDays : [],
        searchQuery: String(state.searchQuery ?? ""),
        savedAt: Date.now(),
      }),
    );
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function parseSchedulerNavFromSearchParams(searchParams) {
  if (!searchParams) return null;

  const weekStart = searchParams.get("week")?.trim() ?? "";
  const viewMode = searchParams.get("view")?.trim() ?? "";
  const daysRaw = searchParams.get("days")?.trim() ?? "";
  const searchQuery = searchParams.get("q") ?? "";

  if (!weekStart && viewMode !== "custom" && !daysRaw && !searchQuery.trim()) {
    return null;
  }

  const selectedDays = daysRaw
    ? daysRaw
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((day) => Number.isFinite(day) && day >= 0 && day <= 6)
    : [];

  return {
    weekStart: weekStart || null,
    viewMode: viewMode === "custom" ? "custom" : "week",
    selectedDays,
    searchQuery,
  };
}

export function buildDesignSchedulerPath(stateOverride) {
  const state = stateOverride ?? readSchedulerNavState();
  if (!state) return "/design-scheduler";

  const params = new URLSearchParams();
  if (state.weekStart) params.set("week", state.weekStart);
  if (state.viewMode === "custom") {
    params.set("view", "custom");
    if (state.selectedDays?.length) {
      params.set("days", state.selectedDays.join(","));
    }
  }
  if (state.searchQuery?.trim()) params.set("q", state.searchQuery.trim());

  const qs = params.toString();
  return qs ? `/design-scheduler?${qs}` : "/design-scheduler";
}

export function resolveSchedulerNavState(searchParams) {
  return parseSchedulerNavFromSearchParams(searchParams) ?? readSchedulerNavState();
}
