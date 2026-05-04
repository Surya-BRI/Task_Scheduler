const VARIANT_CLASSES = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

export function Button({ className = "", variant = "primary", ...props }) {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${variantClass} ${className}`}
      {...props}
    />
  );
}
