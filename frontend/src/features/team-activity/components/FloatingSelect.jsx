"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { LUCIDE_ICON_STROKE } from "@/constants/icons";

/**
 * Controlled floating panel dropdown (months, years, or generic labels).
 */
export function FloatingSelect({ label, value, options, onChange, className = "", buttonClassName = "" }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const lid = useId();

  useEffect(() => {
    if (!open) return undefined;

    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? (
        <span id={lid} className="ui-filter-label">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? lid : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`ui-select-trigger ${buttonClassName}`}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown
          className={`size-5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={LUCIDE_ICON_STROKE}
          aria-hidden
        />
      </button>
      {open ? (
        <ul role="listbox" className="ui-popover-panel absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto py-1">
          {options.map((opt) => (
            <li key={String(opt.value)} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                  opt.value === value
                    ? "bg-blue-50/80 font-semibold text-blue-900"
                    : "text-slate-700"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
