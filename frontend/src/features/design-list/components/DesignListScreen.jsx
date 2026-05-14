"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Eye,
  Filter,
  GalleryVerticalEnd,
  History,
  LayoutGrid,
  List,
  Search,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { apiClient } from "@/lib/api-client";
import { taskSummaryPath } from "@/lib/design-list-routes";

const getStatusColor = (status) => {
  switch (status) {
    case "WIP":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "Completed":
      return "bg-green-100 text-green-700 border-green-200";
    case "Pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Revision":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "Approved":
      return "bg-purple-100 text-purple-700 border-purple-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const getStatusDot = (status) => {
  switch (status) {
    case "WIP":
      return "bg-blue-500";
    case "Completed":
      return "bg-green-500";
    case "Pending":
      return "bg-yellow-500";
    case "Revision":
      return "bg-orange-500";
    case "Approved":
      return "bg-purple-500";
    default:
      return "bg-slate-500";
  }
};

function recordDetailPath(id) {
  return taskSummaryPath(id);
}

function recordTabPath(id, tab) {
  return taskSummaryPath(id, { tab });
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
  const designStatuses = ["WIP", "Pending", "Revision", "Approved", "Completed"];

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

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 shadow-sm transition-colors ${
            activeCount > 0
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Filter size={14} />
          <span className="text-sm font-medium">
            Filters {activeCount > 0 && `(${activeCount})`}
          </span>
        </button>

        {showFilters && (
          <div className="ui-surface absolute right-20 top-12 z-50 flex w-[340px] flex-col gap-4 p-5">
            <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-semibold text-slate-800">Filter Options</h3>
              {activeCount > 0 && (
                <button
                  onClick={() =>
                    setFilters({
                      type: "",
                      status: "",
                      salesPerson: "",
                      startDate: "",
                      endDate: "",
                      searchQuery: filters.searchQuery,
                    })
                  }
                    className="cursor-pointer rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:text-red-700"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Type</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <GalleryVerticalEnd size={14} className="text-slate-400 mr-2" />
                <select
                  className="text-sm bg-transparent outline-none text-slate-700 cursor-pointer w-full"
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                >
                  <option value="">All Types</option>
                  <option value="Retail">Retail</option>
                  <option value="Project">Project</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  onClick={() => setFilters({ ...filters, status: "" })}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    filters.status === ""
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  All
                </button>
                {designStatuses.map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilters({ ...filters, status })}
                    className={`px-3 py-1 rounded-full text-xs font-medium border focus:outline-none transition-all cursor-pointer ${
                      filters.status === status
                        ? `ring-2 ring-blue-500 ring-offset-1 shadow-sm ${getStatusColor(status)}`
                        : `bg-white ${
                            getStatusColor(status)
                              .replace("bg-", "hover:bg-")
                              .split(" ")
                              .filter((c) => !c.startsWith("bg-"))
                              .join(" ")
                          }`
                    }`}
                  >
                    {status === "Pending" ? "Confirmation Pending" : status}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Sales Person</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Users size={14} className="text-slate-400 mr-2" />
                <select
                  className="text-sm bg-transparent outline-none text-slate-700 cursor-pointer w-full"
                  value={filters.salesPerson}
                  onChange={(e) => setFilters({ ...filters, salesPerson: e.target.value })}
                >
                  <option value="">All Sales Persons</option>
                  {salesPersons.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Date Range</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400">From</span>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                    <input
                      title="Start Date"
                      type="date"
                      className="text-xs bg-transparent outline-none text-slate-700 w-full cursor-pointer pr-5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    />
                    <Calendar size={13} className="text-slate-400 pointer-events-none absolute right-2" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400">To</span>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                    <input
                      title="End Date"
                      type="date"
                      className="text-xs bg-transparent outline-none text-slate-700 w-full cursor-pointer pr-5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    />
                    <Calendar size={13} className="text-slate-400 pointer-events-none absolute right-2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="ml-0 flex rounded-md border border-slate-200 bg-slate-100 p-1 sm:ml-1">
          <button
            onClick={() => setViewMode("list")}
            title="List View"
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              viewMode === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <List size={16} />
          </button>
          <button
            onClick={() => setViewMode("board")}
            title="Board View"
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              viewMode === "board" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const Table = ({ data }) => {
  const router = useRouter();

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
      <div className="ui-surface h-full overflow-auto">
        <table className="w-full text-xs text-left leading-tight">
          <thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-2 py-1.5">OP No</th>
              <th className="px-2 py-1.5">Project No</th>
              <th className="px-2 py-1.5">Design Type</th>
              <th className="px-2 py-1.5">Business Unit</th>
              <th className="px-2 py-1.5">Name</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Sales Person</th>
              <th className="px-2 py-1.5">Created</th>
              <th className="px-2 py-1.5">Deadline</th>
              <th className="px-2 py-1.5">Aging</th>
              <th className="px-2 py-1.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, index) => (
              <tr
                key={`${row?.id || "unknown"}-${row?.orderNo || row?.opNo || "na"}-${row?.createdAt || row?.created || "date"}-${index}`}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => router.push(recordDetailPath(row.id))}
                    className="text-left text-blue-600 cursor-pointer hover:underline font-medium"
                  >
                    {row.opNo}
                  </button>
                </td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => router.push(recordDetailPath(row.id))}
                    className="text-left text-blue-600 cursor-pointer hover:underline font-medium"
                  >
                    {row.projectNo}
                  </button>
                </td>
                <td className="px-2 py-1 text-slate-700">{row.designType}</td>
                <td className="px-2 py-1 text-slate-700">{row.businessUnit}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => router.push(recordDetailPath(row.id))}
                    className="text-left text-slate-900 font-medium whitespace-nowrap hover:text-blue-600 hover:underline"
                  >
                    {row.name}
                  </button>
                </td>
                <td className="px-2 py-1">
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none inline-block ${getStatusColor(row.status)}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-700">{row.salesPerson}</td>
                <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{row.created}</td>
                <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{row.deadline}</td>
                <td
                  className={`px-2 py-1 font-medium whitespace-nowrap ${
                    row.agingDays > 20 ? "text-red-600" : "text-slate-500"
                  }`}
                >
                  {row.agingDays} d
                </td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-center gap-1.5 text-slate-400">
                    <button
                      type="button"
                      onClick={() => router.push(recordDetailPath(row.id))}
                      className="rounded p-0.5 hover:text-blue-600 transition-colors"
                      title="Details"
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(recordTabPath(row.id, "activity"))}
                      className="rounded p-0.5 hover:text-emerald-600 transition-colors"
                      title="Activity"
                    >
                      <History size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(recordTabPath(row.id, "chatter"))}
                      className="rounded p-0.5 hover:text-violet-600 transition-colors"
                      title="Chatter"
                    >
                      <UserRoundPlus size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Board = ({ data }) => {
  const router = useRouter();
  const columns = [
    { title: "WIP", status: "WIP" },
    { title: "Confirmation Pending", status: "Pending" },
    { title: "Revision", status: "Revision" },
    { title: "Approved", status: "Approved" },
    { title: "Completed", status: "Completed" },
  ];

  return (
    <div className="flex min-h-0 flex-1 items-start gap-4 overflow-auto px-4 pb-6 sm:px-6">
      {columns.map((col) => (
        <div key={col.status} className="flex-1 min-w-[280px] flex flex-col gap-4">
          <div
            className={`sticky top-0 z-10 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-sm ${getStatusColor(col.status)}`}
          >
            <span className={`w-2 h-2 rounded-full ${getStatusDot(col.status)}`} />
            {col.title}
          </div>
          <div className="flex flex-col gap-3">
            {data
              .filter((d) => d.status === col.status)
              .map((item, index) => (
                <div
                  key={`${col.status}-${item?.id || "unknown"}-${item?.orderNo || item?.opNo || "na"}-${item?.createdAt || item?.created || "date"}-${index}`}
                  onClick={() => router.push(recordDetailPath(item.id))}
                  className={`p-2.5 min-h-[84px] rounded-lg border flex flex-col cursor-pointer hover:ring-1 hover:ring-blue-300/60 ${
                    getStatusColor(item.status).replace("text-", "text-slate-900 border-").split(" ")[0]
                  } bg-opacity-50`}
                >
                  <div className="text-[10px] border-b border-slate-200/50 pb-1 mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="font-semibold text-slate-900">{item.opNo}</span> |{" "}
                    <span className="text-slate-700">{item.projectNo}</span>
                  </div>
                  <div className="text-xs font-medium mb-1.5 text-slate-800 truncate leading-tight">
                    {item.businessUnit} - {item.name}
                  </div>
                  <div className="flex items-center justify-between mt-auto gap-1">
                    <div
                      className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${
                        item.agingDays > 20 ? "text-red-500" : "text-slate-600"
                      }`}
                    >
                      <div className={`p-0.5 rounded flex shrink-0 ${getStatusColor(item.status)}`}>
                        <Clock size={10} className="text-slate-700" />
                      </div>
                      Aging {item.agingDays}d
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => router.push(recordTabPath(item.id, "activity"))}
                        className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-600 ring-1 ring-slate-200 hover:text-emerald-600"
                        title="Activity"
                      >
                        <History size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(recordTabPath(item.id, "chatter"))}
                        className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-600 ring-1 ring-slate-200 hover:text-violet-600"
                        title="Chatter"
                      >
                        <UserRoundPlus size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export function DesignListScreen() {
  const PAGE_SIZE = 100;
  const [designs, setDesigns] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState("list");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    salesPerson: "",
    startDate: "",
    endDate: "",
    searchQuery: "",
  });

  const uniqueSalesPersons = Array.from(new Set(designs.map((d) => d.salesPerson).filter(Boolean))).sort();
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [filters, viewMode]);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (filters.salesPerson) params.set("salesPerson", filters.salesPerson);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);

    apiClient
      .get(`/design-list?${params.toString()}`)
      .then((res) => {
        if (!mounted) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        setDesigns(data);
        setTotal(Number(res?.total || 0));
        setTotalPages(Math.max(1, Number(res?.totalPages || 1)));
      })
      .catch(() => {
        if (!mounted) return;
        setDesigns([]);
        setTotal(0);
        setTotalPages(1);
      });

    return () => {
      mounted = false;
    };
  }, [page, filters]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0">
          <Toolbar
            viewMode={viewMode}
            setViewMode={setViewMode}
            filters={filters}
            setFilters={setFilters}
            salesPersons={uniqueSalesPersons}
          />
        </div>
        {viewMode === "list" ? <Table data={designs} /> : <Board data={designs} />}
        <div className="shrink-0 flex items-center justify-between px-4 pb-4 pt-2 sm:px-6 text-xs text-slate-600">
          <span>
            Showing {total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-
            {Math.min(currentPage * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Prev
            </button>
            <span>
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 border border-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
