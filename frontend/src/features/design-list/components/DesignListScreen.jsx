"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, Briefcase, Calendar, Clock, Filter, GalleryVerticalEnd, LayoutGrid, List, MessageCircle, Search, Users, } from "lucide-react";
import { useDesignListStore } from "@/state/DesignListContext";
import { Navbar } from "@/components/Navbar";
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
            return "bg-gray-100 text-gray-700 border-gray-200";
    }
};
const getStatusDot = (status) => {
    switch (status) {
        case "WIP": return "bg-blue-500";
        case "Completed": return "bg-green-500";
        case "Pending": return "bg-yellow-500";
        case "Revision": return "bg-orange-500";
        case "Approved": return "bg-purple-500";
        default: return "bg-gray-500";
    }
};
const Toolbar = ({ viewMode, setViewMode, filters, setFilters, salesPersons }) => {
    const [showFilters, setShowFilters] = useState(false);
    // Calculate active filter count (exclude search query)
    const activeCount = [filters.type, filters.status, filters.salesPerson, filters.startDate, filters.endDate].filter(Boolean).length;
    return (<div className="flex flex-col md:flex-row md:items-center justify-between mb-4 mt-6 px-6 gap-4">
      <h1 className="text-2xl font-bold text-gray-900 leading-none">Design List</h1>

      <div className="flex items-center gap-3 relative">
        {/* Moved Search Input */}
        <div className="relative mr-2 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
          <input type="text" value={filters.searchQuery} onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })} placeholder="Search by OP No, Project ..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-full text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
        </div>

        {/* Toggle Filters Button */}
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors shadow-sm cursor-pointer ${activeCount > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
          <Filter size={14}/>
          <span className="text-sm font-medium">Filters {activeCount > 0 && `(${activeCount})`}</span>
        </button>

        {/* Filters Popover */}
        {showFilters && (<div className="absolute top-12 right-20 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-5 flex flex-col gap-4 w-[340px]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
              <h3 className="font-semibold text-gray-800 text-sm">Filter Options</h3>
              {activeCount > 0 && (<button onClick={() => setFilters({ type: "", status: "", salesPerson: "", startDate: "", endDate: "", searchQuery: filters.searchQuery })} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 bg-red-50 rounded transition-colors cursor-pointer">
                  Clear All
                </button>)}
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase">Type</label>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <GalleryVerticalEnd size={14} className="text-gray-400 mr-2"/>
                <select className="text-sm bg-transparent outline-none text-gray-700 cursor-pointer w-full" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
                  <option value="">All Types</option>
                  <option value="Retail">Retail</option>
                  <option value="Project">Project</option>
                </select>
              </div>
            </div>

            {/* Status (Color Pills) */}
            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button onClick={() => setFilters({ ...filters, status: "" })} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${filters.status === "" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                  All
                </button>
                {["WIP", "Completed", "Pending", "Revision", "Approved"].map(status => (<button key={status} onClick={() => setFilters({ ...filters, status })} className={`px-3 py-1 rounded-full text-xs font-medium border focus:outline-none transition-all cursor-pointer ${filters.status === status
                    ? "ring-2 ring-blue-500 ring-offset-1 shadow-sm " + getStatusColor(status)
                    : "bg-white " + getStatusColor(status).replace('bg-', 'hover:bg-').split(' ').filter(c => !c.startsWith('bg-')).join(' ')}`}>
                    {status === "Pending" ? "Confirmation Pending" : status}
                  </button>))}
              </div>
            </div>

            {/* Sales Person */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase">Sales Person</label>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Users size={14} className="text-gray-400 mr-2"/>
                <select className="text-sm bg-transparent outline-none text-gray-700 cursor-pointer w-full" value={filters.salesPerson} onChange={e => setFilters({ ...filters, salesPerson: e.target.value })}>
                  <option value="">All Sales Persons</option>
                  {salesPersons.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase">Date Range</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">From</span>
                  <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                    <input title="Start Date" type="date" className="text-xs bg-transparent outline-none text-gray-700 w-full cursor-pointer pr-5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })}/>
                    <Calendar size={13} className="text-gray-400 pointer-events-none absolute right-2"/>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">To</span>
                  <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                    <input title="End Date" type="date" className="text-xs bg-transparent outline-none text-gray-700 w-full cursor-pointer pr-5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })}/>
                    <Calendar size={13} className="text-gray-400 pointer-events-none absolute right-2"/>
                  </div>
                </div>
              </div>
            </div>

          </div>)}

        {/* View Toggle */}
        <div className="flex bg-gray-100 rounded-full p-1 border border-gray-200 ml-2">
          <button onClick={() => setViewMode("list")} title="List View" className={`p-1.5 rounded-full transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-white shadow text-black' : 'text-gray-600 hover:bg-transparent'}`}>
            <List size={16}/>
          </button>
          <button onClick={() => setViewMode("board")} title="Board View" className={`p-1.5 rounded-full transition-colors cursor-pointer ${viewMode === 'board' ? 'bg-white shadow text-black' : 'text-gray-600 hover:bg-transparent'}`}>
            <LayoutGrid size={16}/>
          </button>
        </div>
      </div>
    </div>);
};
/** Record detail view (Details / Activity / Chatter) — same as `DesignListRecordPage`. */
function recordDetailPath(id) {
    return `/design-list/record/${id}`;
}
function recordTabPath(id, tab) {
    return `${recordDetailPath(id)}?tab=${tab}`;
}
const Table = ({ data }) => {
    const router = useRouter();
    return (<div className="px-6 pb-6 flex-1 min-h-0 flex flex-col">
      <div className="border border-gray-200 rounded-lg overflow-auto bg-white shadow-sm h-full">
        <table className="w-full text-xs text-left leading-tight">
          <thead className="bg-[#f0f3fa] text-gray-600 uppercase font-semibold sticky top-0 z-10 outline outline-1 outline-gray-200">
            <tr>
              <th className="px-2 py-1">OP No</th>
              <th className="px-2 py-1">Project No</th>
              <th className="px-2 py-1">Design Type</th>
              <th className="px-2 py-1">Business Unit</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Sales Person</th>
              <th className="px-2 py-1">Created</th>
              <th className="px-2 py-1">Deadline</th>
              <th className="px-2 py-1">Aging</th>
              <th className="px-2 py-1 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (<tr key={row.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-2 py-0">
                  <button type="button" onClick={() => router.push(recordDetailPath(row.id))} className="text-left text-blue-600 cursor-pointer hover:underline font-medium">
                    {row.opNo}
                  </button>
                </td>
                <td className="px-2 py-0">
                  <button type="button" onClick={() => router.push(recordDetailPath(row.id))} className="text-left text-blue-600 cursor-pointer hover:underline font-medium">
                    {row.projectNo}
                  </button>
                </td>
                <td className="px-2 py-0 text-gray-700">{row.designType}</td>
                <td className="px-2 py-0 text-gray-700">{row.businessUnit}</td>
                <td className="px-2 py-0">
                  <button type="button" onClick={() => router.push(recordDetailPath(row.id))} className="text-left text-gray-900 font-medium whitespace-nowrap hover:text-blue-600 hover:underline">
                    {row.name}
                  </button>
                </td>
                <td className="px-2 py-0">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none inline-block ${getStatusColor(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-2 py-0 text-gray-700">{row.salesPerson}</td>
                <td className="px-2 py-0 text-gray-500 whitespace-nowrap">{row.created}</td>
                <td className="px-2 py-0 text-gray-500 whitespace-nowrap">{row.deadline}</td>
                <td className={`px-2 py-0 font-medium whitespace-nowrap ${row.agingDays > 20 ? "text-red-600" : "text-gray-500"}`}>
                  {row.agingDays} d
                </td>
                <td className="px-2 py-0">
                  <div className="flex items-center justify-center gap-1.5 text-gray-500">
                    <button type="button" onClick={() => router.push(recordDetailPath(row.id))} className="rounded p-0.5 hover:text-blue-600 transition-colors" title="Details">
                      <Briefcase size={12}/>
                    </button>
                    <button type="button" onClick={() => router.push(recordTabPath(row.id, "activity"))} className="rounded p-0.5 hover:text-emerald-600 transition-colors" title="Activity">
                      <Activity size={12}/>
                    </button>
                    <button type="button" onClick={() => router.push(recordTabPath(row.id, "chatter"))} className="rounded p-0.5 hover:text-violet-600 transition-colors" title="Chatter">
                      <MessageCircle size={12}/>
                    </button>
                  </div>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
};
const Board = ({ data }) => {
    const router = useRouter();
    const columns = [
        { title: "WIP", status: "WIP" },
        { title: "Completed", status: "Completed" },
        { title: "Confirmation Pending", status: "Pending" },
        { title: "Revision", status: "Revision" },
        { title: "Approved", status: "Approved" },
    ];
    return (<div className="px-6 pb-6 flex-1 min-h-0 flex items-start gap-4 overflow-auto">
      {columns.map((col) => (<div key={col.status} className="flex-1 min-w-[280px] flex flex-col gap-4">
          <div className={`sticky top-0 z-10 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold shadow-sm ${getStatusColor(col.status)}`}>
            <span className={`w-2 h-2 rounded-full ${getStatusDot(col.status)}`}></span>
            {col.title}
          </div>
          <div className="flex flex-col gap-3">
            {data.filter(d => d.status === col.status).map(item => (<div key={item.id} onClick={() => router.push(recordDetailPath(item.id))} className={`p-2.5 min-h-[84px] rounded-lg border flex flex-col cursor-pointer hover:ring-1 hover:ring-blue-300/60 ${getStatusColor(item.status).replace('text-', 'text-gray-900 border-').split(' ')[0]} bg-opacity-50`}>
                <div className="text-[10px] border-b border-gray-200/50 pb-1 mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-semibold text-gray-900">{item.opNo}</span> | <span className="text-gray-700">{item.projectNo}</span>
                </div>
                <div className="text-xs font-medium mb-1.5 text-gray-800 truncate leading-tight">
                  {item.businessUnit} — {item.name}
                </div>
                <div className="flex items-center justify-between mt-auto gap-1">
                  <div className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${item.agingDays > 20 ? 'text-red-500' : 'text-gray-600'}`}>
                    <div className={`p-0.5 rounded flex shrink-0 ${getStatusColor(item.status)}`}>
                      <Clock size={10} className="text-gray-700"/>
                    </div>
                    Aging {item.agingDays}d
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => router.push(recordTabPath(item.id, "activity"))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-gray-600 ring-1 ring-gray-200 hover:text-emerald-600" title="Activity">
                      <Activity size={11}/>
                    </button>
                    <button type="button" onClick={() => router.push(recordTabPath(item.id, "chatter"))} className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-gray-600 ring-1 ring-gray-200 hover:text-violet-600" title="Chatter">
                      <MessageCircle size={11}/>
                    </button>
                  </div>
                </div>
              </div>))}
          </div>
        </div>))}
    </div>);
};
export function DesignListScreen() {
    const { records } = useDesignListStore();
    const designs = records;
    const [viewMode, setViewMode] = useState("list");
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
    const [filters, setFilters] = useState({
        type: "", status: "", salesPerson: "", startDate: "", endDate: "", searchQuery: ""
    });
    if (!mounted) {
        return null;
    }
    // Extract exactly unique sales persons for the dropdown
    const uniqueSalesPersons = Array.from(new Set(designs.map(d => d.salesPerson))).sort();
    const filteredDesigns = designs.filter(d => {
        // Search Query (Op No, Project No, Name)
        if (filters.searchQuery) {
            const q = filters.searchQuery.toLowerCase();
            if (!d.opNo.toLowerCase().includes(q) &&
                !d.projectNo.toLowerCase().includes(q) &&
                !d.name.toLowerCase().includes(q)) {
                return false;
            }
        }
        if (filters.type && d.designType !== filters.type)
            return false;
        if (filters.status && d.status !== filters.status)
            return false;
        if (filters.salesPerson && d.salesPerson !== filters.salesPerson)
            return false;
        if (filters.startDate || filters.endDate) {
            // Assuming DD/MM/YYYY locally from dummy data as provided previously
            const parts = d.created.split('/');
            if (parts.length === 3) {
                const designDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                if (filters.startDate) {
                    const start = new Date(filters.startDate + "T00:00:00").getTime();
                    if (designDate < start)
                        return false;
                }
                if (filters.endDate) {
                    // Setting end to edge of the day to make it inclusive
                    const end = new Date(filters.endDate + "T23:59:59").getTime();
                    if (designDate > end)
                        return false;
                }
            }
        }
        return true;
    });
    return (<div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden">
      <Navbar />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0">
          <Toolbar viewMode={viewMode} setViewMode={setViewMode} filters={filters} setFilters={setFilters} salesPersons={uniqueSalesPersons}/>
        </div>
        {viewMode === "list" ? <Table data={filteredDesigns}/> : <Board data={filteredDesigns}/>}
      </div>
    </div>);
}
