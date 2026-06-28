import { Download } from 'lucide-react'

export function PageTitle({ title, subtitle }) {
  return (
    <div className="border-b border-slate-200 pb-4">
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-slate-500 mt-1 text-sm">{subtitle}</p>}
    </div>
  )
}

export function TierBadge({ tier }) {
  if (!tier) return <span className="text-slate-400">—</span>
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: tier.color }}
      title={tier.label}
    >
      {tier.tier}
    </span>
  )
}

export function ScoreBar({ score }) {
  if (score == null) return <span className="text-slate-400">—</span>
  const color = score < 50 ? '#ef4444' : score < 70 ? '#f59e0b' : score < 85 ? '#3b82f6' : '#10b981'
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="font-semibold tabular-nums" style={{ color }}>{score}</span>
    </div>
  )
}

export function ExportBtn({ onClick, label = 'Exporter' }) {
  return (
    <button onClick={onClick}
            className="flex items-center gap-2 bg-snde-700 hover:bg-snde-800 text-white text-sm px-3 py-1.5 rounded-lg transition">
      <Download size={16} /> {label}
    </button>
  )
}

export function EmptyState() {
  return (
    <div className="text-center py-20 text-slate-400">
      <p>Aucune donnée pour ce filtre.</p>
    </div>
  )
}
