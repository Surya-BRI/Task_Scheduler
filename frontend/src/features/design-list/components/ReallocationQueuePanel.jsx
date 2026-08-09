"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  listReallocationEligibleDesigners,
  listReallocationPendingApprovals,
  reallocationApproveFeedback,
  reviewReallocationRequest,
} from "@/features/requests/services/reallocation-requests.api";
import { taskSummaryPath } from "@/lib/design-list-routes";

import { toUserFacingError } from "@/lib/api-error"
export function ReallocationQueuePanel({ highlightId }) {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [approveRow, setApproveRow] = useState(null);
  const [disagreeRow, setDisagreeRow] = useState(null);
  const [targetDesignerId, setTargetDesignerId] = useState("");
  const [eligible, setEligible] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listReallocationPendingApprovals()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {
        setRows([]);
        toast.error("Failed to load reallocation requests");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`realloc-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows]);

  const openApprove = async (row) => {
    setApproveRow(row);
    setTargetDesignerId(row.suggestedDesignerId);
    setRemarks("");
    try {
      const list = await listReallocationEligibleDesigners(row.taskId);
      const options = Array.isArray(list) ? list : [];
      // Ensure suggested designer is in the list even if team filter excludes them somehow.
      if (
        row.suggestedDesignerId &&
        !options.some((d) => d.id === row.suggestedDesignerId)
      ) {
        options.unshift({
          id: row.suggestedDesignerId,
          fullName: row.suggestedDesignerName,
        });
      }
      setEligible(options);
    } catch {
      setEligible([
        { id: row.suggestedDesignerId, fullName: row.suggestedDesignerName },
      ]);
    }
  };

  const submitApprove = async () => {
    if (!approveRow) return;
    setBusy(true);
    setReviewingId(approveRow.id);
    try {
      const result = await reviewReallocationRequest(approveRow.id, {
        status: "Approved",
        targetDesignerId: targetDesignerId || approveRow.suggestedDesignerId,
        remarks: remarks.trim() || undefined,
      });
      const feedback = reallocationApproveFeedback(result ?? {});
      if (feedback.tone === "warning") {
        toast.warning(feedback.title, feedback.description ? { description: feedback.description } : undefined);
      } else {
        toast.success(feedback.title);
      }
      setApproveRow(null);
      load();
    } catch (err) {
      toast.error(toUserFacingError(err, "Failed to approve reallocation"));
    } finally {
      setBusy(false);
      setReviewingId(null);
    }
  };

  const submitDisagree = async () => {
    if (!disagreeRow) return;
    const text = remarks.trim();
    if (!text) {
      toast.error("Remarks are required to disagree");
      return;
    }
    setBusy(true);
    setReviewingId(disagreeRow.id);
    try {
      await reviewReallocationRequest(disagreeRow.id, {
        status: "Rejected",
        remarks: text,
      });
      toast.success("Reallocation disagreed");
      setDisagreeRow(null);
      setRemarks("");
      load();
    } catch (err) {
      toast.error(toUserFacingError(err, "Failed to disagree"));
    } finally {
      setBusy(false);
      setReviewingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6" aria-busy="true">
        <div className="ui-surface h-full overflow-hidden p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-2 h-10 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 text-sm text-slate-500">
        No pending reallocation requests.
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
        <div className="ui-surface h-full overflow-auto">
          <table className="w-full text-xs text-left leading-tight">
            <thead className="ui-table-header sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-2 py-1.5">Task</th>
                <th className="px-2 py-1.5">From</th>
                <th className="px-2 py-1.5">Suggested to</th>
                <th className="px-2 py-1.5">Reason</th>
                <th className="px-2 py-1.5">Remaining</th>
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const highlighted = highlightId && row.id === highlightId;
                return (
                  <tr
                    key={row.id}
                    id={`realloc-${row.id}`}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${
                      highlighted ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900 hover:underline"
                        onClick={() =>
                          router.push(taskSummaryPath(row.taskId, { from: "design-list" }))
                        }
                      >
                        {row.taskName || row.taskNo}
                      </button>
                      {row.projectName ? (
                        <div className="text-[10px] text-slate-500">{row.projectName}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-slate-700">{row.requesterName}</td>
                    <td className="px-2 py-2 text-slate-700">{row.suggestedDesignerName}</td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-slate-600" title={row.reason}>
                      {row.reason}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-slate-700">
                      {row.remainingHours != null ? `${row.remainingHours}h` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          disabled={busy && reviewingId === row.id}
                          onClick={() => openApprove(row)}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy && reviewingId === row.id}
                          onClick={() => {
                            setDisagreeRow(row);
                            setRemarks("");
                          }}
                          className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                        >
                          Disagree
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {approveRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Approve reallocation</h3>
            <p className="mt-1 text-xs text-slate-600">
              Move remaining hours of <strong>{approveRow.taskName}</strong> from{" "}
              <strong>{approveRow.requesterName}</strong> to the target designer.
            </p>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Target designer
            </label>
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={targetDesignerId}
              onChange={(e) => setTargetDesignerId(e.target.value)}
            >
              {eligible.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Note (optional)
            </label>
            <textarea
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                onClick={() => setApproveRow(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={submitApprove}
                disabled={busy || !targetDesignerId}
              >
                {busy ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {disagreeRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Disagree reallocation</h3>
            <p className="mt-1 text-xs text-slate-600">
              Keep schedule on <strong>{disagreeRow.requesterName}</strong> for{" "}
              <strong>{disagreeRow.taskName}</strong>.
            </p>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Remarks (required)
            </label>
            <textarea
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                onClick={() => setDisagreeRow(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={submitDisagree}
                disabled={busy || !remarks.trim()}
              >
                {busy ? "Saving…" : "Disagree"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
