export type DesignStatus = "WIP" | "Completed" | "Pending" | "Revision" | "Approved";

export interface DesignEntry {
  id: string;
  opNo: string;
  projectNo: string;
  designType: "Retail" | "Project";
  businessUnit: string;
  name: string;
  status: DesignStatus;
  salesPerson: string;
  created: string;
  deadline: string;
  agingDays: number;
}

const statuses: DesignStatus[] = ["WIP", "Completed", "Pending", "Revision", "Approved"];
const designTypes: ("Retail" | "Project")[] = ["Retail", "Project"];
const businessUnits = ["Acme Corporation", "TechStart Inc", "Fashion Hub", "Green Valley Developers", "Urban Outfitters", "Metro City Council", "Gourmet Market", "Skyline Properties", "Wellness Center", "Education First"];
const names = ["Retail Store Redesign", "Office Complex Phase 1", "Boutique Showroom", "Residential Tower A", "Mall Kiosk Design", "Public Library Renovation", "Flagship Store", "Commercial Plaza", "Spa & Fitness Facility", "University Campus Building"];
const salesPersons = ["John Doe", "Sarah Smith", "Michael Chen", "Emma Wilson", "David Brown"];

export const dummyDesigns: DesignEntry[] = Array.from({ length: 100 }).map((_, i) => ({
  id: String(i + 1),
  opNo: `OP-2026-${String(i + 1).padStart(3, "0")}`,
  // Deterministic Project No based on index
  projectNo: `BRI UAE-${10000 + (i * 733) % 90000}-0${(i % 9) + 1}-26`,
  designType: designTypes[i % designTypes.length],
  businessUnit: businessUnits[i % businessUnits.length],
  name: names[i % names.length],
  status: statuses[i % statuses.length],
  salesPerson: salesPersons[i % salesPersons.length],
  created: `0${(i % 9) + 1}/02/2026`,
  deadline: `1${(i % 9) + 1}/02/2026`,
  // Deterministic Aging based on index
  agingDays: 1 + (i * 13) % 40,
}));
