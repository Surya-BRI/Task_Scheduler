export function PageHeader({ title, subtitle, icon: Icon, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div>
        {title ? (
          <h1 className="ui-page-title inline-flex items-center gap-2">
            {Icon ? <Icon className="h-6 w-6 text-[var(--brand-purple-500)]" /> : null}
            {title}
          </h1>
        ) : null}
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
