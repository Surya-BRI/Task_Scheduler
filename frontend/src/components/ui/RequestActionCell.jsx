'use client';

import { isPendingStatus } from '@/lib/ui/status-badges';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function RequestActionCell({
  status,
  needsAction = false,
  onApprove,
  onReject,
  label,
  disabled = false,
}) {
  const showActions = needsAction && isPendingStatus(status);

  if (showActions) {
    return (
      <div className="flex flex-col items-center gap-2">
        <StatusBadge status={status} label={label} size="md" />
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={disabled}
            className="ui-btn-approve"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            className="ui-btn-reject"
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  return <StatusBadge status={status} label={label} size="md" />;
}
