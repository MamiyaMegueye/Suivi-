// src/components/NouveauteGCPanel.jsx
// 🆕 v5.7.4 — ColumnFilter (style Excel) sur TOUTES les colonnes
// 🆕 v5.7   — Sous-onglet "Gros Consommateurs" (secteurs 04 / 08) dans Nouveautés

import { useMemo, useState } from 'react'
import ExportButton from './ExportButton.jsx'
import ColumnFilter from './ColumnFilter.jsx'
import {
  estGrosConsommateur,
  normaliseSecteurGC,
  statutDemande,
  exportToExcel,
  COLS_GC,
} from '../lib/exportUtils.js'

/* ── Configuration des colonnes filtrables ── */
const COLUMNS = [
  { key: 'numDemande',   label: 'Num Demande',  get: r => r.numDemande },
  { key: 'refAbo',       label: 'Réf Abo',      get: r => r.refAbo },
  { key: 'client',       label: 'Client',       get: r => r.client },
  { key: 'typeDemande',  label: 'Type Demande', get: r => r.typeDemande },
  { key: 'statut',       label: 'Statut',       get: r => statutDemande(r) },
  { key: 'dateStr',      label: 'Date',         get: r => r.dateStr, sortAs: 'date' },
  { key: 'nomCentre',    label: 'Centre',       get: r => r.nomCentre },
  { key: 'secteur',      label: 'Secteur',      get: r => normaliseSecteurGC(r.secteur) },
  { key: 'numCompteur',  label: 'Num Compteur', get: r => r.numCompteur },
  { key: 'creePar',      label: 'Créé par',     get: r => r.creePar },
  { key: 'adresse',      label: 'Adresse',      get: r => r.adresse },
]

const sortValues = (arr, sortAs) => {
  if (sortAs === 'date') {
    return arr.sort((a, b) => {
      const [da, ma, ya] = String(a).split('/').map(Number)
      const [db, mb, yb] = String(b).split('/').map(Number)
      return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da)
    })
  }
  return arr.sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }))
}

export default function NouveauteGCPanel({ items }) {
  const [filterStatut, setFilterStatut] = useState('Tous')
  const [filters, setFilters]           = useState({})

  const detailsGC = useMemo(
    () => items.filter(r => estGrosConsommateur(r.secteur)),
    [items],
  )

  const validesGC = detailsGC.filter(r => r.valide === 'OUI' && r.annule !== 'OUI').length
  const attenteGC = detailsGC.filter(r => r.valide !== 'OUI' && r.annule !== 'OUI').length
  const annulesGC = detailsGC.filter(r => r.annule === 'OUI').length

  /* Valeurs distinctes par colonne */
  const distinctByCol = useMemo(() => {
    const out = {}
    for (const col of COLUMNS) {
      const s = new Set()
      for (const r of detailsGC) {
        const v = col.get(r)
        if (v !== null && v !== undefined && v !== '') s.add(String(v))
      }
      out[col.key] = sortValues(Array.from(s), col.sortAs)
    }
    return out
  }, [detailsGC])

  /* Pipeline filtres : statut select + filtres colonne */
  const detailsGCFiltres = useMemo(() => {
    return detailsGC.filter(r => {
      if (filterStatut !== 'Tous' && statutDemande(r) !== filterStatut) return false
      for (const col of COLUMNS) {
        const f = filters[col.key]
        if (f && !f.has(String(col.get(r)))) return false
      }
      return true
    })
  }, [detailsGC, filterStatut, filters])

  const filtresActifs = filterStatut !== 'Tous'
    || Object.values(filters).some(f => f !== null && f !== undefined)
  const resetFiltres = () => { setFilterStatut('Tous'); setFilters({}) }
  const setColFilter = (key, set) => setFilters(prev => ({ ...prev, [key]: set }))

  const rowsForExport = detailsGCFiltres.map(r => ({
    ...r,
    statut:  statutDemande(r),
    secteur: normaliseSecteurGC(r.secteur),
  }))

  return (
    <div className="space-y-4">
      {/* KPIs GC */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total GC</span>
          <span className="text-2xl font-bold text-indigo-600">{detailsGC.length}</span>
          <span className="text-xs text-gray-400">secteurs 04 / 08</span>
        </div>
        <div className={`bg-white rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${validesGC > 0 ? 'border-red-300' : 'border-gray-200'}`}>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Validées sans contrôle</span>
          <span className="text-2xl font-bold text-red-600">{validesGC}</span>
          <span className="text-xs text-gray-400">{validesGC > 0 ? 'À vérifier' : 'OK'}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">En attente</span>
          <span className="text-2xl font-bold text-yellow-500">{attenteGC}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Annulées</span>
          <span className="text-2xl font-bold text-gray-500">{annulesGC}</span>
        </div>
      </div>

      {/* Barre filtre statut + export */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filtrer</span>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Statut :</label>
          <select
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {['Tous', 'Validé', 'En attente', 'Annulé'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {filtresActifs && (
          <button onClick={resetFiltres} className="text-xs text-indigo-600 hover:underline">
            Réinitialiser tous les filtres
          </button>
        )}
        <span className="text-sm text-gray-400 ml-auto">
          {detailsGCFiltres.length} / {detailsGC.length} demande(s)
        </span>
        <ExportButton
          onClick={() => exportToExcel(rowsForExport, 'SNDE_nouveautes_GC', 'GC', COLS_GC)}
          label="Exporter GC"
          count={detailsGCFiltres.length}
        />
      </div>

      {/* Tableau */}
      {detailsGCFiltres.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400">
          {detailsGC.length === 0
            ? 'Aucune nouveauté en secteur 04 ou 08.'
            : 'Aucune demande ne correspond aux filtres actuels.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-3 py-3 text-left font-medium whitespace-nowrap">
                    {col.label}
                    <ColumnFilter
                      values={distinctByCol[col.key] || []}
                      selected={filters[col.key] ?? null}
                      onChange={s => setColFilter(col.key, s)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detailsGCFiltres.map((r, i) => {
                const statut = statutDemande(r)
                const statutColor =
                  r.annule === 'OUI'
                    ? 'bg-gray-100 text-gray-600'
                    : r.valide === 'OUI'
                      ? 'bg-red-100 text-red-700 font-semibold'
                      : 'bg-yellow-100 text-yellow-700'
                return (
                  <tr key={i} className="hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 font-mono text-gray-600 text-xs">{r.numDemande}</td>
                    <td className="px-3 py-2 font-mono text-gray-500 text-xs">{r.refAbo || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{r.client}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                      {r.typeDemande}
                      {r.typeMutation && <span className="text-gray-400 ml-1">({r.typeMutation})</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${statutColor}`}>
                        {statut} {r.valide === 'OUI' && r.annule !== 'OUI' && '🚨'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">{r.dateStr}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[160px] truncate">{r.nomCentre}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-100 text-indigo-700">
                        {normaliseSecteurGC(r.secteur)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600 text-xs">{r.numCompteur || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{r.creePar || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[200px] truncate">{r.adresse || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}