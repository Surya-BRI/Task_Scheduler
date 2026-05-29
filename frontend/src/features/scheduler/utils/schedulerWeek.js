export const DEFAULT_SCHEDULER_REFERENCE_DATE = new Date();

export const getCurrentDayIndex = (date) => (date.getDay() + 6) % 7;

export const getWeekDays = (baseDate) => {
  const dates = [];
  const currentDay = baseDate.getDay() === 0 ? 7 : baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - currentDay + 1);
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    dates.push(day);
  }
  return dates;
};

export const formatSchedulerDateRangeText = (weekDates) => {
  if (!weekDates || weekDates.length === 0) return "";
  const start = weekDates[0];
  const end = weekDates[6] || weekDates[weekDates.length - 1];
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
};
