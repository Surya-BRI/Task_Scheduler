/**
 * ERP business-unit codes that count as "Retail" for task/project categorization.
 * Maintenance tickets are treated identically to Retail everywhere — same task creation
 * flow, same status workflow, same scheduler/notifications — this is the single list that
 * decides who gets folded into that bucket.
 */
export const RETAIL_BUSINESS_UNIT_CODES = new Set<string>([
  'retail',
  'rtl',
  'r',
  'prosigns-retail',
  'maintenance',
]);

export function isRetailBusinessUnitCode(businessUnitCode?: string | null): boolean {
  const normalized = String(businessUnitCode ?? '').trim().toLowerCase();
  return RETAIL_BUSINESS_UNIT_CODES.has(normalized);
}
