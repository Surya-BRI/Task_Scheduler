export type ProjectCategory = "Retail" | "Project";

export interface ProjectEntry {
  id: string;
  projectId: string;
  projectName: string;
  salesPerson: string;
  category: ProjectCategory;
}

const baseProjects: ProjectEntry[] = [
  { id: "1",  projectId: "BRI UAE-J26033-05-25", projectName: "AL FUTTAIM TRADING COMPANY LLC-BRI : STATIC-WATSON FOR ALFUTTAIM @YAS MALL DUBAI",              salesPerson: "Sarah Smith",   category: "Retail"  },
  { id: "2",  projectId: "BRI UAE-J26034-05-25", projectName: "AZTEC MIDDLE EAST CONTRACTING LLC-BRI UAE : Signage & Cladding work @Al Barsha South First Filling Station Plot No- 6710196", salesPerson: "Michael Chen",  category: "Project" },
  { id: "3",  projectId: "BRI UAE-J26035-05-25", projectName: "J&D GULF CONTRACTING LLC. : D&B Renovation Works in Service Station 475 Al Nadiya",                 salesPerson: "Emma Wilson",   category: "Project" },
  { id: "4",  projectId: "BRI UAE-J26032-05-25", projectName: "LIWA TRADING ENTERPRISES-BRI : LASENZA SIGNAGE FOR LIWA TRADING @ AL GHURAIR MALL",                salesPerson: "Sarah Smith",   category: "Retail"  },
  { id: "5",  projectId: "BRI UAE-J26031-05-25", projectName: "ALEC ENGINEERING AND CONTRACTING LLC : Signage & Wayfinding Works for Yas Water World @ Abudhabi",  salesPerson: "Michael Chen",  category: "Retail"  },
  { id: "6",  projectId: "BRI UAE-J26030-05-25", projectName: "INNOCEAN Worldwide Middle East & Africa FZ-LLC : Variation for Hyundai Ubora Tower Signage Replacement", salesPerson: "Michael Chen", category: "Project" },
  { id: "7",  projectId: "BRI UAE-J26029-05-25", projectName: "ENOC RETAIL L.L.C : EPPCO Rebranding Phase 3 - @ Site 601",                                         salesPerson: "Sarah Smith",   category: "Retail"  },
  { id: "8",  projectId: "BRI UAE-J26028-05-25", projectName: "AZTEC MIDDLE EAST CONTRACTING LLC-BRI UAE : Signage & Cladding work @Al Barsha South First Filling Station Plot No- 6710196", salesPerson: "Michael Chen",  category: "Project" },
  { id: "9",  projectId: "BRI UAE-J26027-05-25", projectName: "EMAAR MALLS GROUP LLC : Digital Signage Upgrade at Dubai Mall East Wing",                            salesPerson: "Emma Wilson",   category: "Project" },
  { id: "10", projectId: "BRI UAE-J26026-05-25", projectName: "ENPI LLC : Rebranding & Signage for ENOC Service Stations Phase 4",                                  salesPerson: "Sarah Smith",   category: "Retail"  },
  { id: "11", projectId: "BRI UAE-J26025-05-25", projectName: "NAKHEEL LLC : Wayfinding & Signage for Palm Jumeirah Retail Strip",                                  salesPerson: "John Doe",      category: "Project" },
  { id: "12", projectId: "BRI UAE-J26024-05-25", projectName: "MAJID AL FUTTAIM RETAIL : Carrefour Branded Signage Package @ Mirdif City Centre",                   salesPerson: "David Brown",   category: "Retail"  },
  { id: "13", projectId: "BRI UAE-J26023-05-25", projectName: "TRANSGUARD GROUP LLC : Office Branding & Signage at Dubai Airport Freezone",                         salesPerson: "John Doe",      category: "Project" },
  { id: "14", projectId: "BRI UAE-J26022-05-25", projectName: "LULU HYPERMARKET LLC : In-Store Signage Refresh @ Deira Branch",                                    salesPerson: "Emma Wilson",   category: "Retail"  },
  { id: "15", projectId: "BRI UAE-J26021-05-25", projectName: "DUBAI PROPERTIES GROUP : Residential Tower Wayfinding - Jumeirah Village Circle",                   salesPerson: "David Brown",   category: "Project" },
];

const generatedProjects: ProjectEntry[] = Array.from({ length: 185 }).map((_, i) => ({
  id: String(i + 16),
  projectId: `BRI UAE-J26${String(i + 40).padStart(3, '0')}-05-25`,
  projectName: `Generated Mock Layout ${i + 1} for Testing Operations`,
  salesPerson: ["John Doe", "Sarah Smith", "Michael Chen", "Emma Wilson", "David Brown"][i % 5],
  category: i % 2 === 0 ? "Retail" : "Project",
}));

export const dummyProjects: ProjectEntry[] = [...baseProjects, ...generatedProjects];
