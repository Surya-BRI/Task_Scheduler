"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Navbar } from "@/components/Navbar";
import {
  FROM_PROJECT_DESIGN,
  taskCreationPathForRecord,
  taskViewPathForRecord,
} from "@/lib/design-list-routes";

function hubTaskHref(row, workflowFromOrOpts = FROM_PROJECT_DESIGN, maybeOpts = {}) {
  let workflowFrom = FROM_PROJECT_DESIGN;
  let opts = {};
  if (typeof workflowFromOrOpts === "string") {
    workflowFrom = workflowFromOrOpts;
    opts = maybeOpts ?? {};
  } else if (workflowFromOrOpts && typeof workflowFromOrOpts === "object") {
    opts = workflowFromOrOpts;
  }
  const routingId = row?.taskId || row?.salesForceCode || row?.opNo || row?.id;
  if (!routingId) return null;
  const routingRow = { ...row, id: routingId };
  const q = { from: workflowFrom };
  const opNo = String(row?.salesForceCode ?? row?.opNo ?? "").trim();
  const projectCode = String(row?.projectCode ?? row?.projectNo ?? "").trim();
  if (opNo) q.opNo = opNo;
  if (projectCode) q.projectCode = projectCode;
  if (row?.designType || row?.category) q.designType = row.designType || row.category;
  if (opts.tab) q.tab = opts.tab;
  if (opts.create) return taskCreationPathForRecord(routingRow, q);
  return taskViewPathForRecord(routingRow, q);
}

function ActionLink({ href, label }) {
  if (!href) {
    return (
      <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-400 cursor-not-allowed">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
    >
      {label}
    </Link>
  );
}

function DesignTypeTable({ rows, variant, workflowFrom = FROM_PROJECT_DESIGN }) {
  const href = (row, opts) => hubTaskHref(row, workflowFrom, opts);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="border border-slate-200 rounded-xl overflow-auto bg-white shadow-sm h-full">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#f0f3fa] text-slate-600 uppercase font-semibold sticky top-0 z-10 outline outline-1 outline-slate-200">
            <tr>
              <th className="px-2 py-1.5 whitespace-nowrap">OP No</th>
              <th className="px-2 py-1.5 whitespace-nowrap">Project No</th>
              <th className="px-2 py-1.5">Name</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500 text-sm">
                  No records in this category.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-2 py-1">
                    {href(row) ? (
                      <Link href={href(row)} className="font-medium text-blue-600 hover:underline whitespace-nowrap">
                        {row.opNo}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-400 whitespace-nowrap">{row.opNo}</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {href(row) ? (
                      <Link href={href(row)} className="text-blue-600 hover:underline whitespace-nowrap">
                        {row.projectNo}
                      </Link>
                    ) : (
                      <span className="text-slate-400 whitespace-nowrap">{row.projectNo}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-slate-900">
                    {href(row) ? (
                      <Link href={href(row)} className="hover:text-blue-700 hover:underline">
                        {row.name}
                      </Link>
                    ) : (
                      <span>{row.name}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-slate-600">{row.status}</td>
                  <td className="px-2 py-1">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <ActionLink href={href(row)} label="Details" />
                      <ActionLink href={href(row, { tab: "activity" })} label="Activity" />
                      <ActionLink href={href(row, { tab: "chatter" })} label="Chatter" />
                      {variant === "project" ? (
                        <ActionLink href={href(row, { tab: "team" })} label="Team" />
                      ) : null}
                      <ActionLink href={href(row, { create: true })} label="Create" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function mapHubRow(r) {
  return {
    id: r.id,
    designType: r.designType,
    category: r.designType,
    opNo: r.opNo,
    projectNo: r.projectNo,
    projectCode: r.projectCode,
    salesForceCode: r.salesForceCode,
    name: r.name,
    status: r.status,
    taskId: r.taskId ?? null,
    businessUnit: r.businessUnit,
  };
}

const PAGE_SIZE = 100;

export function ProjectDesignHub({ workflowFrom = FROM_PROJECT_DESIGN }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [segment, setSegment] = useState("retail");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [otherTotal, setOtherTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filterKey = `${segment}|${debouncedQuery}`;
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return undefined;
      }
    }

    let mounted = true;
    setLoading(true);
    setError(null);
    const q = debouncedQuery.trim();
    const type = segment === "retail" ? "retail" : "project";
    const otherType = segment === "retail" ? "project" : "retail";
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      type,
      fields: "hub",
    });
    if (q) qs.set("q", q);

    const otherQs = new URLSearchParams({
      page: "1",
      limit: "1",
      type: otherType,
      fields: "hub",
    });
    if (q) otherQs.set("q", q);

    Promise.all([
      apiClient.get(`/design-list?${qs.toString()}`),
      apiClient.get(`/design-list?${otherQs.toString()}`),
    ])
      .then(([res, otherRes]) => {
        if (!mounted) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        setRows(data.map(mapHubRow));
        const nextTotal = Number(res?.total);
        setTotal(Number.isFinite(nextTotal) ? Math.max(0, nextTotal) : data.length);
        setTotalPages(
          Math.max(
            1,
            Number(res?.totalPages) ||
              Math.ceil(Math.max(0, Number.isFinite(nextTotal) ? nextTotal : data.length) / PAGE_SIZE) ||
              1,
          ),
        );
        const other = Number(otherRes?.total);
        setOtherTotal(Number.isFinite(other) ? Math.max(0, other) : null);
      })
      .catch((err) => {
        if (!mounted) return;
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setOtherTotal(null);
        setError(err?.message || "Could not load project design records.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [debouncedQuery, filterKey, page, segment]);

  const retailTotal = segment === "retail" ? total : otherTotal;
  const projectTotal = segment === "project" ? total : otherTotal;
  const currentPage = Math.min(page, totalPages);

  const tabClass = (active) =>
    `rounded border text-sm font-medium transition-colors px-3 py-1.5 ${
      active
        ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
        : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
    }`;

  const badge = (n) => (n == null ? "…" : String(n));

  const tableRows = useMemo(() => rows, [rows]);

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      <Navbar />
      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6">
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4 mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Project Design</h1>
          <div className="relative max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search OP, project no, name…"
              className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white text-slate-900"
            />
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={tabClass(segment === "retail")}
            onClick={() => setSegment("retail")}
          >
            Retail ({badge(retailTotal)})
          </button>
          <button
            type="button"
            className={tabClass(segment === "project")}
            onClick={() => setSegment("project")}
          >
            Project ({badge(projectTotal)})
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
              Loading projects…
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-amber-950">{error}</p>
              <p className="text-xs text-amber-800">
                Check that the backend is running and the design-list API is available.
              </p>
            </div>
          ) : segment === "retail" ? (
            <DesignTypeTable rows={tableRows} variant="retail" workflowFrom={workflowFrom} />
          ) : (
            <DesignTypeTable rows={tableRows} variant="project" workflowFrom={workflowFrom} />
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between pt-3 text-xs text-slate-600">
          <span>
            Showing {total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-
            {Math.min(currentPage * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
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
              disabled={currentPage === totalPages || loading}
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
