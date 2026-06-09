"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Filter, GalleryVerticalEnd, LayoutGrid, List, Pause, Play, Search, Square, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ProjectTaskTimer } from "@/components/ProjectTaskTimer";
import { getSession } from "@/lib/mock-auth";
import { FROM_DESIGNER_QUEUE, taskSummaryPath, taskViewPathForRecord } from "@/lib/design-list-routes";
import { apiClient } from "@/lib/api-client";
import { getStatusLabel, mapTaskToDesignRow, matchDateRange } from "../task-view-model";

const getStatusColor = (status) => {
  switch (status) {
    // Legacy
    case "WIP":              return "bg-blue-100 text-blue-700 border-blue-200";
    case "COMPLETED":        return "bg-green-100 text-green-700 border-green-200";
    case "PENDING":          return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "REVISION":         return "bg-orange-100 text-orange-700 border-orange-200";
    case "APPROVED":         return "bg-purple-100 text-purple-700 border-purple-200";
    case "ON_HOLD":          return "bg-slate-100 text-slate-700 border-slate-300";
    // New lifecycle
    case "DESIGN_NEW":       return "bg-amber-100 text-amber-700 border-amber-200";
    case "DESIGN_PLANNED":   return "bg-sky-100 text-sky-700 border-sky-200";
    case "IN_PROGRESS":      return "bg-blue-100 text-blue-700 border-blue-200";
    case "DESIGN_COMPLETED": return "bg-teal-100 text-teal-700 border-teal-200";
    case "HOD_REVIEW":       return "bg-violet-100 text-violet-700 border-violet-200";
    case "SALES_REVIEW":     return "bg-orange-100 text-orange-700 border-orange-200";
    case "REWORK":           return "bg-red-100 text-red-700 border-red-200";
    case "REVIEW_COMPLETED": return "bg-green-100 text-green-700 border-green-200";
    case "CLIENT_REJECTED":  return "bg-rose-100 text-rose-700 border-rose-200";
    default:                 return "bg-slate-100 text-slate-700 border-slate-200";
  }
};
const getStatusDot = (status) => ({
  // Legacy
  WIP: "bg-blue-500", COMPLETED: "bg-green-500", PENDING: "bg-yellow-500",
  REVISION: "bg-orange-500", APPROVED: "bg-purple-500", ON_HOLD: "bg-slate-500",
  // New lifecycle
  DESIGN_NEW: "bg-amber-500", DESIGN_PLANNED: "bg-sky-500", IN_PROGRESS: "bg-blue-500",
  DESIGN_COMPLETED: "bg-teal-500", HOD_REVIEW: "bg-violet-500", SALES_REVIEW: "bg-orange-500",
  REWORK: "bg-red-500", REVIEW_COMPLETED: "bg-green-500", CLIENT_REJECTED: "bg-rose-500",
}[status] || "bg-slate-500");
function taskDetailPath(row, extra = {}) { return taskViewPathForRecord(row, { from: FROM_DESIGNER_QUEUE, ...extra }); }
function truncateText(value, max = 20) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

const Toolbar = ({ viewMode, setViewMode, filters, setFilters, salesPersons, designerName }) => {
  const [showFilters, setShowFilters] = useState(false);
  const activeCount = [filters.type, filters.status, filters.salesPerson, filters.startDate, filters.endDate].filter(Boolean).length;
  const designStatuses = [
    "DESIGN_NEW", "DESIGN_PLANNED", "IN_PROGRESS", "DESIGN_COMPLETED",
    "HOD_REVIEW", "SALES_REVIEW", "REWORK", "REVIEW_COMPLETED", "CLIENT_REJECTED",
    "PENDING", "WIP", "ON_HOLD", "REVISION", "APPROVED", "COMPLETED",
  ];
  return (
    <div className="mb-4 mt-4 flex flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 leading-none shrink-0">{designerName} Design List</h1>
      <div className="relative flex flex-wrap items-center justify-end gap-2 sm:gap-3 md:ml-auto">
        <div className="relative mr-2 hidden md:block"><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><Search className="h-4 w-4 text-slate-400" /></div><input type="text" value={filters.searchQuery} onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })} placeholder="Search by OP No, Project ..." className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white text-slate-900"/></div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 shadow-sm transition-colors ${activeCount > 0 ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}><Filter size={14} /><span className="text-sm font-medium">Filters {activeCount > 0 && `(${activeCount})`}</span></button>
        {showFilters && <div className="ui-surface absolute right-20 top-12 z-50 flex w-[340px] flex-col gap-4 p-5"><div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2"><h3 className="text-sm font-semibold text-slate-800">Filter Options</h3>{activeCount > 0 && <button onClick={() => setFilters({ type: "", status: "", salesPerson: "", startDate: "", endDate: "", searchQuery: filters.searchQuery })} className="cursor-pointer rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:text-red-700">Clear All</button>}</div><div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-slate-500 uppercase">Type</label><div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><GalleryVerticalEnd size={14} className="text-slate-400 mr-2" /><select className="text-sm bg-transparent outline-none text-slate-700 cursor-pointer w-full" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All Types</option><option value="Retail">Retail</option><option value="Project">Project</option></select></div></div><div className="flex flex-col gap-1.5 mt-2"><label className="text-xs font-semibold text-slate-500 uppercase">Status</label><div className="flex flex-wrap gap-2 mt-1"><button onClick={() => setFilters({ ...filters, status: "" })} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${filters.status === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>All</button>{designStatuses.map((status) => (<button key={status} onClick={() => setFilters({ ...filters, status })} className={`px-3 py-1 rounded-full text-xs font-medium border focus:outline-none transition-all cursor-pointer ${filters.status === status ? `ring-2 ring-blue-500 ring-offset-1 shadow-sm ${getStatusColor(status)}` : `bg-white ${getStatusColor(status).replace("bg-", "hover:bg-").split(" ").filter((c) => !c.startsWith("bg-")).join(" ")}`}`}>{status === "PENDING" ? "Confirmation Pending" : getStatusLabel(status)}</button>))}</div></div><div className="flex flex-col gap-1.5"><label className="text-xs font-semibold text-slate-500 uppercase">Sales Person</label><div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><Users size={14} className="text-slate-400 mr-2" /><select className="text-sm bg-transparent outline-none text-slate-700 cursor-pointer w-full" value={filters.salesPerson} onChange={(e) => setFilters({ ...filters, salesPerson: e.target.value })}><option value="">All Sales Persons</option>{salesPersons.map((sp) => <option key={sp} value={sp}>{sp}</option>)}</select></div></div><div className="grid grid-cols-2 gap-2"><input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="text-xs rounded-lg border border-slate-200 px-2 py-2" /><input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="text-xs rounded-lg border border-slate-200 px-2 py-2" /></div></div>}
        <div className="ml-0 flex rounded-md border border-slate-200 bg-slate-100 p-1 sm:ml-1"><button onClick={() => setViewMode("list")} title="List View" className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><List size={16} /></button><button onClick={() => setViewMode("board")} title="Board View" className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === "board" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><LayoutGrid size={16} /></button></div>
      </div>
    </div>
  );
};

const Table = ({ data }) => {
  const router = useRouter();
  return <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6"><div className="ui-surface h-full overflow-auto"><table className="w-full text-xs text-left leading-tight"><thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200"><tr><th className="px-2 py-1.5">OP No</th><th className="px-2 py-1.5">Project No</th><th className="px-2 py-1.5">Business Unit</th><th className="px-2 py-1.5">Revision</th><th className="px-2 py-1.5">Project Name</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Sales Person</th><th className="px-2 py-1.5">Created</th><th className="px-2 py-1.5">Deadline</th><th className="px-2 py-1.5">Aging</th><th className="px-2 py-1.5 text-center">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{data.map((row) => <tr key={row.id} className="hover:bg-slate-50 transition-colors"><td className="px-2 py-1 text-slate-800 font-medium">{row.opNo}</td><td className="px-2 py-1"><button type="button" onClick={() => router.push(taskDetailPath(row))} className="text-left text-blue-600 cursor-pointer hover:underline font-medium">{row.projectNo}</button></td><td className="px-2 py-1 text-slate-700">{row.businessUnit}</td><td className="px-2 py-1 w-[180px]"><button type="button" onClick={() => router.push(taskDetailPath(row))} className="block w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-left text-slate-900 font-medium hover:text-blue-600 hover:underline" title={row.name}>{truncateText(row.name, 20)}</button></td><td className="px-2 py-1 text-slate-700 w-[200px] whitespace-nowrap" title={row.projectName || "—"}>{truncateText(row.projectName, 20)}</td><td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none inline-block ${getStatusColor(row.status)}`}>{getStatusLabel(row.status)}</span></td><td className="px-2 py-1 text-slate-700">{row.salesPerson}</td><td className="px-2 py-1 text-slate-500 whitespace-nowrap">{row.created}</td><td className="px-2 py-1 text-slate-500 whitespace-nowrap">{row.deadline}</td><td className={`px-2 py-1 font-medium whitespace-nowrap ${row.agingDays > 20 ? "text-red-600" : "text-slate-500"}`}>{row.agingDays} d</td><td className="px-2 py-1"><div className="inline-flex items-center justify-center"><ProjectTaskTimer taskId={String(row.id)} taskStatus={row.status} inline /></div></td></tr>)}</tbody></table></div></div>;
};

const Board = ({ data }) => {
  const router = useRouter();
  const columns = [
    { title: "Design Task New",  status: "DESIGN_NEW" },
    { title: "Design Planned",   status: "DESIGN_PLANNED" },
    { title: "In Progress",      status: "IN_PROGRESS" },
    { title: "Design Completed", status: "DESIGN_COMPLETED" },
    { title: "HOD Review",       status: "HOD_REVIEW" },
    { title: "Sales Review",     status: "SALES_REVIEW" },
    { title: "Rework / Error",   status: "REWORK" },
    { title: "Review Completed", status: "REVIEW_COMPLETED" },
    { title: "Client Rejected",  status: "CLIENT_REJECTED" },
    { title: "On Hold",          status: "ON_HOLD" },
    // Legacy statuses (existing tasks)
    { title: "WIP",                  status: "WIP" },
    { title: "Confirmation Pending", status: "PENDING" },
    { title: "Revision",             status: "REVISION" },
    { title: "Approved",             status: "APPROVED" },
    { title: "Completed",            status: "COMPLETED" },
  ];
  return <div className="flex min-h-0 flex-1 items-start gap-4 overflow-auto px-4 pb-6 sm:px-6">{columns.map((col) => <div key={col.status} className="flex-1 min-w-[280px] flex flex-col gap-4"><div className={`sticky top-0 z-10 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-sm ${getStatusColor(col.status)}`}><span className={`w-2 h-2 rounded-full ${getStatusDot(col.status)}`} />{col.title}</div><div className="flex flex-col gap-3">{data.filter((d) => d.status === col.status).map((item) => <div key={item.id} onClick={() => router.push(taskDetailPath(item))} className={`p-2.5 min-h-[84px] rounded-lg border flex flex-col cursor-pointer hover:ring-1 hover:ring-blue-300/60 ${getStatusColor(item.status).replace("text-", "text-slate-900 border-").split(" ")[0]} bg-opacity-50`}><div className="text-[10px] border-b border-slate-200/50 pb-1 mb-1 whitespace-nowrap overflow-hidden text-ellipsis"><span className="font-semibold text-slate-900">{item.opNo}</span> | <span className="text-slate-700">{item.projectNo}</span></div><div className="text-xs font-medium mb-1.5 text-slate-800 truncate leading-tight">{item.businessUnit} - {item.name}</div><div className="flex items-center justify-between mt-auto gap-1"><div className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${item.agingDays > 20 ? "text-red-500" : "text-slate-600"}`}><div className={`p-0.5 rounded flex shrink-0 ${getStatusColor(item.status)}`}><Clock size={10} className="text-slate-700" /></div>Aging {item.agingDays}d</div>{item.status !== "COMPLETED" && item.status !== "APPROVED" && <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => router.push(taskDetailPath(item, { autostart: "1" }))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-emerald-600 ring-1 ring-slate-200 hover:bg-emerald-50" title="Start timer"><Play size={11} className="fill-current" /></button><button type="button" onClick={() => router.push(taskDetailPath(item, { openPause: "1" }))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-amber-500 ring-1 ring-slate-200 hover:bg-amber-50" title="Pause timer"><Pause size={11} /></button><button type="button" onClick={() => router.push(taskDetailPath(item, { openComplete: "1" }))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-red-600 ring-1 ring-slate-200 hover:bg-red-50" title="Stop and submit"><Square size={10} className="fill-current" /></button></div>}</div></div>)}</div></div>)}</div>;
};

export function DesignerDesignListScreen() {
  const [designerIdentity, setDesignerIdentity] = useState({ id: "", name: "Designer" });
  const [allDesigns, setAllDesigns] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [filters, setFilters] = useState({ type: "", status: "", salesPerson: "", startDate: "", endDate: "", searchQuery: "" });

  useEffect(() => {
    const session = getSession();
    if (session?.role === "DESIGNER") {
      setDesignerIdentity({ id: session.designerId || session.id, name: session.name || "Designer" });
      return;
    }
    setDesignerIdentity({ id: "", name: "Designer" });
  }, []);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", "500");
    if (filters.searchQuery.trim()) params.set("search", filters.searchQuery.trim());
    if (filters.status) params.set("status", filters.status.toUpperCase());
    apiClient.get(`/tasks?${params.toString()}`).then((res) => {
      if (!mounted) return;
      const rows = Array.isArray(res?.data) ? res.data.map(mapTaskToDesignRow) : [];
      setAllDesigns(rows);
    }).catch(() => { if (mounted) setAllDesigns([]); });
    return () => { mounted = false; };
  }, [filters.searchQuery, filters.status]);

  const filteredDesigns = useMemo(() => allDesigns.filter((d) => {
    if (filters.type && d.designType !== filters.type) return false;
    if (filters.salesPerson && d.salesPerson !== filters.salesPerson) return false;
    return matchDateRange(d.submissionDate, filters.startDate, filters.endDate);
  }), [allDesigns, filters.type, filters.salesPerson, filters.startDate, filters.endDate]);

  const uniqueSalesPersons = Array.from(new Set(allDesigns.map((d) => d.salesPerson).filter(Boolean))).sort();

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar lockPrimaryNav />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0"><Toolbar viewMode={viewMode} setViewMode={setViewMode} filters={filters} setFilters={setFilters} salesPersons={uniqueSalesPersons} designerName={designerIdentity.name} /></div>
        {filteredDesigns.length < 1 ? (<div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-slate-500">No tasks are available for {designerIdentity.name}.</div>) : viewMode === "list" ? (<Table data={filteredDesigns} />) : (<Board data={filteredDesigns} />)}
      </div>
    </div>
  );
}

