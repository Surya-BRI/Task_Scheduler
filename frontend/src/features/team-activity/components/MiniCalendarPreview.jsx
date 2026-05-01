"use client";

function buildGrid(year, month0) {
  const first = new Date(year, month0, 1);
  const pad = first.getDay();
  const dim = new Date(year, month0 + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MiniCalendarPreview({ year, monthIndex, title }) {
  const cells = buildGrid(year, monthIndex);
  const label =
    title ||
    `${MONTH(monthIndex)}-${year}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner">
      <div className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-slate-800">{label}</div>
      <div className="grid grid-cols-7 gap-y-1 text-[10px] font-semibold text-slate-500">
        {WD.map((d) => (
          <div key={d} className="pb-1 text-center">
            {d}
          </div>
        ))}
        {cells.map((c, idx) => (
          <div
            key={idx}
            className={`grid h-6 place-items-center text-[11px] font-medium ${c ? "rounded-md text-slate-700" : ""}`}
          >
            {c ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function MONTH(m) {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][m];
}
