import { Building2, MapPin } from 'lucide-react'

export default function FilterBar({
  meta, abonnements,
  selectedCentre, selectedSecteur,
  onChangeCentre, onChangeSecteur,
  secteursDisponibles, nbResultats,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-snde-600" />
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Centre</label>
        <select
          value={selectedCentre}
          onChange={(e) => onChangeCentre(e.target.value)}
          className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-snde-500 focus:bg-white min-w-[180px]"
        >
          <option value="TOUS">Tous les centres ({meta.nbCentres})</option>
          {meta.centres.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-snde-600" />
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Secteur</label>
        <select
          value={selectedSecteur}
          onChange={(e) => onChangeSecteur(e.target.value)}
          className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-snde-500 focus:bg-white min-w-[180px]"
        >
          <option value="TOUS">Tous les secteurs ({secteursDisponibles.length})</option>
          {secteursDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="ml-auto text-sm text-slate-500">
        <span className="font-bold text-snde-700 text-base">{nbResultats?.toLocaleString('fr-FR')}</span> abonnement(s)
        {(selectedCentre !== 'TOUS' || selectedSecteur !== 'TOUS') && (
          <button
            onClick={() => { onChangeCentre('TOUS'); onChangeSecteur('TOUS') }}
            className="ml-3 text-snde-600 hover:text-snde-800 underline text-xs"
          >
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  )
}
