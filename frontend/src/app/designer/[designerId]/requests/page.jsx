import { readFileSync } from "fs";
import path from "path";
import RequestsClient from "./RequestsClient";

const DUMMY_DESIGNERS = [
  { id: "d1", name: "Alex Johnson" },
  { id: "d2", name: "Alexander Allen" },
  { id: "d3", name: "Benjamin Harris" },
];

async function getDesigner(designerId) {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "designers", `${designerId}.json`);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    const mockInfo = DUMMY_DESIGNERS.find(d => d.id === designerId) || { id: designerId, name: "Designer" };
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
}

export default async function RequestsPage({ params }) {
  const { designerId } = await params;
  const designer = await getDesigner(designerId);

  if (!designer) {
    return <div>Designer not found.</div>;
  }

  return <RequestsClient designer={designer} />;
}
