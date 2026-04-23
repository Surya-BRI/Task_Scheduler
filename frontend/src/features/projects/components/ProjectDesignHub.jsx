"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDesignListStore } from "@/state/DesignListContext";
import { Navbar } from "@/components/Navbar";

const FROM = "project-design";

function hubTaskUrl(recordId, opts) {
  const sp = new URLSearchParams();
  sp.set("from", FROM);
  if (opts?.tab) sp.set("tab", opts.tab);
  if (opts?.create) sp.set("create", "1");
  return `/design-list/task/${encodeURIComponent(recordId)}?${sp.toString()}`;
}

function ActionLink({ href, label }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-900"
    >
      {label}
    </Link>
  );
}

function DesignTypeTable({ rows, variant }) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="border border-gray-200 rounded-lg overflow-auto bg-white shadow-sm flex-1 min-h-[240px]">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#f0f3fa] text-gray-600 uppercase font-semibold sticky top-0 z-10 outline outline-1 outline-gray-200">
            <tr>
              <th className="px-2 py-2">OP No</th>
              <th className="px-2 py-2">Project No</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500 text-sm">
                  No records in this category.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2">
                    <Link
                      href={hubTaskUrl(row.id)}
                      className="font-medium text-blue-600 hover:underline whitespace-nowrap"
                    >
                      {row.opNo}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={hubTaskUrl(row.id)}
                      className="text-blue-600 hover:underline whitespace-nowrap"
                    >
                      {row.projectNo}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-gray-900">
                    <Link href={hubTaskUrl(row.id)} className="hover:text-blue-700 hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-gray-600">{row.status}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <ActionLink href={hubTaskUrl(row.id)} label="Details" />
                      <ActionLink href={hubTaskUrl(row.id, { tab: "activity" })} label="Activity" />
                      <ActionLink href={hubTaskUrl(row.id, { tab: "chatter" })} label="Chatter" />
                      {variant === "project" ? (
                        <ActionLink href={hubTaskUrl(row.id, { tab: "team" })} label="Team" />
                      ) : null}
                      <ActionLink href={hubTaskUrl(row.id, { create: true })} label="Create" />
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

export function ProjectDesignHub() {
  const { records } = useDesignListStore();
  const list = records;
  const [searchQuery, setSearchQuery] = useState("");
  const [segment, setSegment] = useState("retail");

  const { retailRows, projectRows } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const match = (r) => {
      if (!q) return true;
      const hay = [r.opNo, r.projectNo, r.name, r.businessUnit].join(" ").toLowerCase();
      return hay.includes(q);
    };
    const retail = list.filter((r) => String(r.designType).toLowerCase() === "retail" && match(r));
    const project = list.filter((r) => String(r.designType).toLowerCase() === "project" && match(r));
    return {
      retailRows: retail.map((r) => ({
        id: r.id,
        opNo: r.opNo,
        projectNo: r.projectNo,
        name: r.name,
        status: r.status,
      })),
      projectRows: project.map((r) => ({
        id: r.id,
        opNo: r.opNo,
        projectNo: r.projectNo,
        name: r.name,
        status: r.status,
      })),
    };
  }, [list, searchQuery]);

  const tabClass = (active) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-blue-600 text-white shadow"
        : "bg-white text-gray-800 ring-1 ring-gray-200 hover:bg-gray-50"
    }`;

  return (
    <div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden">
      <Navbar />
      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6">
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Project Design</h1>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search OP, project no, name…"
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className={tabClass(segment === "retail")} onClick={() => setSegment("retail")}>
            Retail ({retailRows.length})
          </button>
          <button type="button" className={tabClass(segment === "project")} onClick={() => setSegment("project")}>
            Project ({projectRows.length})
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {segment === "retail" ? (
            <DesignTypeTable rows={retailRows} variant="retail" />
          ) : (
            <DesignTypeTable rows={projectRows} variant="project" />
          )}
        </div>
      </div>
    </div>
  );
}
