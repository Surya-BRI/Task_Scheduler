"use client";

export function TogglePillGroup({ label, value, onChange, options, className = "" }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0 ${className}`}>
      {label ? <span className="ui-filter-label">{label}</span> : null}
      <div className="ui-segmented">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`ui-segmented-tab ${active ? "ui-segmented-tab-active" : ""}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
