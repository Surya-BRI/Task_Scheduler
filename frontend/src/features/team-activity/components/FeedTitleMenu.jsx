"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { LUCIDE_ICON_STROKE } from "@/constants/icons";

const ITEMS = [
  { id: "sort_latest", label: "Sort by Latest" },
  { id: "sort_oldest", label: "Sort by Oldest" },
  { id: "show_tasks", label: "Show Task Updates" },
  { id: "show_milestones", label: "Show Project Milestones" },
];

export function FeedTitleMenu({ onAction }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }

    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Feed options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="ui-icon-button"
      >
        <MoreVertical className="h-5 w-5" strokeWidth={LUCIDE_ICON_STROKE} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="ui-popover-panel absolute right-0 top-full z-[70] mt-2 min-w-[220px] overflow-hidden py-1">
          {ITEMS.map((row) => (
            <button
              key={row.id}
              type="button"
              role="menuitem"
              className="w-full cursor-pointer px-4 py-2.5 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
              onClick={() => {
                onAction(row.id);
                setOpen(false);
              }}
            >
              {row.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
