"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  cancelReallocationRequest,
  createReallocationRequest,
  listReallocationEligibleDesigners,
} from "@/features/requests/services/reallocation-requests.api";

/**
 * Compact task-detail panel. Create flow lives primarily under Requests → Reallocation.
 * Only designers with unlocked remaining hours see the request CTA (not post-handoff old owners).
 */
export function TaskReallocationPanel({
  taskId,
  pendingReallocation,
  viewerCanRequestReallocation = false,
  sessionUserId,
  isHod,
  onChanged,
}) {
  const [busy, setBusy] = useState(false);

  const isMyPending =
    Boolean(pendingReallocation?.id) &&
    String(pendingReallocation?.requesterId ?? "") === String(sessionUserId ?? "");

  const cancelPending = async () => {
    if (!pendingReallocation?.id || !isMyPending) return;
    setBusy(true);
    try {
      await cancelReallocationRequest(pendingReallocation.id);
      toast.success("Reallocation request cancelled");
      onChanged?.();
    } catch (err) {
      toast.error(err?.message || "Failed to cancel");
    } finally {
      setBusy(false);
    }
  };

  if (!pendingReallocation && !viewerCanRequestReallocation && !isHod) return null;
  // HOD with nothing pending: still show link to Requests inbox
  if (!pendingReallocation && !viewerCanRequestReallocation && isHod) {
    return (
      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Reallocation
        </p>
        <a
          href="/designer/requests?tab=reallocation"
          className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
        >
          Open reallocation requests
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Reallocation
      </p>

      {pendingReallocation ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="font-semibold">Reallocation pending</div>
          <div className="mt-0.5">
            Suggested → {pendingReallocation.suggestedDesignerName}
            {pendingReallocation.requesterName
              ? ` (from ${pendingReallocation.requesterName})`
              : ""}
          </div>
          {pendingReallocation.reason ? (
            <div className="mt-1 text-amber-800/80">{pendingReallocation.reason}</div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {isHod ? (
              <a
                href={`/design-list?view=reallocation&reallocationId=${pendingReallocation.id}`}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
              >
                Review in Design List
              </a>
            ) : null}
            <a
              href={`/designer/requests?tab=reallocation&reallocationId=${pendingReallocation.id}`}
              className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
            >
              Open in Requests
            </a>
            {isMyPending ? (
              <button
                type="button"
                disabled={busy}
                onClick={cancelPending}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel request
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {viewerCanRequestReallocation && !pendingReallocation ? (
        <a
          href={`/designer/requests?tab=reallocation&taskId=${encodeURIComponent(taskId || "")}`}
          className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Request reallocation
        </a>
      ) : null}
    </div>
  );
}

/** Full create form used on the Requests → Reallocation tab. */
export function ReallocationCreateForm({
  designerId,
  prefillTaskId,
  onCreated,
}) {
  const [taskOptions, setTaskOptions] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [taskId, setTaskId] = useState(prefillTaskId || "");
  const [suggestedDesignerId, setSuggestedDesignerId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  useEffect(() => {
    if (!designerId) return;
    setLoadingTasks(true);
    import("@/features/requests/services/reallocation-requests.api")
      .then(({ listReallocationTaskOptions }) => listReallocationTaskOptions(designerId))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setTaskOptions(list);
        if (prefillTaskId && list.some((t) => t.id === prefillTaskId)) {
          setTaskId(prefillTaskId);
        } else if (!taskId && list[0]?.id) {
          setTaskId(list[0].id);
        }
      })
      .catch(() => setTaskOptions([]))
      .finally(() => setLoadingTasks(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designerId, prefillTaskId]);

  useEffect(() => {
    if (!taskId) {
      setEligible([]);
      setSuggestedDesignerId("");
      return;
    }
    listReallocationEligibleDesigners(taskId)
      .then((list) => {
        const rows = Array.isArray(list) ? list : [];
        setEligible(rows);
        setSuggestedDesignerId(rows[0]?.id || "");
      })
      .catch(() => {
        setEligible([]);
        setSuggestedDesignerId("");
      });
  }, [taskId]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!taskId || !suggestedDesignerId || !reason.trim()) {
      toast.error("Select a task, designer, and reason");
      return;
    }
    setBusy(true);
    try {
      await createReallocationRequest({
        taskId,
        suggestedDesignerId,
        reason: reason.trim(),
      });
      toast.success("Reallocation request submitted");
      setReason("");
      onCreated?.();
    } catch (err) {
      toast.error(err?.message || "Failed to submit request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-5">
      <p className="text-xs text-slate-500">
        Request HOD to move all your remaining scheduled hours on a task to another designer.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">
          Task
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={loadingTasks}
          >
            {taskOptions.length === 0 ? (
              <option value="">No reallocatable tasks</option>
            ) : (
              taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Suggested designer
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={suggestedDesignerId}
            onChange={(e) => setSuggestedDesignerId(e.target.value)}
          >
            {eligible.length === 0 ? (
              <option value="">No eligible designers</option>
            ) : (
              eligible.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-slate-600">
        Reason
        <textarea
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why should this task be reallocated?"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !taskId || !suggestedDesignerId || !reason.trim()}
        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit reallocation request"}
      </button>
    </form>
  );
}
