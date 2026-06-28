export default function KpiCard({ label, value, sub, icon: Icon, tone = 'default' }) {
  const tones = {
    default: 'border-slate-200 bg-white text-slate-900',
    good:    'border-emerald-200 bg-emerald-50 text-emerald-900',
    warn:    'border-amber-200 bg-amber-50 text-amber-900',
    danger:  'border-red-200 bg-red-50 text-red-900',
    info:    'border-snde-200 bg-snde-50 text-snde-900',
  }
  const iconTones = {
    default: 'bg-slate-100 text-slate-600',
    good:    'bg-emerald-100 text-emerald-700',
    warn:    'bg-amber-100 text-amber-700',
    danger:  'bg-red-100 text-red-700',
    info:    'bg-snde-100 text-snde-700',
  }
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-4 ${tones[tone]}`}>
      {Icon && (
        <div className={`p-2.5 rounded-lg ${iconTones[tone]}`}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide font-medium opacity-70">{label}</p>
        <p className="text-2xl font-bold mt-1 truncate">{value}</p>
        {sub && <p className="text-xs mt-1 opacity-80">{sub}</p>}
      </div>
    </div>
  )
}
