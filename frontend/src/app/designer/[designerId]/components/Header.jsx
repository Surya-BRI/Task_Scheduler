"use client";
import { Calendar, Grid2x2, MessageSquare, Bell } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Header({ designer }) {
  const router = useRouter();

  return (
    <header className="bg-white border-b border-gray-200 flex items-center px-4 py-2 gap-4 shrink-0" style={{ minHeight: 56 }}>
      {/* Logo */}
      <button
        type="button"
        onClick={() => router.push("/design-list")}
        className="flex items-center gap-2 shrink-0"
        aria-label="Go to main page"
      >
        <img
          src="/blue-rhine-logo.png"
          alt="Blue Rhine Industries"
          className="h-10 w-auto object-contain"
        />
      </button>

      {/* Date Range */}
      <span className="text-sm font-semibold text-gray-600 shrink-0">
        {designer.dateRange}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Current Day */}
      <span className="text-base font-bold text-gray-900 shrink-0">
        {designer.currentDay}
      </span>

      {/* Icons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition"
          aria-label="Calendar"
        >
          <Calendar className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition"
          aria-label="Grid"
        >
          <Grid2x2 className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition"
          aria-label="Messages"
        >
          <MessageSquare className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="relative p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" strokeWidth={1.75} />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
      </div>

      {/* User Profile */}
      <div className="flex items-center gap-2 shrink-0 border-l border-gray-200 pl-3">
        <div className="text-right">
          <div className="text-xs font-bold text-gray-900 leading-tight">
            Name: {designer.name}
          </div>
          <div className="text-xs text-gray-500 leading-tight">
            Designation: {designer.designation}
          </div>
        </div>
        <div className="h-9 w-9 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0 overflow-hidden border-2 border-gray-200">
          {designer.avatar ? (
            <img src={designer.avatar} alt={designer.name} className="h-full w-full object-cover" />
          ) : (
            <span>{designer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
          )}
        </div>
      </div>
    </header>
  );
}
