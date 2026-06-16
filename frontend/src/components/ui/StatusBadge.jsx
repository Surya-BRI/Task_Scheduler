'use client';

import { formatStatusLabel, statusBadgeClasses } from '@/lib/ui/status-badges';

export function StatusBadge({
  status,
  label,
  className = '',
  size = 'md',
}) {
  const text = label ?? formatStatusLabel(status);
  const sizeClass =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide'
      : 'px-3 py-1.5 text-xs font-semibold tracking-wide shadow-sm min-w-[7rem] text-center';

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} ${statusBadgeClasses(status)} ${className}`}
    >
      {text}
    </span>
  );
}
