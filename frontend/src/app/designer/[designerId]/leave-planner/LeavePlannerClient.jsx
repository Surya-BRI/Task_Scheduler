"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { X, Calendar as CalendarIcon, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2026 is not a leap year

export default function LeavePlannerClient({ designer }) {
  const router = useRouter();
  const YEAR = 2026; // Based on the UI mock
  
  // Local state for leaves
  const [leaves, setLeaves] = useState([]);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHODModalOpen, setIsHODModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [isHOD, setIsHOD] = useState(false);

  useEffect(() => {
    import("@/lib/mock-auth").then(({ getSession }) => {
      const session = getSession();
      if (session?.role === "HOD") setIsHOD(true);
    });
  }, []);
  const [formData, setFormData] = useState({
    reason: "",
    fromDate: "",
    toDate: ""
  });

  // Load leaves from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(`leave_requests_${designer.id}`);
    if (stored) {
      setLeaves(JSON.parse(stored));
    }
  }, [designer.id]);

  // Save leaves to localStorage whenever they change
  useEffect(() => {
    if (leaves.length > 0) {
      localStorage.setItem(`leave_requests_${designer.id}`, JSON.stringify(leaves));
    }
  }, [leaves, designer.id]);

  const handleDayClick = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return;
    
    // Format YYYY-MM-DD
    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const leaveStatus = getLeaveStatusForDate(dateStr);

    if (isHOD) {
      if (leaveStatus === "PENDING") {
        const leave = leaves.find(l => {
          const fromTime = new Date(l.fromDate).getTime();
          const toTime = new Date(l.toDate).getTime();
          const targetTime = new Date(dateStr).getTime();
          return targetTime >= fromTime && targetTime <= toTime;
        });
        if (leave) {
          setSelectedLeave(leave);
          setIsHODModalOpen(true);
        }
      } else {
        setFormData({
          reason: "",
          fromDate: dateStr,
          toDate: dateStr
        });
        setSelectedDate(dateStr);
        setIsModalOpen(true);
      }
      return;
    }
    
    setFormData({
      reason: "",
      fromDate: dateStr,
      toDate: dateStr
    });
    setSelectedDate(dateStr);
    setIsModalOpen(true);
  };

  const handleApproveLeave = (id) => {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: "APPROVED" } : l));
    setIsHODModalOpen(false);
  };

  const handleRejectLeave = (id) => {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: "REJECTED" } : l));
    setIsHODModalOpen(false);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!formData.reason || !formData.fromDate || !formData.toDate) {
      alert("Please fill in all fields.");
      return;
    }
    
    const newRequest = {
      id: Date.now(),
      designerId: designer.id,
      reason: formData.reason,
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      status: "PENDING",
      createdBy: isHOD ? "HOD" : "Designer"
    };
    
    setLeaves([...leaves, newRequest]);
    setIsModalOpen(false);
  };

  const getLeaveStatusForDate = (dateStr) => {
    const targetTime = new Date(dateStr).getTime();
    for (const leave of leaves) {
      const fromTime = new Date(leave.fromDate).getTime();
      const toTime = new Date(leave.toDate).getTime();
      if (targetTime >= fromTime && targetTime <= toTime) {
        return leave.status;
      }
    }
    return null;
  };

  const getCellClass = (monthIndex, day) => {
    if (day > DAYS_IN_MONTH[monthIndex]) return "bg-slate-100/50 pointer-events-none"; 
    
    const dateStr = `${YEAR}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(YEAR, monthIndex, day);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; 
    
    const leaveStatus = getLeaveStatusForDate(dateStr);
    
    if (leaveStatus === "APPROVED") {
      return "bg-rose-500 cursor-pointer hover:bg-rose-600 transition-colors shadow-inner z-10 relative";
    } else if (leaveStatus === "PENDING") {
      return "bg-amber-300/80 cursor-pointer hover:bg-amber-400 transition-colors z-10 relative"; 
    }
    
    if (isWeekend) return "bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"; 
    
    return "bg-white cursor-pointer hover:bg-slate-50 transition-colors"; 
  };

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans bg-[#f8fafc]">
      <Navbar dateRangeText={designer.dateRange} />
      
      {/* Top Header matching other pages */}
      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-700">
        <div className="flex w-auto items-center gap-3 border-r border-slate-200 pr-6">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold leading-none shrink-0 shadow-sm">
            {designer.avatar ? (
              <img src={designer.avatar} alt={designer.name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{designer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
            )}
          </div>
          {isHOD ? (
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-slate-500 mb-1">Creating Request For:</span>
              <select 
                className="text-sm font-semibold bg-slate-100 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-[#5d5baf]/20 cursor-pointer"
                value={designer.id}
                onChange={(e) => router.push(`/designer/${e.target.value}/leave-planner`)}
              >
                <option value="d1">Alex Johnson</option>
                <option value="d2">Alexander Allen</option>
                <option value="d3">Benjamin Harris</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-slate-900">{designer.name}</span>
              <span className="text-[10px] leading-tight text-slate-500">{designer.designation}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-[1400px] space-y-6">
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
                <CalendarIcon className="w-6 h-6 text-[#5d5baf]" />
                Annual Leave Planner
              </h1>
              <p className="text-sm text-slate-500 mt-1">Select dates to submit a leave request</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
              >
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="ui-surface overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[1200px]">
                <thead>
                  <tr>
                    <th className="bg-gradient-to-br from-[#5d5baf] to-[#4b4991] text-white font-bold p-3 text-center w-36 border-b border-r border-[#4b4991] shadow-inner text-lg tracking-wider">
                      {YEAR}
                    </th>
                    {/* Days 1 to 31 */}
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <th key={day} className="bg-[#f4f5fa] text-[#5d5baf] font-bold p-2 text-center min-w-[32px] border-b border-r border-slate-200 text-xs">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((month, mIndex) => (
                    <tr key={month} className="group">
                      <td className="bg-slate-50 text-slate-700 font-semibold p-3 border-b border-r border-slate-200 w-36 group-hover:bg-[#f4f5fa] transition-colors">
                        {month}
                      </td>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <td 
                          key={day} 
                          className={`border-b border-r border-slate-100 h-10 ${getCellClass(mIndex, day)}`}
                          onClick={() => handleDayClick(mIndex, day)}
                        ></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-6 text-sm font-medium text-slate-600 bg-white py-3 px-5 rounded-lg border border-slate-200 shadow-sm inline-flex">
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-slate-50 border border-slate-200 rounded shadow-sm"></div>
              <span>Weekend</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-amber-300/80 border border-amber-200 rounded shadow-sm"></div>
              <span>Pending Request</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-4 h-4 bg-rose-500 border border-rose-600 rounded shadow-sm"></div>
              <span>Approved Leave</span>
            </div>
          </div>

        </div>
      </div>

      {/* Leave Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2.5">
                <div className="p-2 bg-[#f0f1fa] rounded-lg">
                  <CalendarIcon className="w-5 h-5 text-[#5d5baf]" />
                </div>
                Submit Leave Request
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleModalSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Reason for Leave</label>
                <textarea 
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] min-h-[100px] shadow-sm transition-all resize-none bg-slate-50 focus:bg-white"
                  placeholder="E.g., Vacation, Medical, Personal..."
                  required
                ></textarea>
              </div>
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                  <input 
                    type="date" 
                    value={formData.fromDate}
                    onChange={e => setFormData({...formData, fromDate: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white transition-all cursor-pointer"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
                  <input 
                    type="date" 
                    value={formData.toDate}
                    onChange={e => setFormData({...formData, toDate: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5d5baf]/20 focus:border-[#5d5baf] shadow-sm bg-slate-50 focus:bg-white transition-all cursor-pointer"
                    required
                  />
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-medium text-white bg-[#5d5baf] rounded-xl hover:bg-[#4b4991] shadow-md shadow-[#5d5baf]/20 transition-all active:scale-[0.98]"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHODModalOpen && selectedLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2.5">
                <div className="p-2 bg-[#f0f1fa] rounded-lg">
                  <CalendarIcon className="w-5 h-5 text-[#5d5baf]" />
                </div>
                Review Leave Request
              </h2>
              <button 
                onClick={() => setIsHODModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-500 font-medium mb-1">Reason</p>
                <p className="text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-100">{selectedLeave.reason}</p>
              </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">From</p>
                  <p className="text-slate-900 font-semibold">{formatDate(selectedLeave.fromDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium mb-1">To</p>
                  <p className="text-slate-900 font-semibold">{formatDate(selectedLeave.toDate)}</p>
                </div>
              </div>
              {selectedLeave.createdBy && (
                <div className="mt-4">
                  <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                    Created By: {selectedLeave.createdBy}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => handleRejectLeave(selectedLeave.id)}
                className="px-5 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleApproveLeave(selectedLeave.id)}
                className="px-6 py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98]"
              >
                Approve Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
