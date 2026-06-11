/** Unified request/approval status semantics across Leave, OT, Regularization, Inbox. */

export type StatusBucket =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revoked'
  | 'cancelled'
  | 'draft'
  | 'neutral';

const PENDING_VALUES = new Set([
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING APPROVAL',
  'UNSUBMITTED',
]);

const APPROVED_VALUES = new Set([
  'APPROVED',
  'APPROVED_BY_MANAGER',
  'Approved',
]);

const REJECTED_VALUES = new Set([
  'REJECTED',
  'REJECTED_BY_MANAGER',
  'Rejected',
]);

export function normalizeRequestStatus(status: unknown): StatusBucket {
  const raw = String(status ?? '').trim();
  if (!raw) return 'neutral';
  const upper = raw.toUpperCase().replace(/\s+/g, '_');

  if (APPROVED_VALUES.has(raw) || APPROVED_VALUES.has(upper)) return 'approved';
  if (REJECTED_VALUES.has(raw) || REJECTED_VALUES.has(upper)) return 'rejected';
  if (PENDING_VALUES.has(raw) || PENDING_VALUES.has(upper)) return 'pending';
  if (upper === 'REVOKED') return 'revoked';
  if (upper === 'CANCELLED') return 'cancelled';
  if (upper === 'DRAFT') return 'draft';
  return 'neutral';
}

export const STATUS_BADGE_CLASSES: Record<StatusBucket, string> = {
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  pending: 'bg-orange-100 text-orange-800',
  revoked: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-slate-100 text-slate-600',
  draft: 'bg-slate-100 text-slate-600',
  neutral: 'bg-slate-100 text-slate-800',
};

export function statusBadgeClasses(status: unknown): string {
  return STATUS_BADGE_CLASSES[normalizeRequestStatus(status)];
}

export function formatStatusLabel(status: unknown): string {
  const raw = String(status ?? '').trim();
  const bucket = normalizeRequestStatus(status);
  switch (bucket) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'pending':
      return raw === 'Pending Approval' ? 'Pending Approval' : 'Pending';
    case 'revoked':
      return 'Revoked';
    case 'cancelled':
      return 'Cancelled';
    case 'draft':
      return 'Draft';
    default:
      return raw || '—';
  }
}

export function isPendingStatus(status: unknown): boolean {
  return normalizeRequestStatus(status) === 'pending';
}
