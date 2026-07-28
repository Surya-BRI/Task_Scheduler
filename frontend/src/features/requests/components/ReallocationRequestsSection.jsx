"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import {
  cancelReallocationRequest,
  listReallocationPendingApprovals,
  listReallocationRequests,
  reviewReallocationRequest,
  listReallocationEligibleDesigners,
} from "@/features/requests/services/reallocation-requests.api";
import { ReallocationCreateForm } from "@/components/TaskReallocationPanel";

export default function ReallocationRequestsSection({
  isHOD,
  activeDesignerId,
  prefillTaskId,
  highlightId,
}) {
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approveRow, setApproveRow] = useState(null);
  const [disagreeRow, setDisagreeRow] = useState(null);
  const [targetDesignerId, setTargetDesignerId] = useState("");
  const [eligible, setEligible] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mine, inbox] = await Promise.all([
        activeDesignerId
          ? listReallocationRequests(activeDesignerId)
          : Promise.resolve([]),
        isHOD ? listReallocationPendingApprovals() : Promise.resolve([]),
      ]);
      setRows(Array.isArray(mine) ? mine : []);
      setPending(Array.isArray(inbox) ? inbox : []);
    } catch (e) {
      setError(e?.message || "Could not load reallocation requests.");
      setRows([]);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [activeDesignerId, isHOD]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`realloc-req-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows, pending]);

  const openApprove = async (row) => {
    setApproveRow(row);
    setTargetDesignerId(row.suggestedDesignerId);
    setRemarks("");
    try {
      const list = await listReallocationEligibleDesigners(row.taskId);
      const options = Array.isArray(list) ? list : [];
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
    try {
      await reviewReallocationRequest(approveRow.id, {
        status: "Approved",
        targetDesignerId: targetDesignerId || approveRow.suggestedDesignerId,
        remarks: remarks.trim() || undefined,
      });
      toast.success("Reallocation approved — schedule updated");
      setApproveRow(null);
      await load();
    } catch (err) {
      toast.error(err?.message || "Failed to approve");
    } finally {
      setBusy(false);
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
    try {
      await reviewReallocationRequest(disagreeRow.id, {
        status: "Rejected",
        remarks: text,
      });
      toast.success("Reallocation disagreed");
      setDisagreeRow(null);
      setRemarks("");
      await load();
    } catch (err) {
      toast.error(err?.message || "Failed to disagree");
    } finally {
      setBusy(false);
    }
  };

  const cancelMine = async (id) => {
    setBusy(true);
    try {
      await cancelReallocationRequest(id);
      toast.success("Request cancelled");
      await load();
    } catch (err) {
      toast.error(err?.message || "Failed to cancel");
    } finally {
      setBusy(false);
    }
  };

  const pendingIds = new Set(pending.map((r) => r.id));
  const historyRows = rows.filter((r) => !pendingIds.has(r.id) || r.status !== "Pending");

  return (
    <section id="reallocation" className="ui-surface scroll-mt-24">
      <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
            <ArrowLeftRight className="h-4 w-4 text-slate-500" />
            Reallocation Requests
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Ask HOD to move your remaining scheduled work to another designer — same place as overtime & regularization.
          </p>
        </div>
        {isHOD ? (
          <a
            href="/design-list?view=reallocation"
            className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
          >
            Design List queue
          </a>
        ) : null}
      </div>

      {error ? <div className="ui-alert-warning">{error}</div> : null}

      {!isHOD || activeDesignerId ? (
        <ReallocationCreateForm
          designerId={activeDesignerId}
          prefillTaskId={prefillTaskId}
          onCreated={load}
        />
      ) : (
        <div className="ui-alert-info">Select a designer profile to submit a reallocation request.</div>
      )}

      {isHOD && pending.length > 0 ? (
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pending approvals ({pending.length})
          </h3>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-2">Task</th>
                  <th className="py-1 pr-2">From</th>
                  <th className="py-1 pr-2">Suggested</th>
                  <th className="py-1 pr-2">Remaining</th>
                  <th className="py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr
                    key={row.id}
                    id={`realloc-req-${row.id}`}
                    className={`border-t border-slate-100 ${
                      highlightId === row.id ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium text-slate-800">{row.taskName}</td>
                    <td className="py-2 pr-2">{row.requesterName}</td>
                    <td className="py-2 pr-2">{row.suggestedDesignerName}</td>
                    <td className="py-2 pr-2 tabular-nums">
                      {row.remainingHours != null ? `${row.remainingHours}h` : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="mr-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800"
                        onClick={() => openApprove(row)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800"
                        onClick={() => {
                          setDisagreeRow(row);
                          setRemarks("");
                        }}
                      >
                        Disagree
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="px-4 py-3 sm:px-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          My requests
        </h3>
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : historyRows.length === 0 && rows.filter((r) => r.status === "Pending").length === 0 ? (
          <p className="text-xs text-slate-500">No reallocation requests yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2">Task</th>
                <th className="py-1 pr-2">Suggested</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Reason</th>
                <th className="py-1 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  id={`realloc-req-${row.id}`}
                  className={`border-t border-slate-100 ${
                    highlightId === row.id ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="py-2 pr-2 font-medium">{row.taskName}</td>
                  <td className="py-2 pr-2">{row.targetDesignerName || row.suggestedDesignerName}</td>
                  <td className="py-2 pr-2">{row.status}</td>
                  <td className="max-w-[200px] truncate py-2 pr-2" title={row.reason}>
                    {row.reason}
                  </td>
                  <td className="py-2 text-right">
                    {row.status === "Pending" ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold"
                        onClick={() => cancelMine(row.id)}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {approveRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold">Approve reallocation</h3>
            <p className="mt-1 text-xs text-slate-600">
              Move remaining hours of {approveRow.taskName} from {approveRow.requesterName}.
            </p>
            <label className="mt-3 block text-[11px] font-semibold uppercase text-slate-500">
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
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-xs font-semibold" onClick={() => setApproveRow(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" onClick={submitApprove} disabled={busy || !targetDesignerId}>
                {busy ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {disagreeRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold">Disagree reallocation</h3>
            <textarea
              className="mt-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks (required)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-xs font-semibold" onClick={() => setDisagreeRow(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" onClick={submitDisagree} disabled={busy || !remarks.trim()}>
                Disagree
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
