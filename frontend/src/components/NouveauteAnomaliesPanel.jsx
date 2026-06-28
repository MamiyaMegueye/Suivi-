// src/components/NouveauteAnomaliesPanel.jsx
// 🆕 v5.7.4 — ColumnFilter (style Excel) sur TOUTES les colonnes
// 🆕 v5.7   — Sous-onglet "Anomalies" : croisement EGF des nouveautés non contrôlées

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Loader2, RefreshCw, FilterX } from 'lucide-react'
import { fetchNouvellesAnomaliesData } from '../lib/apiClient'
import { croiserMutationEGF } from '../lib/analyticsMutation'
import { useServerEvent } from '../lib/realtime'
import ExportButton from './ExportButton.jsx'
import ColumnFilter from './ColumnFilter.jsx'
import { exportToExcel, COLS_ANOMALIES } from '../lib/exportUtils.js'

const REGLES_DISPONIBLES = [
  'Tous',
  'Mutation non facturée',
  'Multi-mutations',
  'Conso nulle sans forfait',
  'Nv abonnement / Réabonnement — index pose > 0',
  'Nv abonnement (création) non facturé',
  'Réabonnement non facturé',
  'Résiliation avec solde impayé',
  'Résilier sur index mémoire',
  'Résiliation non clôturée',
]

const GRAVITE_STYLE = {
  Critique: 'bg-red-100 text-red-700 border border-red-300 font-semibold',
  Haute:    'bg-orange-100 text-orange-700 border border-orange-200',
  Moyenne:  'bg-yellow-100 text-yellow-700 border border-yellow-200',
  Faible:   'bg-blue-100 text-blue-700 border border-blue-200',
}

/* ── Configuration des colonnes ── */
const COLUMNS = [
  { key: 'regle',        label: 'Règle',         get: a => a.regle },
  { key: 'gravite',      label: 'Gravité',       get: a => a.gravite },
  { key: 'numDemande',   label: 'Num Demande',   get: a => a.numDemande },
  { key: 'refAbo',       label: 'Réf Abo',       get: a => a.refAbo },
  { key: 'nomClient',    label: 'Client',        get: a => a.nomClient },
  { key: 'typeMutation', label: 'Type Mutation', get: a => a.typeMutation },
  { key: 'dateDemande',  label: 'Date',          get: a => a.dateDemande, sortAs: 'date' },
  { key: 'nomCentre',    label: 'Centre',        get: a => a.nomCentre },
  { key: 'secteur',      label: 'Secteur',       get: a => a.secteur },
  { key: 'numCompteur',  label: 'Num Compteur',  get: a => a.numCompteur },
  { key: 'creePar',      label: 'Créé par',      get: a => a.creePar },
  { key: 'adresse',      label: 'Adresse',       get: a => a.adresse },
  { key: 'detail',       label: 'Détail',        get: a => a.detail },
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

export default function NouveauteAnomaliesPanel({ filterCentre, filterSecteur, periode }) {
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [anomalies, setAnomalies] = useState([])

  const [filterRegle,   setFilterRegle]   = useState('Tous')
  const [filterGravite, setFilterGravite] = useState('Tous')
  const [filters,       setFilters]       = useState({})   // 🆕 v5.7.4 — { colKey: Set<string> | null }

  /* ── Reload ── */
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { mutations, egf } = await fetchNouvellesAnomaliesData({
        centre: filterCentre || null,
        since:  periode,
        limit:  5000,
      })
      const mutFiltrees = filterSecteur
        ? mutations.filter(m => String(m.secteur).trim() === String(filterSecteur).trim())
        : mutations
      const result = croiserMutationEGF(mutFiltrees, egf)

      // Enrichir chaque anomalie avec creePar + numCompteur (mutation source)
      const byNum = new Map(mutFiltrees.map(m => [m.numDemande, m]))
      const enriched = (result.anomalies || []).map(a => {
        const src = byNum.get(a.numDemande)
        return {
          ...a,
          creePar:     a.creePar     ?? src?.creePar     ?? '',
          numCompteur: a.numCompteur ?? src?.numCompteur ?? '',
        }
      })
      setAnomalies(enriched)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setAnomalies([])
    } finally {
      setLoading(false)
    }
  }, [filterCentre, filterSecteur, periode])

  useEffect(() => { reload() }, [reload])
  useServerEvent('data_changed', () => { reload() })

  /* ── Compteurs par règle (pour la dropdown) ── */
  const countByRegle = useMemo(() => {
    const m = new Map()
    for (const a of anomalies) {
      if (!a.regle) continue
      m.set(a.regle, (m.get(a.regle) || 0) + 1)
    }
    return m
  }, [anomalies])

  /* ── Valeurs distinctes par colonne ── */
  const distinctByCol = useMemo(() => {
    const out = {}
    for (const col of COLUMNS) {
      const s = new Set()
      for (const a of anomalies) {
        const v = col.get(a)
        if (v !== null && v !== undefined && v !== '') s.add(String(v))
      }
      out[col.key] = sortValues(Array.from(s), col.sortAs)
    }
    return out
  }, [anomalies])

  /* ── Pipeline filtres ── */
  const filtered = useMemo(() => {
    return anomalies.filter(a => {
      if (filterRegle   !== 'Tous' && a.regle   !== filterRegle)   return false
      if (filterGravite !== 'Tous' && a.gravite !== filterGravite) return false
      for (const col of COLUMNS) {
        const f = filters[col.key]
        if (f && !f.has(String(col.get(a)))) return false
      }
      return true
    })
  }, [anomalies, filterRegle, filterGravite, filters])

  const filtresActifs = filterRegle !== 'Tous'
    || filterGravite !== 'Tous'
    || Object.values(filters).some(f => f !== null && f !== undefined)
  const resetFiltres = () => {
    setFilterRegle('Tous')
    setFilterGravite('Tous')
    setFilters({})
  }
  const setColFilter = (key, set) => setFilters(prev => ({ ...prev, [key]: set }))

  /* ── KPIs gravité ── */
  const counts = useMemo(() => ({
    critiques: anomalies.filter(a => a.gravite === 'Critique').length,
    hautes:    anomalies.filter(a => a.gravite === 'Haute').length,
    moyennes:  anomalies.filter(a => a.gravite === 'Moyenne').length,
  }), [anomalies])

  return (
    <div className="space-y-4">
      {/* KPIs gravité */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total anomalies</span>
          <span className="text-2xl font-bold text-indigo-600">{anomalies.length}</span>
        </div>
        <div className={`bg-white rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${counts.critiques > 0 ? 'border-red-300' : 'border-gray-200'}`}>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Critiques</span>
          <span className="text-2xl font-bold text-red-600">{counts.critiques}</span>
        </div>
        <div className={`bg-white rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${counts.hautes > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Hautes</span>
          <span className="text-2xl font-bold text-orange-600">{counts.hautes}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Moyennes</span>
          <span className="text-2xl font-bold text-yellow-600">{counts.moyennes}</span>
        </div>
      </div>

      {/* Barre filtres + export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Règle :</label>
          <select
            value={filterRegle}
            onChange={e => setFilterRegle(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white max-w-[320px]"
          >
            {REGLES_DISPONIBLES.map(r => {
              const n = r === 'Tous' ? anomalies.length : (countByRegle.get(r) || 0)
              return <option key={r} value={r}>{r} ({n})</option>
            })}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Gravité :</label>
          <select
            value={filterGravite}
            onChange={e => setFilterGravite(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {['Tous','Critique','Haute','Moyenne','Faible'].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {filtresActifs && (
          <button
            onClick={resetFiltres}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            <FilterX size={12} /> Réinitialiser tous les filtres
          </button>
        )}
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-sm text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Recharger
        </button>
        <span className="text-sm text-gray-400 ml-auto">
          {filtered.length} / {anomalies.length} anomalie(s)
        </span>
        <ExportButton
          onClick={() => exportToExcel(filtered, 'SNDE_nouveautes_anomalies', 'Anomalies', COLS_ANOMALIES)}
          label="Exporter anomalies"
          count={filtered.length}
        />
      </div>

      {/* États */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
          ❌ {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="ml-3 text-sm">Croisement EGF en cours…</span>
        </div>
      )}

      {!loading && anomalies.length === 0 && !error && (
        <div className="text-center py-12 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-emerald-700 font-medium">Aucune anomalie détectée sur les nouveautés.</p>
          <p className="text-xs text-emerald-600 mt-1">R1 → R9 : tous les contrôles sont OK sur ce périmètre.</p>
        </div>
      )}

      {!loading && anomalies.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl">
          <FilterX size={28} className="mx-auto mb-2 text-slate-300" />
          <p>Aucune anomalie ne correspond aux filtres actuels.</p>
        </div>
      )}

      {/* Tableau */}
      {!loading && filtered.length > 0 && (
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
              {filtered.map((a, i) => (
                <tr key={i} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 text-gray-700 text-xs max-w-[200px]">{a.regle || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${GRAVITE_STYLE[a.gravite] || 'bg-gray-100 text-gray-600'}`}>
                      {a.gravite || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600 text-xs">{a.numDemande || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-xs">{a.refAbo || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{a.nomClient || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[140px] truncate">{a.typeMutation || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{a.dateDemande || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[150px] truncate">{a.nomCentre || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-100 text-indigo-700">
                      {a.secteur || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600 text-xs">{a.numCompteur || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{a.creePar || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[180px] truncate">{a.adresse || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[260px]">{a.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}