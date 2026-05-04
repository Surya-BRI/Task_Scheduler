import { readFileSync } from "fs";
import path from "path";
import DesignerDashboard from "./DesignerDashboard";

export const metadata = {
  title: "Designer Dashboard | Blue Rhine Industries",
  description: "Weekly workload, task schedule, and performance dashboard for a designer at Blue Rhine Industries.",
};

const DUMMY_DESIGNERS = [
  { id: "d1", name: "Alex Johnson" },
  { id: "d2", name: "Alexander Allen" },
  { id: "d3", name: "Benjamin Harris" },
  { id: "d4", name: "Chloe Wright" },
  { id: "d5", name: "David Adams" },
  { id: "d6", name: "Ella Young" },
  { id: "d7", name: "Emily Davis" },
  { id: "d8", name: "Ethan Anderson" },
  { id: "d9", name: "Grace Green" },
  { id: "d10", name: "Hannah Perez" },
  { id: "d11", name: "Designer 11" },
  { id: "d12", name: "Designer 12" },
  { id: "d13", name: "Designer 13" },
  { id: "d14", name: "Designer 14" },
  { id: "d15", name: "Designer 15" },
  { id: "d16", name: "Designer 16" },
  { id: "d17", name: "Designer 17" },
  { id: "d18", name: "Designer 18" },
  { id: "d19", name: "Designer 19" },
  { id: "d20", name: "Designer 20" },
];

async function getDesigner(designerId) {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "designers", `${designerId}.json`);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    // If the file doesn't exist, check if it's a valid ID and mock it using d1.json as a base
    const mockInfo = DUMMY_DESIGNERS.find(d => d.id === designerId);
    if (mockInfo) {
      try {
        const baseFilePath = path.join(process.cwd(), "src", "data", "designers", `d1.json`);
        const baseData = JSON.parse(readFileSync(baseFilePath, "utf-8"));
        
        return {
          ...baseData,
          id: mockInfo.id,
          name: mockInfo.name,
          stats: {
            ...baseData.stats,
            score: Math.floor(Math.random() * 15) + 85, // Random score between 85-99
            workLoad: { tasks: Math.floor(Math.random() * 20) + 5, hours: Math.floor(Math.random() * 30) + 10 }
          }
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function DesignerPage({ params }) {
  const { designerId } = await params;
  const designer = await getDesigner(designerId);

  if (!designer) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Designer Not Found</h1>
          <p className="text-gray-500 mb-6">The requested designer dashboard does not exist or the ID is invalid.</p>
          <a href="/design-scheduler" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition w-full">
            Return to Scheduler
          </a>
        </div>
      </div>
    );
  }

  return <DesignerDashboard designer={designer} />;
}
