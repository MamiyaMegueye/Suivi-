// src/components/ExportButton.jsx
// 🆕 v5.7 — Bouton d'export Excel réutilisable
import { Download } from 'lucide-react'

export default function ExportButton({
  onClick,
  label = 'Exporter Excel',
  count = 0,
  disabled = false,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || count === 0}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm transition-colors"
      title={count === 0 ? 'Aucune donnée à exporter' : `Exporter ${count} ligne(s)`}
    >
      <Download size={14} />
      {label}
      {count > 0 && (
        <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
          {count}
        </span>
      )}
    </button>
  )
}