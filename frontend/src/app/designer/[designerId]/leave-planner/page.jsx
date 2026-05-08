import { readFileSync } from "fs";
import path from "path";
import LeavePlannerClient from "./LeavePlannerClient";

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
    const mockInfo = DUMMY_DESIGNERS.find(d => d.id === designerId);
    if (mockInfo) {
      try {
        const baseFilePath = path.join(process.cwd(), "src", "data", "designers", `d1.json`);
        const baseData = JSON.parse(readFileSync(baseFilePath, "utf-8"));
        return {
          ...baseData,
          id: mockInfo.id,
          name: mockInfo.name,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function LeavePlannerPage({ params }) {
  const { designerId } = await params;
  const designer = await getDesigner(designerId);

  if (!designer) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div>Designer Not Found</div>
      </div>
    );
  }

  return <LeavePlannerClient designer={designer} />;
}
