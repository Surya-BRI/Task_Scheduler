"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Eye,
  Filter,
  GalleryVerticalEnd,
  History,
  LayoutGrid,
  Link2,
  List,
  Search,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { apiClient } from "@/lib/api-client";
import { taskSummaryPath, taskViewPathForRecord } from "@/lib/design-list-routes";
import { getStatusLabel, mapTaskToDesignRow, matchDateRange, toBackendStatus } from "../task-view-model";

const getStatusColor = (status) => {
  switch (status) {
    case "DESIGN_NEW":       return "bg-amber-100 text-amber-700 border-amber-200";
    case "DESIGN_PLANNED":   return "bg-sky-100 text-sky-700 border-sky-200";
    case "IN_PROGRESS":      return "bg-blue-100 text-blue-700 border-blue-200";
    case "DESIGN_COMPLETED": return "bg-teal-100 text-teal-700 border-teal-200";
    case "HOD_REVIEW":       return "bg-violet-100 text-violet-700 border-violet-200";
    case "SALES_REVIEW":     return "bg-orange-100 text-orange-700 border-orange-200";
    case "REWORK":           return "bg-red-100 text-red-700 border-red-200";
    case "CLIENT_ACCEPTED":  return "bg-green-100 text-green-700 border-green-200";
    case "CLIENT_REJECTED":  return "bg-rose-100 text-rose-700 border-rose-200";
    case "ON_HOLD":          return "bg-slate-100 text-slate-700 border-slate-300";
    default:                 return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const getStatusDot = (status) => {
  switch (status) {
    case "DESIGN_NEW":       return "bg-amber-500";
    case "DESIGN_PLANNED":   return "bg-sky-500";
    case "IN_PROGRESS":      return "bg-blue-500";
    case "DESIGN_COMPLETED": return "bg-teal-500";
    case "HOD_REVIEW":       return "bg-violet-500";
    case "SALES_REVIEW":     return "bg-orange-500";
    case "REWORK":           return "bg-red-500";
    case "CLIENT_ACCEPTED":  return "bg-green-500";
    case "CLIENT_REJECTED":  return "bg-rose-500";
    case "ON_HOLD":          return "bg-slate-500";
    default:                 return "bg-slate-500";
  }
};

const DONE_STATUSES = new Set(["CLIENT_ACCEPTED", "DESIGN_COMPLETED"]);

function isOverdue(row) {
  if (!row.submissionDate) return false;
  if (DONE_STATUSES.has(row.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return row.submissionDate < today;
}

function recordDetailPath(record) {
  return taskViewPathForRecord(record);
}

function recordTabPath(record, tab) {
  return taskSummaryPath(record?.id, { tab });
}

function truncateText(value, max = 20) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

const Toolbar = ({ viewMode, setViewMode, filters, setFilters, salesPersons }) => {
  const [showFilters, setShowFilters] = useState(false);
  const activeCount = [
    filters.type,
    filters.status,
    filters.salesPerson,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;
  const designStatuses = [
    "DESIGN_NEW", "DESIGN_PLANNED", "IN_PROGRESS", "DESIGN_COMPLETED",
    "HOD_REVIEW", "SALES_REVIEW", "REWORK", "CLIENT_ACCEPTED", "CLIENT_REJECTED", "ON_HOLD",
  ];

  return (
    <div className="mb-4 mt-4 flex flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 leading-none shrink-0">Design List</h1>

      <div className="relative flex flex-wrap items-center justify-end gap-2 sm:gap-3 md:ml-auto">
        <div className="relative mr-2 hidden md:block">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
            placeholder="Search by OP No, Project ..."
            className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white text-slate-900"
          />
        </div>

        <button onClick={() => setShowFilters(!showFilters)} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 shadow-sm transition-colors ${activeCount > 0 ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
          <Filter size={14} />
          <span className="text-sm font-medium">Filters {activeCount > 0 && `(${activeCount})`}</span>
        </button>

        {showFilters && (
          <div className="ui-surface absolute right-20 top-12 z-50 flex w-[340px] flex-col gap-4 p-5">
            <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-semibold text-slate-800">Filter Options</h3>
              {activeCount > 0 && (
                <button onClick={() => setFilters({ type: "", status: "", salesPerson: "", startDate: "", endDate: "", searchQuery: filters.searchQuery })} className="cursor-pointer rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:text-red-700">Clear All</button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Type</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <GalleryVerticalEnd size={14} className="text-slate-400 mr-2" />
                <select className="text-sm bg-transparent outline-none text-slate-700 cursor-pointer w-full" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                  <option value="">All Types</option>
                  <option value="Retail">Retail</option>
                  <option value="Project">Project</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button onClick={() => setFilters({ ...filters, status: "" })} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${filters.status === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>All</button>
                {designStatuses.map((status) => (
                  <button key={status} onClick={() => setFilters({ ...filters, status })} className={`px-3 py-1 rounded-full text-xs font-medium border focus:outline-none transition-all cursor-pointer ${filters.status === status ? `ring-2 ring-blue-500 ring-offset-1 shadow-sm ${getStatusColor(status)}` : `bg-white ${getStatusColor(status).replace("bg-", "hover:bg-").split(" ").filter((c) => !c.startsWith("bg-")).join(" ")}`}`}>{getStatusLabel(status)}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Sales Person</label>
              <select className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none text-slate-700 cursor-pointer w-full" value={filters.salesPerson} onChange={(e) => setFilters({ ...filters, salesPerson: e.target.value })}>
                <option value="">All Sales Persons</option>
                {salesPersons.map((sp) => (<option key={sp} value={sp}>{sp}</option>))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Date Range</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="text-xs rounded-lg border border-slate-200 px-2 py-2" />
                <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="text-xs rounded-lg border border-slate-200 px-2 py-2" />
              </div>
            </div>
          </div>
        )}

        <div className="ml-0 flex rounded-md border border-slate-200 bg-slate-100 p-1 sm:ml-1">
          <button onClick={() => setViewMode("list")} title="List View" className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><List size={16} /></button>
          <button onClick={() => setViewMode("board")} title="Board View" className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === "board" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}><LayoutGrid size={16} /></button>
        </div>
      </div>
    </div>
  );
};

const Table = ({ data }) => {
  const router = useRouter();
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6"><div className="ui-surface flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[1000px] border-collapse text-left text-[11px] text-slate-700"><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100"><tr><th className="px-2 py-1.5">OP No</th><th className="px-2 py-1.5">Project No</th><th className="px-2 py-1.5">Business Unit</th><th className="px-2 py-1.5">Revision</th><th className="px-2 py-1.5">Project Name</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Sales Person</th><th className="px-2 py-1.5">Created</th><th className="px-2 py-1.5">Deadline</th><th className="px-2 py-1.5 text-right">Aging</th><th className="px-2 py-1.5 text-center">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{data.map((row, index) => { const overdue = isOverdue(row); return (<tr key={`${row.id}-${index}`} className={`transition-colors hover:bg-blue-50/40 ${overdue ? "bg-red-50/40" : index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}><td className="px-2 py-1.5 text-xs font-medium text-slate-800">{row.opNo || "—"}</td><td className="px-2 py-1.5"><button type="button" onClick={() => router.push(recordDetailPath(row))} className="text-left text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">{row.projectNo || "—"}</button></td><td className="px-2 py-1.5">{row.businessUnit || "—"}</td><td className="px-2 py-1.5">{row.revisionCode}</td><td className="px-2 py-1.5 w-[200px] whitespace-nowrap" title={row.projectName || "—"}>{truncateText(row.projectName, 20)}</td><td className="px-2 py-1.5"><span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold leading-tight ${getStatusColor(row.status)}`}>{getStatusLabel(row.status)}</span></td><td className="px-2 py-1.5">{row.salesPerson || "Unassigned"}</td><td className="px-2 py-1.5 whitespace-nowrap">{row.created || "—"}</td><td className={`px-2 py-1.5 whitespace-nowrap font-medium ${overdue ? "text-red-600" : "text-slate-700"}`}>{overdue ? <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />{row.deadline}</span> : (row.deadline || "—")}</td><td className={`px-2 py-1.5 whitespace-nowrap text-right font-semibold ${row.agingDays > 20 ? "text-red-600" : "text-slate-600"}`}>{row.agingDays != null ? `${row.agingDays} d` : "—"}</td><td className="px-2 py-1.5"><div className="flex items-center justify-center gap-1.5 text-slate-400"><button type="button" onClick={() => router.push(recordDetailPath(row))} className="rounded p-0.5 transition-colors hover:bg-slate-100 hover:text-blue-600" title="View details"><Eye className="h-3.5 w-3.5" /></button><button type="button" onClick={() => router.push(recordTabPath(row, "chatter"))} className="rounded p-0.5 transition-colors hover:bg-slate-100 hover:text-slate-600" title="Links & chatter"><Link2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => router.push(recordTabPath(row, "activity"))} className="rounded p-0.5 transition-colors hover:bg-slate-100 hover:text-emerald-600" title="Activity history"><History className="h-3.5 w-3.5" /></button><button type="button" onClick={() => router.push(recordDetailPath(row))} className="rounded p-0.5 transition-colors hover:bg-slate-100 hover:text-violet-600" title="Assignee"><UserRound className="h-3.5 w-3.5" /></button></div></td></tr>); })}</tbody></table></div></div></div>
  );
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
    { title: "Client Accepted",  status: "CLIENT_ACCEPTED" },
    { title: "Client Rejected",  status: "CLIENT_REJECTED" },
    { title: "On Hold",          status: "ON_HOLD" },
  ];

  return (
    <div className="flex min-h-0 flex-1 items-start gap-4 overflow-auto px-4 pb-6 sm:px-6">{columns.map((col) => (<div key={col.status} className="flex-1 min-w-[280px] flex flex-col gap-4"><div className={`sticky top-0 z-10 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-sm ${getStatusColor(col.status)}`}><span className={`w-2 h-2 rounded-full ${getStatusDot(col.status)}`} />{col.title}</div><div className="flex flex-col gap-3">{data.filter((d) => d.status === col.status).map((item) => (<div key={`${col.status}-${item.id}`} onClick={() => router.push(recordDetailPath(item))} className={`p-2.5 min-h-[84px] rounded-lg border flex flex-col cursor-pointer hover:ring-1 hover:ring-blue-300/60 ${getStatusColor(item.status).replace("text-", "text-slate-900 border-").split(" ")[0]} bg-opacity-50`}><div className="text-[10px] border-b border-slate-200/50 pb-1 mb-1 whitespace-nowrap overflow-hidden text-ellipsis"><span className="font-semibold text-slate-900">{item.opNo}</span> | <span className="text-slate-700">{item.projectNo}</span></div><div className="text-xs font-medium mb-1.5 text-slate-800 truncate leading-tight">{item.businessUnit} - {item.name}</div><div className="flex items-center justify-between mt-auto gap-1">{isOverdue(item) && <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 border border-red-200"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />Overdue · {item.deadline}</span>}<div className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${item.agingDays > 20 ? "text-red-500" : "text-slate-600"}`}><div className={`p-0.5 rounded flex shrink-0 ${getStatusColor(item.status)}`}><Clock size={10} className="text-slate-700" /></div>Aging {item.agingDays}d</div><div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => router.push(recordTabPath(item, "activity"))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-600 ring-1 ring-slate-200 hover:text-emerald-600" title="Activity"><History size={11} /></button><button type="button" onClick={() => router.push(recordTabPath(item, "chatter"))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-600 ring-1 ring-slate-200 hover:text-violet-600" title="Chatter"><UserRoundPlus size={11} /></button></div></div></div>))}</div></div>))}</div>
  );
};

export function DesignListScreen() {
  const PAGE_SIZE = 100;
  const [allDesigns, setAllDesigns] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: "", status: "", salesPerson: "", startDate: "", endDate: "", searchQuery: "" });

  useEffect(() => { setPage(1); }, [filters, viewMode]);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", "500");
    if (filters.searchQuery.trim()) params.set("search", filters.searchQuery.trim());
    if (filters.status) params.set("status", toBackendStatus(filters.status).toUpperCase());
    apiClient.get(`/tasks?${params.toString()}`).then((res) => {
      if (!mounted) return;
      const rows = Array.isArray(res?.data) ? res.data.map(mapTaskToDesignRow) : [];
      setAllDesigns(rows);
    }).catch(() => { if (mounted) setAllDesigns([]); });
    return () => { mounted = false; };
  }, [filters.searchQuery, filters.status]);

  const filteredDesigns = useMemo(() => allDesigns.filter((d) => {
    if (
      d.designType === "QS_TEST" ||
      d.projectNo === "BRI-QS-COMPLETED-E2E" ||
      d.projectNo?.startsWith("BRI-QS-SMOKE-") ||
      d.projectNo?.startsWith("BRI-QS-AUDIT-")
    ) return false;
    if (filters.type && d.designType !== filters.type) return false;
    if (filters.salesPerson && d.salesPerson !== filters.salesPerson) return false;
    return matchDateRange(d.submissionDate, filters.startDate, filters.endDate);
  }), [allDesigns, filters.type, filters.salesPerson, filters.startDate, filters.endDate]);

  const total = filteredDesigns.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const designs = filteredDesigns.slice(start, start + PAGE_SIZE);
  const uniqueSalesPersons = Array.from(new Set(filteredDesigns.map((d) => d.salesPerson).filter(Boolean))).sort();

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0"><Toolbar viewMode={viewMode} setViewMode={setViewMode} filters={filters} setFilters={setFilters} salesPersons={uniqueSalesPersons} /></div>
        {viewMode === "list" ? <Table data={designs} /> : <Board data={designs} />}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5 sm:px-6 text-xs text-slate-600"><span className="font-medium">Showing {total === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50">Prev</button><span className="min-w-[7rem] text-center text-xs font-medium text-slate-700">Page {currentPage} / {totalPages}</span><button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50">Next</button></div></div>
      </div>
    </div>
  );
}

