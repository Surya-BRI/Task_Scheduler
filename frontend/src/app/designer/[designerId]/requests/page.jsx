import { readFileSync } from "fs";
import path from "path";
import RequestsClient from "./RequestsClient";

const DUMMY_DESIGNERS = [
  { id: "d1", name: "Alex Johnson", erpDesignerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" },
  { id: "d2", name: "Alexander Allen", erpDesignerId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12" },
  { id: "d3", name: "Benjamin Harris", erpDesignerId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a13" },
];

async function getDesigner(designerId) {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "designers", `${designerId}.json`);
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const mockInfo = DUMMY_DESIGNERS.find((d) => d.id === designerId);
    return {
      ...data,
      erpDesignerId: data.erpDesignerId ?? mockInfo?.erpDesignerId,
    };
  } catch {
    const mockInfo = DUMMY_DESIGNERS.find(d => d.id === designerId) || { id: designerId, name: "Designer", erpDesignerId: undefined };
    try {
      const baseFilePath = path.join(process.cwd(), "src", "data", "designers", `d1.json`);
      const baseData = JSON.parse(readFileSync(baseFilePath, "utf-8"));
      return {
        ...baseData,
        id: mockInfo.id,
        name: mockInfo.name,
        erpDesignerId: baseData.erpDesignerId ?? mockInfo.erpDesignerId,
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
