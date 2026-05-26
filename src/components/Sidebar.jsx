import { Droplets, RotateCcw } from 'lucide-react'

/**
 * Barre latérale de navigation.
 * @param {Array} pages   [{ id, label, icon, badge }]
 * @param {string} active id de la page active
 * @param {Function} onNavigate
 * @param {Function} onReset
 * @param {object} meta
 */
export default function Sidebar({ pages, active, onNavigate, onReset, meta, dataLoaded }) {
  return (
    <aside className="w-64 flex-shrink-0 bg-snde-950 text-slate-200 flex flex-col min-h-screen sticky top-0 h-screen">
      {/* Logo / titre générique */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-400 to-snde-500 p-2 rounded-xl shadow-lg shadow-cyan-500/20">
            <Droplets size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white tracking-tight leading-tight">
              SNDE Analytics
            </h1>
            <p className="text-[11px] text-cyan-300/80">Contrôle &amp; Audit</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Carte de relève
        </p>
        {pages.map((p) => {
          const Icon = p.icon
          const isActive = active === p.id
          const disabled = !dataLoaded && p.id !== 'import'
          return (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => onNavigate(p.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 group relative
                ${isActive
                  ? 'bg-gradient-to-r from-snde-600 to-snde-500 text-white shadow-md shadow-snde-900/40'
                  : disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'}
              `}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-300 rounded-r" />
              )}
              <Icon size={18} className={isActive ? 'text-cyan-200' : ''} />
              <span className="flex-1 text-left">{p.label}</span>
              {p.badge != null && p.badge > 0 && (
                <span className={`
                  text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${isActive ? 'bg-white/20 text-white' : 'bg-red-500/90 text-white'}
                `}>
                  {p.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Pied : info fichier + reset */}
      <div className="px-3 py-4 border-t border-white/10 space-y-3">
        {meta && (
          <div className="px-3 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Centres</span><span className="text-cyan-300 font-semibold">{meta.nbCentres}</span>
            </div>
            <div className="flex justify-between">
              <span>Secteurs</span><span className="text-cyan-300 font-semibold">{meta.nbSections}</span>
            </div>
            <div className="flex justify-between">
              <span>Abonnés</span><span className="text-cyan-300 font-semibold">{meta.totalAbonnements?.toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span>Période</span><span className="text-cyan-300 font-semibold">{meta.periode || '—'}</span>
            </div>
          </div>
        )}
        {onReset && (
          <button
            onClick={onReset}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-2 rounded-lg text-xs font-medium transition border border-white/10"
          >
            <RotateCcw size={14} />
            Nouveau fichier
          </button>
        )}
        <p className="px-3 text-[10px] text-slate-600 leading-snug">
          Traitement 100 % local — aucune donnée envoyée.
        </p>
      </div>
    </aside>
  )
}
