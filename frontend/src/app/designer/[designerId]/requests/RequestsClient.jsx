"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import StatsBar from "../components/StatsBar";
import { X } from "lucide-react";

export default function RequestsClient({ designer }) {
  const router = useRouter();
  
  const [stats, setStats] = useState(designer.stats);

  // --- Idle Time Regularization State ---
  const [idleRequests, setIdleRequests] = useState([
    { id: 1, taskName: "Social Media Kit", date: "", duration: "25 mins", reason: "", notes: "", status: "unsubmitted" },
    { id: 2, taskName: "Product Launch Graphics", date: "2026-03-02", duration: "45 mins", reason: "Waiting for stakeholder feedback", notes: "Client delay on copy", status: "Pending" },
    { id: 3, taskName: "Mobile App Mockups", date: "2026-03-01", duration: "30 mins", reason: "System downtime", notes: "Server issues confirmed by IT", status: "Approved" },
  ]);

  const handleIdleChange = (id, field, value) => {
    setIdleRequests(prev => prev.map(req => req.id === id ? { ...req, [field]: value } : req));
  };

  const handleSubmitIdleRow = (id) => {
    const req = idleRequests.find(r => r.id === id);
    if (!req.date || !req.reason) {
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

  const inputClass = "w-full rounded-full bg-slate-200/60 border border-transparent px-4 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:bg-white transition-colors cursor-pointer";

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

      <div className="flex-1 overflow-auto p-6">
         <div className="w-full space-y-8 mt-2">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-serif text-slate-900 font-bold">Regularization Request</h1>
              <button 
                onClick={() => router.back()}
                className="px-4 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
              >
                Back to Dashboard
              </button>
            </div>

            {/* Idle Time Regularization Card */}
            <div id="regularization" className="bg-white rounded-[20px] shadow-sm border border-slate-200 p-8 relative scroll-mt-24">
               <div className="flex items-center justify-between mb-6">
                 <h2 className="text-lg font-serif text-slate-800">Idle Time Regularization</h2>
                 <button 
                   onClick={handleRequestAllRegularization}
                   className="px-6 py-2 bg-[#5d5baf] text-white rounded-lg text-sm font-semibold hover:bg-[#4b4991] transition-colors shadow-sm"
                 >
                   Request Regularization
                 </button>
               </div>

               <div className="overflow-x-auto rounded-lg">
                 <table className="w-full text-sm text-left border-collapse min-w-[900px]">
                   <thead className="bg-[#e4e4e4] text-slate-700">
                     <tr>
                       <th className="px-4 py-3 font-semibold rounded-tl-lg">Completed Task</th>
                       <th className="px-4 py-3 font-semibold text-center">Date</th>
                       <th className="px-4 py-3 font-semibold text-center">Idle Time Duration</th>
                       <th className="px-4 py-3 font-semibold">Reason for Idle Time ( Required )</th>
                       <th className="px-4 py-3 font-semibold">Optional Notes</th>
                       <th className="px-4 py-3 font-semibold text-center rounded-tr-lg">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 bg-[#f7f7f7]">
                     {idleRequests.map(req => (
                       <tr key={req.id}>
                         <td className="px-4 py-4 font-medium text-slate-800">{req.taskName}</td>
                         <td className="px-4 py-4 text-center">
                           {req.status === "unsubmitted" ? (
                             <input 
                               type="date" 
                               value={req.date}
                               onChange={(e) => handleIdleChange(req.id, "date", e.target.value)}
                               className="rounded-full bg-slate-200/80 px-3 py-1.5 text-xs text-slate-700 focus:outline-none w-[110px]"
                             />
                           ) : (
                             <span className="rounded-full bg-slate-200/80 px-3 py-1.5 text-xs text-slate-700 inline-block w-[110px]">
                               {req.date || "dd-mm-yyyy"}
                             </span>
                           )}
                         </td>
                         <td className="px-4 py-4 text-center">
                           <div className="flex items-center justify-center gap-2">
                             <span className="text-slate-800 font-medium">{req.duration}</span>
                             <span className="bg-[#5d5baf] text-white text-[10px] font-bold px-2 py-1 rounded">T - A</span>
                           </div>
                         </td>
                         <td className="px-4 py-4">
                           {req.status === "unsubmitted" ? (
                             <input 
                               type="text" 
                               placeholder="Text"
                               value={req.reason}
                               onChange={(e) => handleIdleChange(req.id, "reason", e.target.value)}
                               className="w-full rounded-full bg-slate-200/80 px-4 py-2 text-sm text-slate-800 focus:outline-none"
                             />
                           ) : (
                             <div className="w-full rounded-full bg-slate-200/50 px-4 py-2 text-sm text-slate-600 truncate">
                               {req.reason}
                             </div>
                           )}
                         </td>
                         <td className="px-4 py-4">
                           {req.status === "unsubmitted" ? (
                             <input 
                               type="text" 
                               placeholder="Text"
                               value={req.notes}
                               onChange={(e) => handleIdleChange(req.id, "notes", e.target.value)}
                               className="w-full rounded-full bg-slate-200/80 px-4 py-2 text-sm text-slate-800 focus:outline-none"
                             />
                           ) : (
                             <div className="w-full rounded-full bg-slate-200/50 px-4 py-2 text-sm text-slate-600 truncate">
                               {req.notes || "No notes"}
                             </div>
                           )}
                         </td>
                         <td className="px-4 py-4 text-center">
                           {req.status === "unsubmitted" ? (
                             <button 
                               onClick={() => handleSubmitIdleRow(req.id)}
                               className="bg-blue-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm w-24 hover:bg-blue-600 transition-colors"
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
            </div>

            {/* Overtime Request Card */}
            <div id="overtime" className="bg-white rounded-[20px] shadow-sm border border-slate-200 p-8 relative scroll-mt-24">
               <div className="absolute top-6 right-6">
                 <span className="bg-[#d4be5c] text-[#6b5d19] px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                   Pending Approval
                 </span>
               </div>
               
               <h2 className="text-xl font-serif text-slate-800 mb-8">Overtime Request</h2>

               <form onSubmit={handleOtSubmit} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-6">
                    <div>
                      <label className="block text-sm text-slate-800 mb-2 font-medium">Task Name</label>
                      <select 
                        value={otForm.taskName} 
                        onChange={e => setOtForm({...otForm, taskName: e.target.value})}
                        className={inputClass}
                      >
                         {overtimeTasks.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-800 mb-2 font-medium">Date</label>
                      <input 
                        type="date"
                        value={otForm.date} 
                        onChange={e => setOtForm({...otForm, date: e.target.value})}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-800 mb-2 font-medium">Estimated Remaining Work</label>
                      <select 
                        value={otForm.estimatedRemaining} 
                        onChange={e => setOtForm({...otForm, estimatedRemaining: e.target.value})}
                        className={inputClass}
                      >
                         <option>2 hours</option>
                         <option>4 hours</option>
                         <option>6 hours</option>
                         <option>8 hours</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-800 mb-2 font-medium">Requested Extra Hours</label>
                      <select 
                        value={otForm.requestedHours} 
                        onChange={e => setOtForm({...otForm, requestedHours: e.target.value})}
                        className={inputClass}
                      >
                         <option>1 hour</option>
                         <option>2 hours</option>
                         <option>3 hours</option>
                         <option>4 hours</option>
                      </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-end mt-4">
                    <div className="flex gap-6 w-full">
                      <div className="w-1/3">
                        <label className="block text-sm text-slate-800 mb-2 font-medium whitespace-nowrap">Requested Overtime Hours</label>
                        <select 
                          value={otForm.requestedHours} 
                          onChange={e => setOtForm({...otForm, requestedHours: e.target.value})}
                          className={inputClass}
                        >
                           <option>1 hour</option>
                           <option>2 hours</option>
                           <option>3 hours</option>
                           <option>4 hours</option>
                        </select>
                      </div>
                      <div className="w-2/3">
                        <label className="block text-sm text-slate-800 mb-2 font-medium">Reason for Overtime</label>
                        <select 
                          value={otForm.reason} 
                          onChange={e => setOtForm({...otForm, reason: e.target.value})}
                          className={inputClass}
                        >
                           <option>Unexpected scope change for animations</option>
                           <option>Client requested urgent revisions</option>
                           <option>Technical delays</option>
                           <option>Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end xl:pl-4 mt-4 xl:mt-0">
                      <button type="submit" className="w-full xl:w-auto px-8 py-2.5 bg-[#5d5baf] text-white rounded-lg text-sm font-semibold hover:bg-[#4b4991] transition-colors shadow-sm">
                         Submit Overtime Request
                      </button>
                    </div>
                 </div>
               </form>
            </div>

            {/* Overtime Requests History Table */}
            <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-5 border-b border-slate-200 bg-white">
                  <h3 className="text-lg font-serif text-slate-800">Previous Overtime Requests</h3>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                     <tr>
                       <th className="px-6 py-4 font-semibold">Request Date</th>
                       <th className="px-6 py-4 font-semibold">Task Name</th>
                       <th className="px-6 py-4 font-semibold">Requested Hours</th>
                       <th className="px-6 py-4 font-semibold">Approved Hours</th>
                       <th className="px-6 py-4 font-semibold text-center">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {previousOtRequests.map(req => (
                       <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-4 text-slate-500 font-medium">{req.date}</td>
                         <td className="px-6 py-4 font-semibold text-slate-800">{req.taskName}</td>
                         <td className="px-6 py-4 text-slate-700">{req.requested}</td>
                         <td className="px-6 py-4 text-slate-700">{req.approved}</td>
                         <td className="px-6 py-4 text-center">
                           <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColorTable(req.status)}`}>
                             {req.status}
                           </span>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
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
