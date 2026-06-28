// src/components/NouveautesPanel.jsx
// 🆕 v5.7 — Ajout de sous-onglets :
//            ├── 📋 Toutes        (vue actuelle = cartes)
//            ├── 🚨 Gros Conso    (tableau secteurs 04 / 08)
//            └── ⚠️ Anomalies    (croisement EGF R1→R9)
//          Les filtres Centre/Secteur/Type/Statut sont SHARED entre les 3 sous-onglets.
//
// 🆕 v5.6 — Affiche par défaut les demandes du JOUR (since=today)
//          Toggle "Aujourd'hui seulement / Tout l'historique"
//          Fix du dropdown secteurs (utilise les nouveaux champs SECTEUR/LIBELLE)
// 🆕 v5.3 — Filtres CENTRE + SECTEUR (cascading)
// 🆕 v5.2 — Onglet "Nouveautés" initial

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Sparkles, Loader2, RefreshCw, FilterX, Calendar, Eye,
  LayoutGrid, AlertTriangle, Flame,
} from 'lucide-react'
import {
  fetchNouvelles, countNouvelles, marquerControle, fetchCentres, fetchSecteurs,
} from '../lib/apiClient'
import { useServerEvent, pushToast } from '../lib/realtime'
import NouveauteCard from './NouveauteCard.jsx'
import NouveauteAuditModal from './NouveauteAuditModal.jsx'
import NouveauteGCPanel from './NouveauteGCPanel.jsx'                 // 🆕 v5.7
import NouveauteAnomaliesPanel from './NouveauteAnomaliesPanel.jsx'   // 🆕 v5.7

const TYPES   = ['Tous', 'Mutation', 'Nouveau Branchement', 'Réabonnement', 'Résiliation']
const STATUTS = ['Tous', 'Validé', 'En attente', 'Annulé']

// 🆕 v5.7.8 — Baseline = 1er jour du mois courant (au lieu d'une date fixe).
// Avantage : se met à jour tout seul chaque mois (en juillet → "01/07/2026",
// en août → "01/08/2026", etc.) sans toucher au code.
const _NOW = new Date()
const _BASELINE_DATE = new Date(_NOW.getFullYear(), _NOW.getMonth(), 1)
const HISTORIQUE_DEPUIS       = `${_BASELINE_DATE.getFullYear()}-${String(_BASELINE_DATE.getMonth() + 1).padStart(2, '0')}-01`
const HISTORIQUE_DEPUIS_LABEL = _BASELINE_DATE.toLocaleDateString('fr-FR')

const SECTEURS_GROS_CONSO = new Set(['04', '4', '08', '8'])

const labelSecteur = (s) => {
  const code = String(s.SECTEUR || '').trim()
  if (SECTEURS_GROS_CONSO.has(code)) return code
  return s.LIBELLE && String(s.LIBELLE).trim() ? s.LIBELLE : code
}

const statutDe = (r) =>
  r.annule === 'OUI' ? 'Annulé' :
  r.valide === 'OUI' ? 'Validé' :
  'En attente'

/* ── Mini-nav sous-onglets ── */
function SubTabNav({ value, onChange, counts }) {
  const tabs = [
    { id: 'toutes',    label: 'Toutes',             icon: LayoutGrid,     count: counts.toutes },
    { id: 'gc',        label: 'Gros Conso',         icon: Flame,          count: counts.gc },
    { id: 'anomalies', label: 'Anomalies (R1→R9)',  icon: AlertTriangle,  count: null },
  ]
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
      {tabs.map((t) => {
        const Icon = t.icon
        const active = value === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} />
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function NouveautesPanel({ alertTrigger = 0 }) {
  /* ── Données ── */
  const [items, setItems]         = useState([])
  const [totalCount, setTotalCount] = useState(null)   // 🆕 v5.7.6 — vrai total (non tronqué)
  const [loading, setLoading]     = useState(false)
  const [error, setError]     = useState(null)
  const [busyNum, setBusyNum] = useState(null)
  const [openNum, setOpenNum] = useState(null)

  /* ── Référentiels ── */
  const [centres,     setCentres]     = useState([])
  const [secteurs,    setSecteurs]    = useState([])
  const [loadingSec,  setLoadingSec]  = useState(false)

  /* ── Filtres ── */
  const [periode,       setPeriode]       = useState('today')   // 🆕 v5.7.7 — 'today' | 'history' (depuis baseline)
  const [filterCentre,  setFilterCentre]  = useState('')
  const [filterSecteur, setFilterSecteur] = useState('')
  const [filterType,    setFilterType]    = useState('Tous')
  const [filterStatut,  setFilterStatut]  = useState('Tous')

  /* 🆕 v5.7 — Sous-onglet actif */
  const [subTab, setSubTab] = useState('toutes')

  /* 🆕 v5.7 — Réagit au clic sur le bandeau d'alerte temps réel :
     bascule sur "aujourd'hui" + statut "Validé" + reset des autres filtres. */
  useEffect(() => {
    if (alertTrigger > 0) {
      setPeriode('today')
      setFilterStatut('Validé')
      setFilterCentre('')
      setFilterSecteur('')
      setFilterType('Tous')
      setSubTab('toutes')
    }
  }, [alertTrigger])

  /* ── 1. Charger la liste des centres au montage ── */
  useEffect(() => {
    fetchCentres()
      .then((data) => setCentres(data))
      .catch((e) => console.warn('Centres indisponibles', e))
  }, [])

  /* ── 2. Secteurs cascading : recharge quand le centre change ── */
  useEffect(() => {
    if (!filterCentre) { setSecteurs([]); setFilterSecteur(''); return }
    setLoadingSec(true)
    fetchSecteurs(Number(filterCentre))
      .then((data) => {
        const seen = new Set()
        const uniq = (data || []).filter((s) => {
          const code = String(s.SECTEUR || '').trim()
          if (!code || seen.has(code)) return false
          seen.add(code)
          return true
        })
        setSecteurs(uniq)
        setFilterSecteur('')
      })
      .catch((e) => { console.warn('Secteurs indisponibles', e); setSecteurs([]) })
      .finally(() => setLoadingSec(false))
  }, [filterCentre])

  /* ── 3. Charger les nouveautés + le compteur réel ── */
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    // 🆕 v5.7.7 — 'today' → API since=today ; 'history' → since=baseline
    const sinceParam = periode === 'history' ? HISTORIQUE_DEPUIS : 'today'
    try {
      const [data, total] = await Promise.all([
        fetchNouvelles({
          centre: filterCentre || null,
          since:  sinceParam,
          limit:  10000,
        }),
        countNouvelles({
          centre: filterCentre || null,
          since:  sinceParam,
        }).catch(() => null),
      ])
      setItems(data)
      setTotalCount(total)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }, [filterCentre, periode])

  useEffect(() => { reload() }, [reload])

  /* ── 4. Auto-refresh SSE ── */
  useServerEvent('data_changed', (payload) => {
    reload()
    if (payload?.new_delta && payload.new_delta > 0) {
      pushToast({
        kind: 'info',
        title: `${payload.new_delta} nouvelle${payload.new_delta > 1 ? 's' : ''} demande${payload.new_delta > 1 ? 's' : ''}`,
        message: `${payload.new_count} en attente au total`,
        ttl: 4000,
      })
    }
  })

  /* ── 5. Marquer contrôlée ── */
  const handleControler = async (numDemande) => {
    setBusyNum(numDemande)
    const snapshot = items
    setItems((cur) => cur.filter((m) => m.numDemande !== numDemande))
    try {
      await marquerControle(numDemande)
    } catch (e) {
      setItems(snapshot)
      pushToast({ kind: 'alert', title: 'Échec', message: e.message, sticky: true })
    } finally {
      setBusyNum(null)
    }
  }

  /* ── 6. Filtres frontend ── */
  const filtered = useMemo(() => items.filter((m) =>
    (filterSecteur === '' || String(m.secteur).trim() === String(filterSecteur).trim()) &&
    (filterType    === 'Tous' || m.typeDemande === filterType) &&
    (filterStatut  === 'Tous' || statutDe(m)   === filterStatut)
  ), [items, filterSecteur, filterType, filterStatut])

  /* ── 7. Groupement par centre (pour vue "Toutes") ── */
  const groupes = useMemo(() => {
    const g = {}
    filtered.forEach((m) => {
      const key = m.nomCentre || '— Centre inconnu —'
      if (!g[key]) g[key] = []
      g[key].push(m)
    })
    return g
  }, [filtered])
  const centresKeys = Object.keys(groupes).sort()

  /* ── 8. Compteurs pour les badges sous-onglets ── */
  const gcCount = useMemo(
    () => filtered.filter(r => SECTEURS_GROS_CONSO.has(String(r.secteur).trim())).length,
    [filtered],
  )

  /* ── 9. Filtres actifs ── */
  const filtresActifs = (
    filterCentre  !== '' ||
    filterSecteur !== '' ||
    filterType    !== 'Tous' ||
    filterStatut  !== 'Tous'
  )

  const resetFiltres = () => {
    setFilterCentre('')
    setFilterSecteur('')
    setFilterType('Tous')
    setFilterStatut('Tous')
  }

  const secteurAffiche = (() => {
    if (!filterSecteur) return ''
    const o = secteurs.find((x) => String(x.SECTEUR) === String(filterSecteur))
    return o ? labelSecteur(o) : filterSecteur
  })()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Nouveautés à auditer</h2>
            <p className="text-xs text-slate-500">
              {totalCount != null && totalCount !== items.length
                ? <>{items.length} <span className="text-amber-600">/ {totalCount}</span> demande{totalCount > 1 ? 's' : ''} <span className="text-amber-600 text-[10px]">(limite affichage atteinte)</span></>
                : <>{totalCount ?? items.length} demande{(totalCount ?? items.length) > 1 ? 's' : ''}</>}
              {' · '}
              {periode === 'today'
                ? <span className="font-medium text-indigo-600">aujourd'hui</span>
                : <span className="font-medium text-slate-700">depuis le {HISTORIQUE_DEPUIS_LABEL}</span>}
              {filterCentre && centres.length > 0 && (
                <> · centre <strong>{centres.find(c => String(c.CODE) === filterCentre)?.NOM || filterCentre}</strong></>
              )}
              {filterSecteur && <> · secteur <strong>{secteurAffiche}</strong></>}
              {' · auto-rafraîchi à chaque sync'}
            </p>
          </div>
        </div>

        {/* Toggle Aujourd'hui / Depuis 24/06 + Recharger */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setPeriode('today')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                periode === 'today' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Calendar size={12} />
              Aujourd'hui
            </button>
            <button
              onClick={() => setPeriode('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                periode === 'history' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Eye size={12} />
              Depuis le {HISTORIQUE_DEPUIS_LABEL}
            </button>
          </div>

          <button
            onClick={reload}
            disabled={loading}
            className="flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-sm text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Recharger
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="text-xs text-slate-500 uppercase font-medium tracking-wide flex items-center gap-2">
          🎛️ Filtres
          {filtresActifs && (
            <button
              onClick={resetFiltres}
              className="ml-auto text-xs text-indigo-600 hover:underline flex items-center gap-1 normal-case tracking-normal"
            >
              <FilterX size={12} /> Tout réinitialiser
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Centre */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Centre</label>
            <select
              value={filterCentre}
              onChange={(e) => setFilterCentre(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Tous les centres ({centres.length}) —</option>
              {centres.map((c) => (
                <option key={c.CODE} value={c.CODE}>{c.NOM} ({c.CODE})</option>
              ))}
            </select>
          </div>

          {/* Secteur */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Secteur {loadingSec && <span className="text-slate-400">(chargement…)</span>}
            </label>
            <select
              value={filterSecteur}
              onChange={(e) => setFilterSecteur(e.target.value)}
              disabled={!filterCentre || loadingSec || secteurs.length === 0}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">
                {filterCentre ? `— Tous les secteurs (${secteurs.length}) —` : '— Choisir un centre —'}
              </option>
              {secteurs.map((s, i) => (
                <option key={`${s.SECTEUR}-${i}`} value={s.SECTEUR}>
                  {labelSecteur(s)}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type de demande</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Statut</label>
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUTS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200">
          <span>
            {filtered.length === items.length
              ? `${items.length} demande(s) affichée(s)`
              : `${filtered.length} / ${items.length} demande(s) après filtres`}
          </span>
          {filtresActifs && <span className="text-indigo-600">● Filtres actifs</span>}
        </div>
      </div>

      {/* 🆕 v5.7 — Sous-onglets */}
      <SubTabNav
        value={subTab}
        onChange={setSubTab}
        counts={{ toutes: filtered.length, gc: gcCount }}
      />

      {/* Erreur globale (affichée sur tous les sous-onglets) */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
          ❌ {error}
        </div>
      )}

      {/* ─────────────── Sous-onglet TOUTES ─────────────── */}
      {subTab === 'toutes' && (
        <>
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
              <span className="ml-3 text-sm">Chargement des nouveautés…</span>
            </div>
          )}

          {!loading && items.length === 0 && !error && (
            <div className="text-center py-16 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-emerald-700 font-medium">
                {periode === 'today'
                  ? "Aucune nouvelle demande aujourd'hui."
                  : `Aucune demande à contrôler depuis le ${HISTORIQUE_DEPUIS_LABEL}.`}
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                {periode === 'today'
                  ? "Toutes les demandes de la journée ont été contrôlées."
                  : "Tout est à jour sur ce périmètre."}
              </p>
              {periode === 'today' && (
                <button
                  onClick={() => setPeriode('history')}
                  className="mt-3 text-xs text-indigo-600 hover:underline"
                >
                  Voir l'historique depuis le {HISTORIQUE_DEPUIS_LABEL} →
                </button>
              )}
            </div>
          )}

          {!loading && items.length > 0 && filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl">
              <FilterX size={32} className="mx-auto mb-2 text-slate-300" />
              <p>Aucune demande ne correspond aux filtres actuels.</p>
              <button
                onClick={resetFiltres}
                className="mt-2 text-xs text-indigo-600 hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}

          {/* Groupes de cartes */}
          {centresKeys.map((centre) => (
            <div key={centre} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-slate-700">{centre}</h3>
                <span className="text-xs text-slate-400">({groupes[centre].length})</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupes[centre].map((m) => (
                  <NouveauteCard
                    key={m.numDemande}
                    mutation={m}
                    onOpen={() => setOpenNum(m.numDemande)}
                    onControler={() => handleControler(m.numDemande)}
                    busy={busyNum === m.numDemande}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ─────────────── Sous-onglet GC ─────────────── */}
      {subTab === 'gc' && (
        loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
            <span className="ml-3 text-sm">Chargement…</span>
          </div>
        ) : (
          <NouveauteGCPanel items={filtered} />
        )
      )}

      {/* ─────────────── Sous-onglet ANOMALIES ─────────────── */}
      {subTab === 'anomalies' && (
        <NouveauteAnomaliesPanel
          filterCentre={filterCentre}
          filterSecteur={filterSecteur}
          periode={periode === 'history' ? HISTORIQUE_DEPUIS : 'today'}
        />
      )}

      {/* Modal croisement (partagée — toujours montée si openNum) */}
      {openNum && (
        <NouveauteAuditModal
          numDemande={openNum}
          onClose={() => setOpenNum(null)}
          onControlee={(num) => setItems((cur) => cur.filter((m) => m.numDemande !== num))}
        />
      )}
    </div>
  )
}