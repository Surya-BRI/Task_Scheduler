"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Navbar } from "@/components/Navbar";
import { FROM_PROJECTS_LIST, taskCreationPathForRecord } from "@/lib/design-list-routes";
import { useDesignListStore } from "@/state/DesignListContext";

function projectListTaskHref(row, workflowFrom = FROM_PROJECTS_LIST) {
  const projectCode = String(row?.projectCode ?? "").trim();
  const opNo = String(row?.salesForceCode ?? row?.opNo ?? "").trim();
  if (!projectCode && !opNo) return null;
  // Prefer Salesforce OP code in the path — ERP projectCode spacing/hyphens are unreliable.
  const routeId = opNo || projectCode;
  const query = {
    from: workflowFrom,
    designType: row.category,
  };
  if (projectCode) query.projectCode = projectCode;
  if (opNo) query.opNo = opNo;
  return taskCreationPathForRecord(
    { id: routeId, designType: row.category, category: row.category },
    query,
  );
}

const renderCell = (value) => (value == null || value === "" ? "null" : String(value));

const getCategoryColor = (category) =>
  category === "Retail" ? "text-blue-600" : "text-orange-500";

function ProjectTable({ data, onProjectOpen, workflowFrom }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
      <div className="ui-surface h-full overflow-auto">
        <table className="w-full text-sm text-left relative">
          <thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="px-2 py-1.5 whitespace-nowrap">Project Code</th>
              <th className="px-2 py-1.5 whitespace-nowrap">Project Name</th>
              <th className="px-2 py-1.5 whitespace-nowrap">Sales Person</th>
              <th className="px-2 py-1.5 whitespace-nowrap">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, idx) => {
              if (!row) return null;
              const projectHref = projectListTaskHref(row, workflowFrom);
              const rowKey = `${row.id ?? row.projectCode ?? "row"}-${idx}`;

              return (
                <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                  <td className="px-2 py-1 whitespace-nowrap text-xs">
                    {projectHref ? (
                      <Link
                        href={projectHref}
                        onClick={() => onProjectOpen?.(row)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {renderCell(row.projectCode)}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-400">{renderCell(row.projectCode)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-slate-700 text-xs leading-tight">{renderCell(row.projectName)}</td>
                  <td className="px-2 py-1 text-slate-700 whitespace-nowrap text-xs">{renderCell(row.salesPerson)}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">
                    {projectHref ? (
                      <Link
                        href={projectHref}
                        onClick={() => onProjectOpen?.(row)}
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

export function ProjectScreen({ workflowFrom = FROM_PROJECTS_LIST }) {
  const PAGE_SIZE = 100;
  const { setRecords } = useDesignListStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let mounted = true;
    const q = searchQuery.trim();
    apiClient
      .get(
        `/design-list/projects-list?page=${page}&limit=${PAGE_SIZE}&q=${encodeURIComponent(q)}`,
      )
      .then((res) => {
        if (!mounted) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        setProjects(
          data.map((r) => ({
            id: r.id,
            taskId: r.taskId ?? r.taskUUID ?? r.taskUuid ?? null,
            projectCode: r.projectCode ?? r.projectNo ?? null,
            salesForceCode: r.salesForceCode ?? r.opNo ?? null,
            projectName: r.projectName ?? r.name ?? null,
            clientName: r.clientName ?? r.customerName ?? null,
            salesPerson: r.salesPerson ?? null,
            category: r.designType || "Project",
            created: r.created ?? null,
            deadline: r.deadline ?? null,
          })),
        );
        setTotal(Number(res?.total || 0));
        setTotalPages(Math.max(1, Number(res?.totalPages || 1)));
      })
      .catch(() => {
        if (!mounted) return;
        setProjects([]);
        setTotal(0);
        setTotalPages(1);
      });

    return () => {
      mounted = false;
    };
  }, [page, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);
  const currentPage = Math.min(page, totalPages);

  const primeRecordForDetails = (row) => {
    if (!row?.id) return;
    setRecords((prev) => {
      if (prev.some((item) => item.id === row.id)) return prev;
      const now = new Date();
      const created = now.toLocaleDateString("en-GB");
      return [
        {
          id: row.id,
          opNo: row.salesForceCode ?? row.id,
          projectNo: row.projectCode ?? row.id,
          projectCode: row.projectCode ?? undefined,
          salesForceCode: row.salesForceCode ?? undefined,
          designType: row.category || "Project",
          businessUnit: row.category || "Project",
          name: row.projectName ?? row.projectCode ?? row.id,
          status: "Pending",
          salesPerson: row.salesPerson ?? "Unassigned",
          created: row.created ?? created,
          deadline: row.deadline ?? row.created ?? created,
          agingDays: 0,
          clientName: row.clientName ?? undefined,
          client: row.clientName ?? undefined,
          projectName: row.projectName ?? undefined,
        },
        ...prev,
      ];
    });
  };

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden font-sans">
      <Navbar />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 mt-4 flex shrink-0 items-center justify-between px-4 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Project Design</h1>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Project Code..."
              className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white text-slate-900"
            />
          </div>
        </div>

        <ProjectTable data={projects} onProjectOpen={primeRecordForDetails} workflowFrom={workflowFrom} />
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
