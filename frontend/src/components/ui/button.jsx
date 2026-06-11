'use client';

const VARIANT_CLASSES = {
  primary: 'ui-btn-primary',
  brand: 'ui-btn-brand',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm font-medium',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 rounded-lg px-3 py-2 text-sm font-medium',
  approve: 'ui-btn-approve',
  'approve-solid': 'ui-btn-approve-solid',
  reject: 'ui-btn-reject',
  'reject-outline': 'ui-btn-reject-outline',
  cancel: 'ui-btn-cancel',
  danger: 'ui-btn-danger-solid',
};

export function Button({ className = '', variant = 'primary', ...props }) {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  const base =
    variant === 'primary' || variant === 'brand' || variant === 'danger' || variant.startsWith('approve') || variant.startsWith('reject') || variant === 'cancel'
      ? ''
      : 'inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <button
      className={`${variantClass} ${base} ${className}`.trim()}
      {...props}
    />
  );
}
