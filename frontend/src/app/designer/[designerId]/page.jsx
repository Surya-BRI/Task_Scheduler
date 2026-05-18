import DesignerDashboard from "./DesignerDashboard";
import { getDesigner } from "@/lib/designers.server";

export const metadata = {
  title: "Designer Dashboard | Blue Rhine Industries",
  description: "Weekly workload, task schedule, and performance dashboard for a designer at Blue Rhine Industries.",
};

export default async function DesignerPage({ params }) {
  const { designerId } = await params;
  const designer = getDesigner(designerId);

  if (!designer) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Designer Not Found</h1>
          <p className="text-slate-500 mb-6">The requested designer dashboard does not exist or the ID is invalid.</p>
          <a href="/design-scheduler" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition w-full">
            Return to Scheduler
          </a>
        </div>
      </div>
    );
  }

  return <DesignerDashboard designer={designer} />;
}
