/** Retail subtype codes/labels stored on Task.designType (not the literal "Retail"). */
const RETAIL_DESIGN_TYPES = new Set([
  'retail',
  'rtl',
  'r',
  'estimation_purpose',
  'estimation purpose',
  'presentation',
  'client_submission',
  'client submission',
  'technical_drawing',
  'technical drawing',
]);

/** True when designType is Retail or a retail subtype (Estimation Purpose, etc.). */
export function isRetailDesignType(value?: string | null): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
  if (!normalized) return false;
  return (
    RETAIL_DESIGN_TYPES.has(normalized) ||
    RETAIL_DESIGN_TYPES.has(normalized.replace(/ /g, '_'))
  );
}

/** App path for opening a task detail page. */
export function taskViewPath(taskId: string, designType?: string | null): string {
  return isRetailDesignType(designType)
    ? `/retail-task-view/${taskId}`
    : `/project-task-view/${taskId}`;
}
