"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { useDesignListStore } from "@/state/DesignListContext";
import { dummyProjects } from "../data/dummy-projects";
import { Navbar } from "@/components/Navbar";

function resolveTaskIdForProjectRow(row, records) {
  const pool = records.filter(
    (r) => String(r.designType).toLowerCase() === row.category.toLowerCase(),
  );
  if (pool.length === 0) return null;
  const pid = row.projectId.trim().toLowerCase();
  const match =
    pool.find((r) => (r.projectNo || "").trim().toLowerCase() === pid) ??
    pool.find((r) => (r.projectCode || "").trim().toLowerCase() === pid);
  if (match) return match.id;
  const n = parseInt(row.id, 10);
  const idx = Number.isFinite(n) ? n % pool.length : 0;
  return pool[idx]?.id ?? null;
}

function projectListTaskHref(taskId) {
  return `/design-list/task/${encodeURIComponent(taskId)}?from=projects-list`;
}

function retailProjectHref(projectRowId) {
  return `/retail/${encodeURIComponent(projectRowId)}`;
}

const getCategoryColor = (category) =>
  category === "Retail" ? "text-blue-600" : "text-orange-500";

function ProjectTable({ data, records }) {
  return (
    <div className="px-6 pb-6">
      <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
        <table className="w-full text-sm text-left relative">
          <thead className="bg-[#f0f3fa] text-gray-600 text-xs uppercase font-semibold sticky top-0 z-10 outline outline-1 outline-gray-200 shadow-sm">
            <tr>
              <th className="px-2 py-1 whitespace-nowrap">Project ID</th>
              <th className="px-2 py-1">Project Name</th>
              <th className="px-2 py-1 whitespace-nowrap">Sales Person</th>
              <th className="px-2 py-1 whitespace-nowrap">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => {
              const isRetail = row.category === "Retail";
              const retailHref = retailProjectHref(row.id);
              const taskId = !isRetail ? resolveTaskIdForProjectRow(row, records) : null;
              const projectHref = isRetail
                ? retailHref
                : taskId
                  ? projectListTaskHref(taskId)
                  : null;

              return (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-2 py-0.5 whitespace-nowrap text-xs">
                    {projectHref ? (
                      <Link href={projectHref} className="font-medium text-blue-600 hover:underline">
                        {row.projectId}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-500">{row.projectId}</span>
                    )}
                  </td>
                  <td className="px-2 py-0.5 text-gray-700 text-xs leading-tight">{row.projectName}</td>
                  <td className="px-2 py-0.5 text-gray-700 whitespace-nowrap text-xs">{row.salesPerson}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap text-xs">
                    {projectHref ? (
                      <Link
                        href={projectHref}
                        className={`font-semibold hover:underline ${getCategoryColor(row.category)}`}
                      >
                        {row.category}
                      </Link>
                    ) : (
                      <span className={`font-semibold ${getCategoryColor(row.category)}`}>
                        {row.category}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProjectScreen() {
  const { records } = useDesignListStore();
  const designRecords = records;
  const [projects] = useState(dummyProjects);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = projects.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.projectId.toLowerCase().includes(q) ||
      p.projectName.toLowerCase().includes(q) ||
      p.salesPerson.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden">
      <Navbar />
      <div className="flex flex-col">
        <div className="shrink-0 flex items-center justify-between mt-6 mb-4 px-6">
          <h1 className="text-2xl font-bold text-gray-900">Project Design</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Project ID..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        <ProjectTable data={filtered} records={designRecords} />
      </div>
    </div>
  );
}