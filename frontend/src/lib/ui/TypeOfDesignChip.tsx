'use client';

import {
  formatProjectDisciplineLabel,
  formatRetailDesignTypeLabel,
  resolveTypeOrDisciplinePillClass,
} from '@/lib/ui/design-type-colors';

type TypeOfDesignChipProps = {
  value?: string | null;
  className?: string;
};

/**
 * Soft pastel pill for Retail design subtypes / Project disciplines —
 * same visual language as Design List status badges.
 */
export function TypeOfDesignChip({ value, className = '' }: TypeOfDesignChipProps) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') {
    return <span className={`text-slate-400 ${className}`}>—</span>;
  }
  const pill = resolveTypeOrDisciplinePillClass(raw);
  const label =
    formatRetailDesignTypeLabel(raw) || formatProjectDisciplineLabel(raw) || raw;
  if (!pill) {
    return (
      <span className={`whitespace-nowrap text-slate-700 ${className}`} title={label}>
        {label}
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap ${pill} ${className}`}
      title={label}
    >
      {label}
    </span>
  );
}
