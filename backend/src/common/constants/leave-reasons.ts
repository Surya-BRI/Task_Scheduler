export const LEAVE_REASON_OPTIONS = [
  'Sick Leave',
  'Personal Work',
  'Emergency',
  'Family Function',
  'Vacation',
  'Medical Appointment',
  'Work From Home',
  'Other',
] as const;

export type LeaveReasonOption = (typeof LEAVE_REASON_OPTIONS)[number];

export function formatLeaveReason(category: string, otherText?: string | null): string {
  const cat = category?.trim() ?? '';
  if (cat === 'Other') {
    const detail = otherText?.trim();
    if (!detail) {
      throw new Error('Other reason requires explanation');
    }
    return `Other: ${detail}`;
  }
  return cat;
}

export function assertValidLeaveReason(category: string, otherText?: string | null): string {
  if (!LEAVE_REASON_OPTIONS.includes(category as LeaveReasonOption)) {
    throw new Error(`Invalid leave reason. Choose one of: ${LEAVE_REASON_OPTIONS.join(', ')}`);
  }
  return formatLeaveReason(category, otherText);
}
