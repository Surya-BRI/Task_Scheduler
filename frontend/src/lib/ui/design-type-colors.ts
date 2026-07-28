/**
 * Soft pastel badge/block colors by Retail Design Type and Project discipline.
 *
 * Hue map (spread for quick discrimination):
 * Retail  — fuchsia · blue · cyan · green
 * Project — yellow · orange · rose · slate
 */

export type RetailDesignTypeCode =
  | 'ESTIMATION_PURPOSE'
  | 'PRESENTATION'
  | 'CLIENT_SUBMISSION'
  | 'TECHNICAL_DRAWING';

export type ProjectDisciplineCode =
  | 'ARTWORK'
  | 'TECHNICAL'
  | 'LOCATION'
  | 'AS_BUILT';

export const RETAIL_DESIGN_TYPE_LABELS: Record<RetailDesignTypeCode, string> = {
  ESTIMATION_PURPOSE: 'Estimation Purpose',
  PRESENTATION: 'Presentation',
  CLIENT_SUBMISSION: 'Client Submission',
  TECHNICAL_DRAWING: 'Technical Drawing',
};

export const PROJECT_DISCIPLINE_LABELS: Record<ProjectDisciplineCode, string> = {
  ARTWORK: 'Artwork',
  TECHNICAL: 'Technical',
  LOCATION: 'Location',
  AS_BUILT: 'As-Built',
};

/** Primary accent hex (borders / legend swatches). */
export const RETAIL_DESIGN_TYPE_HEX: Record<RetailDesignTypeCode, string> = {
  ESTIMATION_PURPOSE: '#D946EF', // fuchsia
  PRESENTATION: '#3B82F6', // blue
  CLIENT_SUBMISSION: '#06B6D4', // cyan
  TECHNICAL_DRAWING: '#22A06B', // green
};

export const PROJECT_DISCIPLINE_HEX: Record<ProjectDisciplineCode, string> = {
  ARTWORK: '#CDB83C', // yellow
  TECHNICAL: '#F97316', // orange
  LOCATION: '#F43F5E', // rose
  AS_BUILT: '#4B5563', // slate
};

/** Soft pastel block chrome — light fill + accent border + dark text. */
export const RETAIL_DESIGN_TYPE_BLOCK_CLASSES: Record<RetailDesignTypeCode, string> = {
  ESTIMATION_PURPOSE: 'bg-[#FDF4FF] border border-[#D946EF] text-[#86198F]',
  PRESENTATION: 'bg-[#EFF5FF] border border-[#3B82F6] text-[#1E40AF]',
  CLIENT_SUBMISSION: 'bg-[#ECFEFF] border border-[#06B6D4] text-[#0E7490]',
  TECHNICAL_DRAWING: 'bg-[#EAF7F0] border border-[#22A06B] text-[#166534]',
};

export const PROJECT_DISCIPLINE_BLOCK_CLASSES: Record<ProjectDisciplineCode, string> = {
  ARTWORK: 'bg-[#FBF8E4] border border-[#CDB83C] text-[#5C5410]',
  TECHNICAL: 'bg-[#FFF7ED] border border-[#F97316] text-[#9A3412]',
  LOCATION: 'bg-[#FFF1F2] border border-[#F43F5E] text-[#9F1239]',
  AS_BUILT: 'bg-[#F1F5F9] border border-[#4B5563] text-[#111827]',
};

/** Status-badge style pills — same pastel language as blocks. */
export const RETAIL_DESIGN_TYPE_PILL_CLASSES: Record<RetailDesignTypeCode, string> = {
  ESTIMATION_PURPOSE: 'bg-[#FDF4FF] text-[#86198F] border border-[#D946EF]',
  PRESENTATION: 'bg-[#EFF5FF] text-[#1E40AF] border border-[#3B82F6]',
  CLIENT_SUBMISSION: 'bg-[#ECFEFF] text-[#0E7490] border border-[#06B6D4]',
  TECHNICAL_DRAWING: 'bg-[#EAF7F0] text-[#166534] border border-[#22A06B]',
};

export const PROJECT_DISCIPLINE_PILL_CLASSES: Record<ProjectDisciplineCode, string> = {
  ARTWORK: 'bg-[#FBF8E4] text-[#5C5410] border border-[#CDB83C]',
  TECHNICAL: 'bg-[#FFF7ED] text-[#9A3412] border border-[#F97316]',
  LOCATION: 'bg-[#FFF1F2] text-[#9F1239] border border-[#F43F5E]',
  AS_BUILT: 'bg-[#F1F5F9] text-[#111827] border border-[#4B5563]',
};

/** Legend swatches use the primary accent color. */
export const RETAIL_DESIGN_TYPE_SWATCH_CLASSES: Record<RetailDesignTypeCode, string> = {
  ESTIMATION_PURPOSE: 'bg-[#D946EF]',
  PRESENTATION: 'bg-[#3B82F6]',
  CLIENT_SUBMISSION: 'bg-[#06B6D4]',
  TECHNICAL_DRAWING: 'bg-[#22A06B]',
};

export const PROJECT_DISCIPLINE_SWATCH_CLASSES: Record<ProjectDisciplineCode, string> = {
  ARTWORK: 'bg-[#CDB83C]',
  TECHNICAL: 'bg-[#F97316]',
  LOCATION: 'bg-[#F43F5E]',
  AS_BUILT: 'bg-[#4B5563]',
};

export const RETAIL_DESIGN_TYPE_LEGEND: ReadonlyArray<{
  code: RetailDesignTypeCode;
  label: string;
  hex: string;
  swatchClass: string;
}> = (
  Object.keys(RETAIL_DESIGN_TYPE_LABELS) as RetailDesignTypeCode[]
).map((code) => ({
  code,
  label: RETAIL_DESIGN_TYPE_LABELS[code],
  hex: RETAIL_DESIGN_TYPE_HEX[code],
  swatchClass: RETAIL_DESIGN_TYPE_SWATCH_CLASSES[code],
}));

export const PROJECT_DISCIPLINE_LEGEND: ReadonlyArray<{
  code: ProjectDisciplineCode;
  label: string;
  hex: string;
  swatchClass: string;
}> = (
  Object.keys(PROJECT_DISCIPLINE_LABELS) as ProjectDisciplineCode[]
).map((code) => ({
  code,
  label: PROJECT_DISCIPLINE_LABELS[code],
  hex: PROJECT_DISCIPLINE_HEX[code],
  swatchClass: PROJECT_DISCIPLINE_SWATCH_CLASSES[code],
}));

export function normalizeRetailDesignTypeCode(value: unknown): RetailDesignTypeCode | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if (raw === 'ESTIMATION_PURPOSE' || raw === 'ESTIMATIONPURPOSE') return 'ESTIMATION_PURPOSE';
  if (raw === 'PRESENTATION') return 'PRESENTATION';
  if (raw === 'CLIENT_SUBMISSION' || raw === 'CLIENTSUBMISSION') return 'CLIENT_SUBMISSION';
  if (raw === 'TECHNICAL_DRAWING' || raw === 'TECHNICALDRAWING') return 'TECHNICAL_DRAWING';
  return null;
}

export function normalizeProjectDisciplineCode(value: unknown): ProjectDisciplineCode | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if (raw === 'ARTWORK') return 'ARTWORK';
  if (raw === 'TECHNICAL') return 'TECHNICAL';
  if (raw === 'LOCATION') return 'LOCATION';
  if (raw === 'AS_BUILT' || raw === 'ASBUILT') return 'AS_BUILT';
  return null;
}

export function isRetailDesignSubtype(value: unknown): boolean {
  return normalizeRetailDesignTypeCode(value) != null;
}

export function formatRetailDesignTypeLabel(value: unknown): string | null {
  const code = normalizeRetailDesignTypeCode(value);
  if (code) return RETAIL_DESIGN_TYPE_LABELS[code];
  const raw = String(value ?? '').trim();
  if (!raw || /^(retail|project)$/i.test(raw)) return null;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatProjectDisciplineLabel(value: unknown): string | null {
  const code = normalizeProjectDisciplineCode(value);
  return code ? PROJECT_DISCIPLINE_LABELS[code] : null;
}

export function resolveRetailDesignTypeHex(value: unknown): string | null {
  const code = normalizeRetailDesignTypeCode(value);
  return code ? RETAIL_DESIGN_TYPE_HEX[code] : null;
}

export function resolveDisciplineHex(value: unknown): string | null {
  const code = normalizeProjectDisciplineCode(value);
  return code ? PROJECT_DISCIPLINE_HEX[code] : null;
}

export function resolveRetailDesignTypeBlockClass(value: unknown): string | null {
  const code = normalizeRetailDesignTypeCode(value);
  return code ? RETAIL_DESIGN_TYPE_BLOCK_CLASSES[code] : null;
}

export function resolveRetailDesignTypePillClass(value: unknown): string | null {
  const code = normalizeRetailDesignTypeCode(value);
  return code ? RETAIL_DESIGN_TYPE_PILL_CLASSES[code] : null;
}

export function resolveDisciplineBlockClass(value: unknown): string | null {
  const code = normalizeProjectDisciplineCode(value);
  return code ? PROJECT_DISCIPLINE_BLOCK_CLASSES[code] : null;
}

export function resolveDisciplinePillClass(value: unknown): string | null {
  const code = normalizeProjectDisciplineCode(value);
  return code ? PROJECT_DISCIPLINE_PILL_CLASSES[code] : null;
}

/**
 * Prefer retail design-type color, then project discipline color,
 * otherwise the provided fallback (e.g. rotating palette).
 */
export function resolveTaskBlockColorClass(
  designType: unknown,
  fallbackClass: string,
  disciplineType?: unknown,
): string {
  return (
    resolveRetailDesignTypeBlockClass(designType) ??
    resolveDisciplineBlockClass(disciplineType) ??
    resolveDisciplineBlockClass(designType) ??
    fallbackClass
  );
}

/** Chip class for either a retail subtype or a project discipline label. */
export function resolveTypeOrDisciplinePillClass(value: unknown): string | null {
  return resolveRetailDesignTypePillClass(value) ?? resolveDisciplinePillClass(value);
}
