'use client';

import { X } from 'lucide-react';

const SIZE_CLASS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeDisabled = false,
}) {
  if (!open) return null;

  return (
    <div
      className="ui-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'ui-modal-title' : undefined}
      onClick={closeOnBackdrop && !closeDisabled ? onClose : undefined}
    >
      <div
        className={`ui-modal-panel ${SIZE_CLASS[size] ?? SIZE_CLASS.md}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) ? (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title ? (
                <h3 id="ui-modal-title" className="text-lg font-semibold text-slate-900">
                  {title}
                </h3>
              ) : null}
              {subtitle ? (
                <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
              ) : null}
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                disabled={closeDisabled}
                className="ui-icon-button shrink-0 text-slate-500"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div>{children}</div>
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
