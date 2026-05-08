"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import StatsBar from "../components/StatsBar";
import { Clock3, FileClock, TimerReset, X } from "lucide-react";

export default function RequestsClient({ designer }) {
  const router = useRouter();
  const REGULARIZATION_REASON_OPTIONS = [
    "Late Login",
    "Early Logout",
    "Break Extension",
    "System Issue",
    "Network Issue",
    "Client Call",
    "Meeting",
    "Personal Emergency",
    "Power Cut",
    "Other",
  ];
  
  const [stats, setStats] = useState(designer.stats);

  // --- Idle Time Regularization State ---
  const [idleRequests, setIdleRequests] = useState([
    { id: 1, taskName: "Social Media Kit", date: "", duration: "25 mins", reason: "", notes: "", status: "unsubmitted" },
    { id: 2, taskName: "Product Launch Graphics", date: "2026-03-02", duration: "45 mins", reason: "Client Call", notes: "Client delay on copy", status: "Pending" },
    { id: 3, taskName: "Mobile App Mockups", date: "2026-03-01", duration: "30 mins", reason: "System Issue", notes: "Server issues confirmed by IT", status: "Approved" },
  ]);

  const handleIdleChange = (id, field, value) => {
    setIdleRequests(prev => prev.map(req => req.id === id ? { ...req, [field]: value } : req));
  };

  const handleSubmitIdleRow = (id) => {
    const req = idleRequests.find(r => r.id === id);
    if (!req.date || !req.reason || (req.reason === "Other" && !req.notes.trim())) {
      alert("Please fill in the Date and Reason (Required).");
      return;
    }
    setIdleRequests(prev => prev.map(r => r.id === id ? { ...r, status: "Pending" } : r));
    setStats(prev => ({ ...prev, pendingRegularization: Math.max(0, prev.pendingRegularization - 1) }));
    showToast("Regularization request submitted!");
  };

  const handleRequestAllRegularization = () => {
    const unsubmitted = idleRequests.filter(r => r.status === "unsubmitted");
    if (unsubmitted.some(r => !r.date || !r.reason)) {
      alert("Please fill in Date and Reason for all pending idle times.");
      return;
    }
    setIdleRequests(prev => prev.map(r => r.status === "unsubmitted" ? { ...r, status: "Pending" } : r));
    setStats(prev => ({ ...prev, pendingRegularization: 0 }));
    showToast("All regularization requests submitted!");
  };

  // --- Overtime Request State ---
  const overtimeTasks = [
    "Webpage Layout Refinement",
    "Social Media Kit",
    "Product Launch Graphics",
    "Mobile App Mockups"
  ];

  const [otForm, setOtForm] = useState({
    taskName: overtimeTasks[0],
    date: "",
    estimatedRemaining: "4 hours",
    requestedHours: "2 hours",
    reason: "Unexpected scope change for animations",
    notes: ""
  });

  const [previousOtRequests, setPreviousOtRequests] = useState([
    { id: 1, date: "2026-03-01", taskName: "Social Media Kit", requested: "2 hours", status: "Approved", approved: "2 hours" },
    { id: 2, date: "2026-03-02", taskName: "Product Launch Graphics", requested: "3 hours", status: "Pending", approved: "-" },
  ]);

  const handleOtSubmit = (e) => {
    e.preventDefault();
    if (parseInt(otForm.requestedHours) > 4) {
       alert("Cannot exceed 4 hours allowed limit.");
       return;
    }
    
    const newReq = {
      id: Date.now(),
      date: otForm.date || new Date().toISOString().split('T')[0],
      taskName: otForm.taskName,
      requested: otForm.requestedHours,
      status: "Pending Approval",
      approved: "-"
    };

    setPreviousOtRequests([newReq, ...previousOtRequests]);
    showToast("Overtime request submitted successfully!");
  };

  // --- Toast ---
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Approved": return <span className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 text-center inline-block">Approved</span>;
      case "Pending Approval":
      case "Pending": return <span className="bg-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 text-center inline-block">Pending</span>;
      case "Rejected": return <span className="bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 text-center inline-block">Rejected</span>;
      default: return null;
    }
  };

  const getStatusColorTable = (status) => {
    switch (status) {
      case "Approved": return "bg-emerald-100 text-emerald-800";
      case "Pending Approval":
      case "Pending": return "bg-orange-100 text-orange-800";
      case "Rejected": return "bg-red-100 text-red-800";
      default: return "bg-slate-100 text-slate-800";
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 cursor-pointer";

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans bg-slate-50">
      <Navbar dateRangeText={designer.dateRange} />
      
      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-64 items-center gap-3 border-r border-slate-200 pr-4">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            {designer.avatar ? (
              <img src={designer.avatar} alt={designer.name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{designer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight text-slate-900">{designer.name}</span>
            <span className="text-[10px] leading-tight text-slate-500">{designer.designation}</span>
          </div>
        </div>
        <div className="flex-1 flex px-6 items-center">
          <span className="font-bold text-slate-900">{designer.currentDay}</span>
        </div>
      </div>
      
      <StatsBar stats={stats} />

      <div className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="w-full space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Regularization & Overtime</h1>
              <p className="mt-1 text-sm text-slate-500">Submit and track your regularization and overtime requests.</p>
            </div>
            <button
              onClick={() => router.back()}
              className="ui-chip-button inline-flex items-center gap-2"
            >
              Back to Dashboard
            </button>
          </div>

          <section id="regularization" className="ui-surface scroll-mt-24">
            <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                <TimerReset className="h-4 w-4 text-slate-500" />
                Idle Time Regularization
              </h2>
              <button
                onClick={handleRequestAllRegularization}
                className="rounded-lg bg-[#5d5baf] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4b4991]"
              >
                Request Regularization
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm text-left">
                <thead className="ui-table-header">
                  <tr>
                    <th className="px-4 py-3">Completed Task</th>
                    <th className="px-4 py-3 text-center">Date</th>
                    <th className="px-4 py-3 text-center">Idle Duration</th>
                    <th className="px-4 py-3">Reason (Required)</th>
                    <th className="px-4 py-3">Optional Notes</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {idleRequests.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{req.taskName}</td>
                      <td className="px-4 py-3 text-center">
                        {req.status === "unsubmitted" ? (
                          <input
                            type="date"
                            value={req.date}
                            onChange={(e) => handleIdleChange(req.id, "date", e.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25"
                          />
                        ) : (
                          <span className="inline-block rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                            {req.date || "dd-mm-yyyy"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-medium text-slate-800">{req.duration}</span>
                          <span className="rounded bg-[#5d5baf] px-2 py-1 text-[10px] font-bold text-white">T - A</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {req.status === "unsubmitted" ? (
                          <select
                            value={req.reason}
                            onChange={(e) => handleIdleChange(req.id, "reason", e.target.value)}
                            className={inputClass}
                          >
                            <option value="" disabled>
                              Select Reason
                            </option>
                            {REGULARIZATION_REASON_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                            {req.reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {req.status === "unsubmitted" ? (
                          <input
                            type="text"
                            placeholder={req.reason === "Other" ? "Required when reason is Other" : "Optional notes"}
                            value={req.notes}
                            onChange={(e) => handleIdleChange(req.id, "notes", e.target.value)}
                            className={`${inputClass} ${req.reason === "Other" ? "border-amber-300 bg-amber-50/60" : ""}`}
                          />
                        ) : (
                          <div className="truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">{req.notes || "No notes"}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {req.status === "unsubmitted" ? (
                          <button
                            onClick={() => handleSubmitIdleRow(req.id)}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                          >
                            Submit Request
                          </button>
                        ) : (
                          getStatusBadge(req.status)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="overtime" className="ui-surface scroll-mt-24">
            <div className="ui-surface-header flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-4 py-3 sm:px-5">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-slate-500" />
                Overtime Request
              </h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Pending Approval</span>
            </div>

            <form onSubmit={handleOtSubmit} className="space-y-5 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Task Name</label>
                  <select value={otForm.taskName} onChange={(e) => setOtForm({ ...otForm, taskName: e.target.value })} className={inputClass}>
                    {overtimeTasks.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                  <input type="date" value={otForm.date} onChange={(e) => setOtForm({ ...otForm, date: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Estimated Remaining Work</label>
                  <select value={otForm.estimatedRemaining} onChange={(e) => setOtForm({ ...otForm, estimatedRemaining: e.target.value })} className={inputClass}>
                    <option>2 hours</option>
                    <option>4 hours</option>
                    <option>6 hours</option>
                    <option>8 hours</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Requested Extra Hours</label>
                  <select value={otForm.requestedHours} onChange={(e) => setOtForm({ ...otForm, requestedHours: e.target.value })} className={inputClass}>
                    <option>1 hour</option>
                    <option>2 hours</option>
                    <option>3 hours</option>
                    <option>4 hours</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Requested Overtime Hours</label>
                    <select value={otForm.requestedHours} onChange={(e) => setOtForm({ ...otForm, requestedHours: e.target.value })} className={inputClass}>
                      <option>1 hour</option>
                      <option>2 hours</option>
                      <option>3 hours</option>
                      <option>4 hours</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason for Overtime</label>
                    <select value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })} className={inputClass}>
                      <option>Unexpected scope change for animations</option>
                      <option>Client requested urgent revisions</option>
                      <option>Technical delays</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-[#5d5baf] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4b4991]"
                >
                  Submit Overtime Request
                </button>
              </div>
            </form>
          </section>

          <section className="ui-surface overflow-hidden">
            <div className="ui-surface-header flex items-center gap-2 px-4 py-3 sm:px-5">
              <FileClock className="h-4 w-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">Previous Overtime Requests</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="ui-table-header">
                  <tr>
                    <th className="px-4 py-3">Request Date</th>
                    <th className="px-4 py-3">Task Name</th>
                    <th className="px-4 py-3">Requested Hours</th>
                    <th className="px-4 py-3">Approved Hours</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {previousOtRequests.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-500">{req.date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{req.taskName}</td>
                      <td className="px-4 py-3 text-slate-700">{req.requested}</td>
                      <td className="px-4 py-3 text-slate-700">{req.approved}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${getStatusColorTable(req.status)}`}>{req.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <span className="text-sm font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="hover:text-emerald-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
