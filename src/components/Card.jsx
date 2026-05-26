export function Card({ title, subtitle, children, action, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export function SectionTitle({ children, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-2">
      {Icon && <Icon size={20} className="text-snde-700" />}
      <h2 className="text-lg font-bold text-slate-800">{children}</h2>
    </div>
  )
}
