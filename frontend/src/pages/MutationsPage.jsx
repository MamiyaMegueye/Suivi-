import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { croiserMutationEGF } from '../lib/analyticsMutation'
import { useRealtimeMutations } from '../lib/useRealtimeMutations'   // 🆕 v5.0
import OracleLoader from '../components/OracleLoader'
import HomeHero    from '../components/HomeHero'      // 🆕 v7 — vue d'accueil enrichie
/* ── Helpers ─────────────────────────────────────────────────────────── */
const pct = (n, total) => total ? ((n / total) * 100).toFixed(1) : '0.0'
const fmtMRU = (n) => Number.isFinite(Number(n))
  ? Number(n).toLocaleString('fr-FR') + ' MRU'
  : '—'

const GRAVITE_STYLE = {
  Critique : 'bg-red-100 text-red-700 border border-red-300 font-semibold',
  Haute    : 'bg-orange-100 text-orange-700 border border-orange-200',
  Moyenne  : 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  Faible   : 'bg-blue-100 text-blue-700 border border-blue-200',
}

/* ── Liste statique de toutes les règles (apparaissent dans la dropdown
   même si aucune anomalie ne les déclenche actuellement) ─────────────── */
const TOUTES_LES_REGLES = [
  'Mutation non facturée',
  'Multi-mutations',
  'Conso nulle sans forfait',
  'Nv abonnement / Réabonnement — index pose > 0',
  'Nv abonnement (création) non facturé',
  'Réabonnement non facturé',
  'Résiliation avec solde impayé',
  'Résilier sur index mémoire',                    // 🆕 v7 — R8
  'Résiliation non clôturée',                          // 🆕 v5 — R9
]

/* ── Règles applicables par type de demande (pour drill-down) ────────── */
const REGLES_PAR_TYPE = {
  'Nouveau Branchement': [
    'Nv abonnement / Réabonnement — index pose > 0',
    'Nv abonnement (création) non facturé',
  ],
  'Réabonnement': [
    'Nv abonnement / Réabonnement — index pose > 0',
    'Réabonnement non facturé',
  ],
  'Résiliation': [
    'Résiliation avec solde impayé',
    'Résilier sur index mémoire',                  // 🆕 v7 — R8
    'Résiliation non clôturée',                        // 🆕 v5 — R9
  ],
}
// Mutation Compteur (sous-type "Compteur" de Mutation) → règles R1, R2, R3
const REGLES_MUTATION_COMPTEUR = [
  'Mutation non facturée',
  'Multi-mutations',
  'Conso nulle sans forfait',
]

/* ── Gros consommateur : les secteurs « 04 » et « 08 » sont réservés aux
   gros consommateurs. Le CRM peut stocker la valeur sous 4 formes :
   '04', '4', '08', '8'. On normalise et on accepte les 4. ──────────── */
const SECTEURS_GROS_CONSO = new Set(['04', '4', '08', '8'])

const estGrosConsommateur = (secteur) => {
  if (!secteur) return false
  return SECTEURS_GROS_CONSO.has(String(secteur).trim())
}

const normaliseSecteurGC = (secteur) => {
  const s = String(secteur || '').trim()
  if (s === '4' || s === '04') return '04'
  if (s === '8' || s === '08') return '08'
  return s
}

function KpiCard({ label, value, sub, color = 'text-indigo-600', warn = false }) {
  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${warn ? 'border-red-300' : 'border-gray-200'}`}>
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function PctBar({ label, n, total, color = 'bg-indigo-500' }) {
  const p = pct(n, total)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className="font-semibold text-gray-700">{n} <span className="text-gray-400">({p}%)</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

/* ── Composant zone import fichier ───────────────────────────────────── */
function DropZone({ label, hint, onFile, loaded, fileName }) {
  const ref = useRef()
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all
        ${loaded
          ? 'border-green-400 bg-green-50'
          : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}
    >
      <span className="text-3xl">{loaded ? '✅' : '📂'}</span>
      <p className="text-sm font-medium text-gray-700 text-center">{label}</p>
      {loaded
        ? <span className="text-xs text-green-600 font-medium truncate max-w-full">{fileName}</span>
        : <span className="text-xs text-gray-400">{hint}</span>}
      <input ref={ref} type="file" accept=".xls,.xlsx" className="hidden"
        onChange={e => onFile(e.target.files[0])} />
    </div>
  )
}

/* ── Statut unifié d'une demande (pour les exports) ──────────────────── */
const statutDemande = (r) => {
  if (r.annule === 'OUI') return 'Annulé'
  if (r.valide === 'OUI') return 'Validé'
  return 'En attente'
}

/* ── Export Excel générique ──────────────────────────────────────────── */
function exportToExcel(rows, baseFilename, sheetName = 'Données', columnMap = null) {
  if (!rows || rows.length === 0) {
    alert('Aucune donnée à exporter')
    return
  }
  const formatted = columnMap
    ? rows.map(r => {
        const out = {}
        for (const [key, label] of Object.entries(columnMap)) {
          out[label] = r[key] ?? ''
        }
        return out
      })
    : rows
  const ws = XLSX.utils.json_to_sheet(formatted)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30))
  const ts = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${baseFilename}_${ts}.xlsx`)
}

/* ── Export complet anomalies (multi-onglets) ────────────────────────── */
function exportAnomaliesMultiOnglets(anomalies, stats, centre) {
  if (!anomalies || anomalies.length === 0) {
    alert('Aucune anomalie à exporter')
    return
  }
  const wb = XLSX.utils.book_new()

  // Onglet Synthèse
  const synth = [
    ['Centre',                       centre || '—'],
    ['Date export',                  new Date().toLocaleString('fr-FR')],
    ['Total anomalies',              anomalies.length],
    [''],
    ['═══ Mutations Compteur ═══'],
    ['Mutations analysées',          stats.totalMutations],
    ['Sans facture',                 stats.totalSansFacture],
    ['Multi-mutations',              stats.totalDoublons],
    ['Conso nulle sans forfait',     stats.totalSansForfait],
    [''],
    ['═══ Nv abonnement / Réabonnement ═══'],
    ['Demandes auditées',            stats.nbBranchReabAuditees],
    ['Index de pose > 0',            stats.totalCompteurRecycle],
    ['Frais non facturés',           stats.totalFraisNonFactures],
    [''],
    ['═══ Audit compteur global ═══'],
    ['Compteurs sur plusieurs abos', stats.totalCompteurPartage],
    [''],
    ['═══ Totaux par gravité ═══'],
    ['Critiques',                    stats.critiques],
    ['Hautes',                       stats.hautes],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synth), 'Synthèse')

  // Onglet : Toutes anomalies
  const all = anomalies.map(a => ({
    'Gravité'      : a.gravite,
    'Règle'        : a.regle,
    'Réf Abonné'   : a.refAbo,
    'N° Demande'   : a.numDemande || '',
    'Client'       : a.nomClient || '',
    'Centre'       : a.nomCentre || '',
    'Type Demande' : a.typeDemande || a.typeMutation || '',
    'Date Demande' : a.dateDemande || '',
    'Compteur'     : a.compteur || '',
    'Index Début'  : a.indexDebut || '',
    'N° Facture'   : a.numFacture || '',
    'Détail'       : a.detail,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), 'Toutes anomalies')

  // 1 onglet par règle
  const reglesUniques = [...new Set(anomalies.map(a => a.regle))]
  for (const regle of reglesUniques) {
    const lignes = anomalies
      .filter(a => a.regle === regle)
      .map(a => ({
        'Gravité'      : a.gravite,
        'Réf Abonné'   : a.refAbo,
        'N° Demande'   : a.numDemande || '',
        'Client'       : a.nomClient || '',
        'Centre'       : a.nomCentre || '',
        'Date Demande' : a.dateDemande || '',
        'Compteur'     : a.compteur || '',
        'Index Début'  : a.indexDebut || '',
        'Détail'       : a.detail,
      }))
    const name = regle.length > 30 ? regle.slice(0, 30) : regle
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), name)
  }

  const date = new Date().toISOString().slice(0, 10)
  const safe = (centre || 'export').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
  XLSX.writeFile(wb, `SNDE_anomalies_${safe}_${date}.xlsx`)
}

/* ── Bouton Export Excel réutilisable ────────────────────────────────── */
function ExportButton({ onClick, label = 'Exporter Excel', count, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-1.5 hover:bg-emerald-700
        disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1.5 whitespace-nowrap"
    >
      <span>📥</span>
      <span>{label}</span>
      {count !== undefined && <span className="opacity-80">({count})</span>}
    </button>
  )
}

/* ── Colonnes standard pour l'export des demandes ────────────────────── */
const COLS_DEMANDE = {
  numDemande  : 'Num Demande',
  refAbo      : 'Réf Abo',
  client      : 'Client',
  typeDemande : 'Type Demande',
  typeMutation: 'Type Mutation',
  statut      : 'Statut',
  dateStr     : 'Date',
  nomCentre   : 'Centre',
  secteur     : 'Secteur',
  adresse     : 'Adresse',
  creePar     : 'Agent',
}

/* ── Page principale ─────────────────────────────────────────────────── */
export default function MutationsPage() {
  // États données (chargées depuis l'API Oracle/DuckDB)
  const [mutationData,  setMutationData]  = useState(null)  // { rows, anomalies }
  const [egfRows,       setEgfRows]       = useState([])
  const [centreCharge,  setCentreCharge]  = useState(null)
  const [croisement,    setCroisement]    = useState(null)

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Filtres onglet anomalies croisement
  const [filterRegle, setFilterRegle] = useState('Toutes')
  const [filterGravite, setFilterGravite] = useState('Toutes')

  // Drill-down onglet Types mutation
  const [selectedType, setSelectedType] = useState(null)
  const [filterRegleType, setFilterRegleType] = useState('Toutes')

  // Filtre onglet Gros consommateur
    // Filtre onglet Gros consommateur
  const [filterStatutGC, setFilterStatutGC] = useState('Tous')
 
  // 🆕 v5.0 — Paramètres du dernier chargement (pour re-fetch temps réel)
  const [lastLoadParams, setLastLoadParams] = useState(null)
 
  /* ── Handler : données chargées depuis Oracle ── */
  const handleOracleData = ({ mutations, egf, centre, params }) => {
    setMutationData({ rows: mutations, anomalies: [] })
    setEgfRows(egf)
    setCentreCharge(centre)
    setCroisement(null)
    setError(null)
    setLastLoadParams(params)   // 🆕 v5.0
  }
 
  // 🆕 v5.0 — Re-fetch automatique sur event SSE `data_changed`
  useRealtimeMutations({
    lastLoadParams,
    mutationData,
    croisement,
    setMutationData,
    setEgfRows,
    setCroisement,
    setActiveTab,
  })
 
  /* ── Lancer le croisement ── */
  const lancerCroisement = async () => {
    if (!mutationData) {
      setError('Charge d\'abord les données Oracle.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = croiserMutationEGF(mutationData.rows, egfRows)
      setCroisement(result)
      setActiveTab('croisement')
    } catch (e) {
      console.error(e)
      setError('Erreur lors du croisement : ' + e.message)
    } finally {
      setLoading(false)
    }
  }
  const reset = () => {
    setMutationData(null); setEgfRows([]); setCentreCharge(null)
    setCroisement(null); setError(null); setSelectedType(null)
    setLastLoadParams(null)   // 🆕 v5.0 — coupe le re-fetch auto
  }
 
 

  /* ── ÉCRAN CHARGEMENT ── 🆕 v7 : HomeHero + OracleLoader ── */
  if (!mutationData) {
    return (
      <div className="w-full max-w-[1200px] mx-auto p-4 md:p-6 space-y-6">
        <HomeHero />
        <OracleLoader onData={handleOracleData} />
        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>
    )
  }

  /* ── Stats mutation seule ── */
  const { rows, anomalies: anomMutation } = mutationData
  const total     = rows.length
  const nbValides = rows.filter(r => r.valide === 'OUI').length
  const nbAnnules = rows.filter(r => r.annule === 'OUI').length
  const nbAttente = rows.filter(r => r.valide === 'NON' && r.annule === 'NON').length

  const typesDemandeMap = {}
  rows.forEach(r => {
    const k = r.typeDemande || 'Non précisé'
    typesDemandeMap[k] = (typesDemandeMap[k] || 0) + 1
  })

  const typesMutationMap = {}
  rows.filter(r => r.typeDemande === 'Mutation').forEach(r => {
    const k = r.typeMutation || '— Non précisé'
    typesMutationMap[k] = (typesMutationMap[k] || 0) + 1
  })

  /* ── Liste unifiée de TOUS les types (pour onglet Types mutation) ── */
  const typeKey = (r) => {
    if (r.typeDemande === 'Mutation') {
      const sub = (r.typeMutation || '').trim().replace(/^-\s*/, '').trim() || 'Non précisé'
      return `Mutation — ${sub}`
    }
    return r.typeDemande || 'Non précisé'
  }
  const allTypesMap = {}
  rows.forEach(r => {
    const k = typeKey(r)
    allTypesMap[k] = (allTypesMap[k] || 0) + 1
  })

  // Cas filtrés pour le type sélectionné
  const casDuType = selectedType
    ? rows.filter(r => typeKey(r) === selectedType)
    : []
  const casType = {
    total   : casDuType.length,
    valides : casDuType.filter(r => r.valide === 'OUI').length,
    annules : casDuType.filter(r => r.annule === 'OUI').length,
    attente : casDuType.filter(r => r.valide === 'NON' && r.annule === 'NON').length,
  }

  /* ── Anomalies croisement filtrées ── */
  const anomCrois = croisement?.anomalies ?? []
  const regles = ['Toutes', ...TOUTES_LES_REGLES]
  const anomFiltrees = anomCrois.filter(a =>
    (filterGravite === 'Toutes' || a.gravite === filterGravite) &&
    (filterRegle   === 'Toutes' || a.regle   === filterRegle)
  )

  const TABS = [
    { id: 'overview',    label: 'Vue d\'ensemble' },
    { id: 'types',       label: 'Type de demande' },
    { id: 'croisement',  label: croisement ? `Anomalies croisement ` : 'Anomalies croisement' },
    { id: 'gros',        label: 'Gros consommateur' },
    { id: 'données',     label: 'Données brutes' },
  ]

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            État Mutations —{' '}
            {[...new Set(rows.map(r => r.nomCentre))].length === 1
              ? rows[0].nomCentre
              : `${[...new Set(rows.map(r => r.nomCentre))].length} centres`}
          </h1>
          <p className="text-sm text-gray-400">{total} demandes analysées</p>
        </div>
        <div className="flex gap-2 self-start">
          <ExportButton
            onClick={() => exportToExcel(
              rows.map(r => ({ ...r, statut: statutDemande(r) })),
              `SNDE_mutations_${[...new Set(rows.map(r => r.nomCentre))][0] || 'centre'}`,
              'Mutations',
              COLS_DEMANDE
            )}
            label="Export toutes demandes"
            count={total}
          />
          <button onClick={reset}
            className="text-sm text-indigo-600 border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 transition-all">
            ↩ Réinitialiser
          </button>
        </div>
      </div>

      {/* KPIs mutation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total demandes" value={total} />
        <KpiCard label="Validées"  value={nbValides} sub={`${pct(nbValides,total)}%`}  color="text-green-600" />
        <KpiCard label="Annulées"  value={nbAnnules} sub={`${pct(nbAnnules,total)}%`}  color="text-red-500" />
        <KpiCard label="En attente" value={nbAttente} sub={`${pct(nbAttente,total)}%`} color="text-yellow-500" />
      </div>

      {/* ── BLOC CROISEMENT EGF ── */}
      <div className="bg-white rounded-xl border border-snde-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800">Croisement avec les EGF</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              EGF (3 mois roulants) chargé depuis Oracle — {egfRows.length} facture(s) en mémoire
            </p>
          </div>
          {croisement && (
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
              ✓ Croisement effectué
            </span>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={lancerCroisement}
          disabled={egfRows.length === 0 || loading}
          className="w-full py-2.5 rounded-lg bg-snde-700 text-white font-medium text-sm
            hover:bg-snde-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading
            ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg> Croisement en cours…</>
            : '🔍 Lancer le croisement Mutation × EGF'}
        </button>
      </div>

      

      
      {/* ── Légende des règles ── */}
      <details className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl select-none flex items-center gap-2">
          <span>📋</span> Référentiel des règles de contrôle
        </summary>
        <div className="px-5 pb-5 pt-2 border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left py-2 pr-4 font-medium">Règle</th>
                <th className="text-left py-2 pr-4 font-medium">Gravité</th>
                <th className="text-left py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                {
                  regle  : 'Mutation non facturée',
                  gravite: 'Haute',
                  desc   : 'Mutation Compteur validée mais aucune Facture Mutation trouvée dans l\'EGF — perte de revenus.',
                },
                {
                  regle  : 'Conso nulle sans forfait',
                  gravite: 'Critique',
                  desc   : 'Facture mutation avec V_FACTURE = 0 et aucune Facture Forfaitaire précédente — compteur défectueux non couvert.',
                },
                {
                  regle  : 'Multi-mutations',
                  gravite: 'Moyenne',
                  desc   : 'Plusieurs factures mutation trouvées pour le même abonné à partir de la date de demande — à vérifier.',
                },
                {
                  regle  : 'Nv abonnement / Réabonnement — index pose > 0',
                  gravite: 'Critique',
                  desc   : 'Nouveau abonnement (création) ou Réabonnement validé, mais la 1ʳᵉ facture portant un index (Relevée, Estimée ou Mutation) a Index_Début > 0 — le compteur a déjà servi à un autre abonné.',
                },
                {
                  regle  : 'Nv abonnement / Réabonnement non facturé',
                  gravite: 'Haute',
                  desc   : 'Nouveau abonnement (création) ou Réabonnement validé mais aucune facture de frais émise (Facture Nv Abonnement / Facture Réabonnement) — perte des frais.',
                },
                {
                  regle  : 'Résiliation avec solde impayé',
                  gravite: 'Haute',
                  desc   : 'Résiliation validée. La Facture Arrêt du Compte laisse un solde > 1 000 MRU — créance à risque de non-recouvrement.',
                },
                {
                  // 🆕 v7 — R8
                  regle  : 'Résilier sur index mémoire',
                  gravite: 'Haute',
                  desc   : 'Résiliation validée. La Facture Arrêt du Compte ne contient pas de consommation — le releveur n\'a pas pris le dernier index sur le terrain (conservation de l\'index mémoire).',
                },
                {
                  // 🆕 v5 — R9
                  regle  : 'Résiliation non clôturée',
                  gravite: 'Haute',
                  desc   : 'Résiliation validée mais aucune Facture Arrêt du Compte n\'a été émise dans les EGF — la résiliation n\'est pas clôturée comptablement.',
                },
              ].map((r) => (
                <tr key={r.regle} className="hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-700 whitespace-nowrap">{r.regle}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${GRAVITE_STYLE[r.gravite]}`}>
                      {r.gravite}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500 text-xs leading-relaxed">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
              ${activeTab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Vue d'ensemble ── */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4">Types de demande</h2>
            <div className="flex flex-col gap-3">
              {Object.entries(typesDemandeMap).sort((a,b)=>b[1]-a[1]).map(([type,n]) => (
                <PctBar key={type} label={type} n={n} total={total}
                  color={type==='Mutation'?'bg-indigo-500':type==='Résiliation'?'bg-red-400':'bg-green-500'} />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4">Statut des mutations validées</h2>
            <div className="flex flex-col gap-3">
              <PctBar label="Validées"   n={nbValides} total={total} color="bg-green-500" />
              <PctBar label="En attente" n={nbAttente} total={total} color="bg-yellow-400" />
              <PctBar label="Annulées"   n={nbAnnules} total={total} color="bg-red-400" />
            </div>
          </div>
        </div>
      )}

      {/* ── Type de demande (interactif : cartes cliquables → détail) ── */}
      {activeTab === 'types' && (
        <div className="flex flex-col gap-4">
          {!selectedType ? (
            /* === Vue liste : tous les types cliquables === */
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-gray-700">Type de demande</h2>
                <span className="text-xs text-gray-400">{Object.keys(allTypesMap).length} types — {total} demandes</span>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                Cliquez sur un type pour voir le résumé et la liste détaillée des cas
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(allTypesMap).sort((a, b) => {
                  // 🆕 v7 — ordre logique métier : NB → Mutations → Reprise → Résiliation → Réabonnement
                  const ordre = (t) => {
                    if (t === 'Nouveau Branchement')    return 1
                    if (t.startsWith('Mutation'))       return 2
                    if (t === 'Reprise de Branchement') return 3
                    if (t === 'Résiliation')            return 4
                    if (t === 'Réabonnement')           return 5
                    return 6
                  }
                  const oa = ordre(a[0]), ob = ordre(b[0])
                  if (oa !== ob) return oa - ob
                  return b[1] - a[1]   // même groupe → effectif décroissant
                }).map(([type,n]) => {
                  const isMut = type.startsWith('Mutation —')
                  const barColor = isMut
                    ? 'bg-indigo-500'
                    : type === 'Résiliation' ? 'bg-red-400'
                    : type === 'Nouveau Branchement' ? 'bg-green-500'
                    : type === 'Réabonnement' ? 'bg-blue-500'
                    : 'bg-gray-400'
                  return (
                    <button
                      key={type}
                      onClick={() => { setSelectedType(type); setFilterRegleType('Toutes') }}
                      className="text-left bg-white border border-gray-200 hover:border-indigo-400 hover:shadow-md rounded-xl p-4 transition-all group"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-700 font-medium group-hover:text-indigo-700">{type}</span>
                        <span className="text-lg font-bold text-indigo-600">{n}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`${barColor} h-2 rounded-full`} style={{ width: `${pct(n, total)}%` }} />
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-gray-400">{pct(n, total)}% du total</span>
                        <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">Voir détails →</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* === Vue détail d'un type sélectionné === */
            <div className="flex flex-col gap-4">
              <button
                onClick={() => { setSelectedType(null); setFilterRegleType('Toutes') }}
                className="text-sm text-indigo-600 hover:text-indigo-800 self-start flex items-center gap-1"
              >
                ← Retour à tous les types
              </button>

              <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-800">{selectedType}</h2>
                <p className="text-xs text-gray-400 mt-1">{casType.total} demande(s) analysée(s) pour ce type</p>
              </div>

              {/* Cartes résumé */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Total"      value={casType.total} />
                <KpiCard label="Validées"   value={casType.valides} sub={`${pct(casType.valides, casType.total)}%`} color="text-green-600" />
                <KpiCard label="Annulées"   value={casType.annules} sub={`${pct(casType.annules, casType.total)}%`} color="text-red-500" />
                <KpiCard label="En attente" value={casType.attente} sub={`${pct(casType.attente, casType.total)}%`} color="text-yellow-500" />
              </div>

              {/* ── KPIs contextuels du croisement ── */}
              {/* Cas A : sous-type Mutation Compteur → bloc Mutations Compteur */}
              {croisement && selectedType.startsWith('Mutation —') && selectedType.toLowerCase().includes('compteur') && (() => {
                const anomDuType = croisement.anomalies.filter(a => {
                  if (!a.typeMutation) return false
                  const sub = (a.typeMutation || '').trim().replace(/^-\s*/, '').trim() || 'Non précisé'
                  return `Mutation — ${sub}` === selectedType
                })
                const sansFacture = anomDuType.filter(a => a.regle === 'Mutation non facturée').length
                const sansForfait = anomDuType.filter(a => a.regle === 'Conso nulle sans forfait').length
                const multiMut   = anomDuType.filter(a => a.regle === 'Multi-mutations').length
                const mutValides = casType.valides
                return (
                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Anomalies du croisement — Mutations Compteur
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KpiCard label="Mutations analysées" value={mutValides} />
                      <KpiCard label="Sans facture" value={sansFacture}
                        sub="dans l'EGF" color="text-orange-600" warn={sansFacture > 0} />
                      <KpiCard label="Conso nulle sans forfait" value={sansForfait}
                        color="text-red-600" warn={sansForfait > 0} />
                      <KpiCard label="Multi-mutations" value={multiMut}
                        color="text-orange-600" warn={multiMut > 0} />
                    </div>
                  </div>
                )
              })()}

              {/* Cas B : Nouveau Branchement OU Réabonnement → bloc dédié */}
              {croisement && (selectedType === 'Nouveau Branchement' || selectedType === 'Réabonnement') && (() => {
                const auditees = rows.filter(r =>
                  r.typeDemande === selectedType && r.valide === 'OUI' && r.annule === 'NON'
                ).length
                const indexPose = croisement.anomalies.filter(a =>
                  a.regle === 'Nv abonnement / Réabonnement — index pose > 0' && a.typeDemande === selectedType
                ).length
                const fraisNonFactures = croisement.anomalies.filter(a =>
                  a.typeDemande === selectedType && /non facturé$/.test(a.regle)
                ).length
                return (
                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Anomalies du croisement — {selectedType}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <KpiCard label={`${selectedType}s auditées`} value={auditees} />
                      <KpiCard label="Index de pose > 0" value={indexPose}
                        sub="1ʳᵉ Facture Relevée non nulle" color="text-red-600" warn={indexPose > 0} />
                      <KpiCard label="Frais non facturés" value={fraisNonFactures}
                        color="text-orange-600" warn={fraisNonFactures > 0} />
                    </div>
                  </div>
                )
              })()}

              {/* Cas C : Résiliation → bloc dédié (R7 + 🆕 R8 + R9) */}
              {croisement && selectedType === 'Résiliation' && (() => {
                const auditees = rows.filter(r =>
                  r.typeDemande === 'Résiliation' && r.valide === 'OUI' && r.annule === 'NON'
                ).length
                const soldeImpaye = croisement.anomalies.filter(a =>
                  a.regle === 'Résiliation avec solde impayé'
                ).length
                const totalSoldeImpaye = croisement.anomalies
                  .filter(a => a.regle === 'Résiliation avec solde impayé')
                  .reduce((s, a) => s + (Number(a.solde) || 0), 0)
                const consoNulle = croisement.anomalies.filter(a =>
                  a.regle === 'Résilier sur index mémoire'
                ).length
                const nonCloturees = croisement.anomalies.filter(a =>
                  a.regle === 'Résiliation non clôturée'
                ).length
                return (
                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Anomalies du croisement — Résiliation
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <KpiCard label="Résiliations auditées" value={auditees} />
                      <KpiCard label="Solde impayé > 1 000 MRU" value={soldeImpaye}
                        sub="R7 — Haute" color="text-red-600" warn={soldeImpaye > 0} />
                      <KpiCard label="Total créance à risque" value={fmtMRU(totalSoldeImpaye)}
                        color="text-red-600" warn={totalSoldeImpaye > 0} />
                      <KpiCard label="Sans relève finale (conso null)" value={consoNulle}
                        sub="R8 — Haute" color="text-orange-600" warn={consoNulle > 0} />
                      <KpiCard label="Non clôturée (sans facture arrêt)" value={nonCloturees}
                        sub="R9 — Haute" color="text-amber-600" warn={nonCloturees > 0} />
                    </div>
                  </div>
                )
              })()}

              {/* Message si croisement pas encore fait sur les types auditables */}
              {!croisement && (
                (selectedType.startsWith('Mutation —') && selectedType.toLowerCase().includes('compteur')) ||
                selectedType === 'Nouveau Branchement' ||
                selectedType === 'Réabonnement' ||
                selectedType === 'Résiliation'
              ) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 text-center">
                  💡 Lance le croisement EGF (en haut de la page) pour voir les anomalies de ce type.
                </div>
              )}

              {/* Liste détaillée des cas (validés + en attente, on exclut juste les annulés)
                  avec filtre par règle. Affiche compteur + solde issus de l'EGF. */}
              {(() => {
                // 1) Cas à afficher : validés ET en attente (on exclut juste les annulés)
                const casActifs = casDuType.filter(r => r.annule !== 'OUI')

                // 2) Anomalies liées à ces cas (par refAbo)
                const refsActives = new Set(casActifs.map(r => r.refAbo).filter(Boolean))
                const anomDuType = (croisement?.anomalies ?? []).filter(a =>
                  a.refAbo && refsActives.has(a.refAbo)
                )

                // 3) Règles applicables au type
                let reglesApplicables = []
                if (selectedType.startsWith('Mutation —') && selectedType.toLowerCase().includes('compteur')) {
                  reglesApplicables = REGLES_MUTATION_COMPTEUR
                } else if (REGLES_PAR_TYPE[selectedType]) {
                  reglesApplicables = REGLES_PAR_TYPE[selectedType]
                }
                const reglesDispo = ['Toutes', ...reglesApplicables]

                // 4) Map refAbo → [anomalies] pour affichage des badges
                const anomParRef = {}
                anomDuType.forEach(a => {
                  if (!anomParRef[a.refAbo]) anomParRef[a.refAbo] = []
                  anomParRef[a.refAbo].push(a)
                })

                // 5) Filtrage par règle sélectionnée
                const casAffiches = filterRegleType === 'Toutes'
                  ? casActifs
                  : casActifs.filter(r => (anomParRef[r.refAbo] || []).some(a => a.regle === filterRegleType))

                // 6) Helper pour lire meta (compteur/solde) depuis le croisement
                const meta = (refAbo) => croisement?.metaPerRef?.[refAbo] || null

                return (
                  <>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                        Cas (validés + en attente)
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-500">Règle :</label>
                        <select
                          value={filterRegleType}
                          onChange={e => setFilterRegleType(e.target.value)}
                          disabled={reglesDispo.length <= 1}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          {reglesDispo.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <span className="text-sm text-gray-400 ml-auto">
                        {casAffiches.length} / {casActifs.length} cas
                      </span>
                      <ExportButton
                        disabled={casAffiches.length === 0}
                        count={casAffiches.length}
                        label="Exporter Excel"
                        onClick={() => {
                          // Construit les lignes à exporter avec compteur + solde issus de metaPerRef
                          // et un résumé des anomalies par cas
                          const data = casAffiches.map(r => {
                            const m = meta(r.refAbo)
                            const anos = anomParRef[r.refAbo] || []
                            return {
                              numDemande : r.numDemande || '',
                              refAbo     : r.refAbo || '',
                              client     : r.client || '',
                              statut     : r.valide === 'OUI' ? 'Validé' : 'En attente',
                              dateStr    : r.dateStr || '',
                              nomCentre  : r.nomCentre || '',
                              secteur    : r.secteur || '',
                              adresse    : r.adresse || '',
                              compteur   : m?.compteur || '',
                              solde      : Number.isFinite(Number(m?.solde)) ? m.solde : '',
                              anomalies  : anos.map(a => a.regle).join(' | ') || 'OK',
                            }
                          })
                          const safeName = String(selectedType).replace(/[^a-zA-Z0-9_-]/g, '_')
                          exportToExcel(
                            data,
                            `SNDE_cas_${safeName}`,
                            selectedType.slice(0, 30),
                            {
                              numDemande : 'Num Demande',
                              refAbo     : 'Réf Abo',
                              client     : 'Client',
                              statut     : 'Statut',
                              dateStr    : 'Date',
                              nomCentre  : 'Centre',
                              secteur    : 'Secteur',
                              adresse    : 'Adresse',
                              compteur   : 'N° Compteur',
                              solde      : 'Solde (MRU)',
                              anomalies  : 'Anomalies',
                            }
                          )
                        }}
                      />
                    </div>

                    {casAffiches.length === 0 ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400">
                        {casActifs.length === 0
                          ? 'Aucun cas pour ce type (uniquement des annulés).'
                          : 'Aucun cas ne correspond à cette règle.'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                            <tr>
                              {['Num Demande','Réf Abo','Client','Statut','Date','Centre','Secteur','Adresse','N° Compteur','Solde','Anomalies'].map(h => (
                                <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {casAffiches.map((r, i) => {
                              const anos = anomParRef[r.refAbo] || []
                              const m = meta(r.refAbo)
                              const statut = r.valide === 'OUI' ? 'Validé' : 'En attente'
                              const statutColor = r.valide === 'OUI'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                              return (
                                <tr key={i} className="hover:bg-gray-50 align-top">
                                  <td className="px-3 py-2 font-mono text-gray-600 text-xs">{r.numDemande}</td>
                                  <td className="px-3 py-2 font-mono text-gray-500 text-xs">{r.refAbo || '—'}</td>
                                  <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{r.client}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statutColor}`}>
                                      {statut}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">{r.dateStr}</td>
                                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[140px] truncate">{r.nomCentre}</td>
                                  <td className="px-3 py-2 text-gray-500 text-xs">{r.secteur}</td>
                                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[180px] truncate">{r.adresse || '—'}</td>
                                  <td className="px-3 py-2 font-mono text-gray-500 text-xs">{m?.compteur || '—'}</td>
                                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs font-semibold">
                                    {Number.isFinite(Number(m?.solde)) ? fmtMRU(m.solde) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {anos.length === 0 ? (
                                      <span className="text-green-600">✓ OK</span>
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        {anos.map((a, k) => (
                                          <span key={k}
                                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${GRAVITE_STYLE[a.gravite] || ''}`}
                                            title={a.detail}
                                          >
                                            {a.regle}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Croisement EGF ── */}
      {activeTab === 'croisement' && (
        <div className="flex flex-col gap-4">
          {!croisement ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-400">
              Importez les fichiers EGF et lancez le croisement pour voir les résultats.
            </div>
          ) : (
            <>
              {/* Filtres */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">Gravité :</label>
                  <select value={filterGravite} onChange={e=>setFilterGravite(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                    {['Toutes','Critique','Haute','Moyenne','Faible'].map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">Règle :</label>
                  <select value={filterRegle} onChange={e=>setFilterRegle(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                    {regles.map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                <span className="text-sm text-gray-400">{anomFiltrees.length} résultat(s)</span>
                <div className="ml-auto flex gap-2">
                  <ExportButton
                    onClick={() => exportToExcel(
                      anomFiltrees,
                      `SNDE_anomalies_filtre_${[...new Set(rows.map(r => r.nomCentre))][0] || 'centre'}`,
                      'Anomalies',
                      {
                        gravite     : 'Gravité',
                        regle       : 'Règle',
                        refAbo      : 'Réf Abo',
                        numDemande  : 'N° Demande',
                        nomClient   : 'Client',
                        nomCentre   : 'Centre',
                        typeDemande : 'Type Demande',
                        dateDemande : 'Date Demande',
                        compteur    : 'Compteur',
                        indexDebut  : 'Index Début',
                        numFacture  : 'N° Facture',
                        detail      : 'Détail',
                      }
                    )}
                    label="Export filtré"
                    count={anomFiltrees.length}
                    disabled={anomFiltrees.length === 0}
                  />
                  <ExportButton
                    onClick={() => exportAnomaliesMultiOnglets(
                      anomCrois,
                      croisement.stats,
                      [...new Set(rows.map(r => r.nomCentre))][0]
                    )}
                    label="Export complet"
                    count={anomCrois.length}
                  />
                </div>
              </div>

              {anomFiltrees.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-700 font-medium">
                  ✓ Aucune anomalie pour ces critères
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <tr>
                        {['Gravité','Règle','Réf Abo','Client','Type','Date Demande','Centre','Secteur','Adresse','N° Compteur','Solde','Détail'].map(h=>(
                          <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {anomFiltrees.map((a,i)=>{
                        const m = croisement?.metaPerRef?.[a.refAbo] || null
                        const compteurAff = a.compteur || m?.compteur || '—'
                        const soldeAff = Number.isFinite(Number(a.solde))
                          ? a.solde
                          : (Number.isFinite(Number(m?.solde)) ? m.solde : null)
                        return (
                        <tr key={i} className="hover:bg-gray-50 align-top">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${GRAVITE_STYLE[a.gravite]}`}>
                              {a.gravite}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap text-xs">{a.regle}</td>
                          <td className="px-3 py-3 font-mono text-gray-600 text-xs">{a.refAbo}</td>
                          <td className="px-3 py-3 text-gray-600 max-w-[180px] truncate text-xs">{a.nomClient}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{a.typeMutation || a.typeDemande || '—'}</td>
                          <td className="px-3 py-3 text-gray-400 whitespace-nowrap text-xs">{a.dateDemande}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs max-w-[140px] truncate">{a.nomCentre || '—'}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{a.secteur || '—'}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs max-w-[180px] truncate">{a.adresse || '—'}</td>
                          <td className="px-3 py-3 font-mono text-gray-500 text-xs">{compteurAff}</td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap text-xs font-semibold">
                            {soldeAff != null ? fmtMRU(soldeAff) : '—'}
                          </td>
                          <td className="px-3 py-3 text-gray-500 max-w-xs text-xs">{a.detail}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Gros consommateur (secteurs 04 / 08) ── */}
      {activeTab === 'gros' && (() => {
        const rowsGC = rows.filter(r => estGrosConsommateur(r.secteur))
        const totalGC = rowsGC.length
        const validesGC = rowsGC.filter(r => r.valide === 'OUI' && r.annule !== 'OUI').length
        const attenteGC = rowsGC.filter(r => r.valide === 'NON' && r.annule === 'NON').length
        const annulesGC = rowsGC.filter(r => r.annule === 'OUI').length

        // Répartition par Type Demande
        const TYPES_GC = ['Mutation', 'Nouveau Branchement', 'Réabonnement', 'Résiliation', 'Reprise de Branchement']
        const repartition = TYPES_GC.map(td => ({
          type   : td,
          total  : rowsGC.filter(r => r.typeDemande === td).length,
          valide : rowsGC.filter(r => r.typeDemande === td && r.valide === 'OUI' && r.annule !== 'OUI').length,
        }))

        // Détail : on exclut juste les annulés
        const detailsGC = rowsGC
          .filter(r => r.annule !== 'OUI')
          .sort((a, b) => {
            // Tri : validés d'abord (à signaler), puis en attente
            if (a.valide === 'OUI' && b.valide !== 'OUI') return -1
            if (b.valide === 'OUI' && a.valide !== 'OUI') return 1
            return 0
          })

        // Filtrage par statut sélectionné (Tous / Validé / En attente)
        const detailsGCFiltres = detailsGC.filter(r => {
          if (filterStatutGC === 'Validé')     return r.valide === 'OUI'
          if (filterStatutGC === 'En attente') return r.valide !== 'OUI'
          return true   // 'Tous'
        })

        return (
          <div className="flex flex-col gap-4">
            {/* Bandeau d'explication */}
            <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
              <div className="text-sm text-amber-900">
                <p className="font-semibold mb-1">Secteurs réservés aux gros consommateurs (04 / 08)</p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  
                </p>
              </div>
            </div>

            {/* En-tête */}
            <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-sm flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Gros consommateur</h2>
                <p className="text-xs text-gray-400 mt-1">
                  {totalGC} demande(s) trouvée(s) en secteur 04 ou 08
                </p>
              </div>
              <ExportButton
                disabled={detailsGCFiltres.length === 0}
                count={detailsGCFiltres.length}
                label="Exporter Excel"
                onClick={() => {
                  const data = detailsGCFiltres.map(r => ({
                    numDemande   : r.numDemande || '',
                    refAbo       : r.refAbo || '',
                    client       : r.client || '',
                    typeDemande  : r.typeDemande || '',
                    typeMutation : r.typeMutation || '',
                    statut       : r.valide === 'OUI' ? 'Validé (à contrôler DG)' : 'En attente',
                    dateStr      : r.dateStr || '',
                    nomCentre    : r.nomCentre || '',
                    secteur      : normaliseSecteurGC(r.secteur),
                    adresse      : r.adresse || '',
                  }))
                  const suffixe = filterStatutGC === 'Tous'
                    ? ''
                    : `_${filterStatutGC.replace(/\s/g, '-')}`
                  exportToExcel(
                    data,
                    `SNDE_gros_consommateur${suffixe}`,
                    'Gros consommateur',
                    {
                      numDemande   : 'Num Demande',
                      refAbo       : 'Réf Abo',
                      client       : 'Client',
                      typeDemande  : 'Type Demande',
                      typeMutation : 'Type Mutation',
                      statut       : 'Statut',
                      dateStr      : 'Date',
                      nomCentre    : 'Centre',
                      secteur      : 'Secteur',
                      adresse      : 'Adresse',
                    }
                  )
                }}
              />
            </div>

            {/* 4 KPIs principaux */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Total demandes GC" value={totalGC} />
              <KpiCard
                label="Validées sans contrôle"
                value={validesGC}
                sub={validesGC > 0 ? 'À vérifier' : 'OK'}
                color="text-red-600"
                warn={validesGC > 0}
              />
              <KpiCard label="En attente" value={attenteGC} color="text-yellow-500" />
              <KpiCard label="Annulées"   value={annulesGC} color="text-gray-500" />
            </div>

            {/* Répartition par type de demande */}
            <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Répartition par type de demande
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {repartition.map(({ type, total, valide }) => (
                  <div key={type} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{type}</span>
                    <span className="text-2xl font-bold text-indigo-600">{total}</span>
                    {valide > 0 && (
                      <span className="text-[10px] text-red-600 font-semibold">
                        dont {valide} validée(s) 🚨
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Barre de filtre Statut */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filtrer</span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">Statut :</label>
                <select
                  value={filterStatutGC}
                  onChange={e => setFilterStatutGC(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
                >
                  {['Tous','Validé','En attente'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <span className="text-sm text-gray-400 ml-auto">
                {detailsGCFiltres.length} / {detailsGC.length} demande(s)
              </span>
            </div>

            {/* Tableau détaillé */}
            {detailsGCFiltres.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400">
                {detailsGC.length === 0
                  ? 'Aucune demande en secteur 04 ou 08.'
                  : `Aucune demande avec le statut "${filterStatutGC}".`}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      {['Num Demande','Réf Abo','Client','Type Demande','Statut','Date','Centre','Secteur','Adresse'].map(h => (
                        <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detailsGCFiltres.map((r, i) => {
                      const statut = r.valide === 'OUI' ? 'Validé' : 'En attente'
                      const statutColor = r.valide === 'OUI'
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
                              {statut} {r.valide === 'OUI' && '🚨'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">{r.dateStr}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs max-w-[160px] truncate">{r.nomCentre}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-100 text-indigo-700">
                              {normaliseSecteurGC(r.secteur)}
                            </span>
                          </td>
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
      })()}

      {/* ── Données brutes ── */}
      {activeTab === 'données' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{rows.length} demandes</span>
            <ExportButton
              onClick={() => exportToExcel(
                rows.map(r => ({ ...r, statut: statutDemande(r) })),
                `SNDE_donnees_brutes_${[...new Set(rows.map(r => r.nomCentre))][0] || 'centre'}`,
                'Données',
                COLS_DEMANDE
              )}
              label="Exporter données brutes"
              count={rows.length}
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
              <tr>
                {/* 🆕 v6 — 15 colonnes alignées sur l'export Excel d'origine */}
                {[
                  'Nom Centre','Code Centre','Num Demande','Réf Abonnement','Type Demande',
                  'Client','Créée par','Validé','Annulé','Adresse','Secteur','Tournée',
                  'Type Mutation','Date Demande','Code Client',
                ].map(h=>(
                  <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r,i)=>(
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{r.nomCentre || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono">{r.codeCentre || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{r.numDemande || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{r.refAbo || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.typeDemande==='Mutation'?'bg-indigo-100 text-indigo-700':'bg-gray-100 text-gray-600'}`}>
                      {r.typeDemande || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{r.client || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.creePar || '—'}</td>
                  <td className="px-3 py-2 font-semibold"
                    style={{color: r.valide==='OUI'?'#16a34a':'#ef4444'}}>{r.valide || '—'}</td>
                  <td className="px-3 py-2 font-semibold"
                    style={{color: r.annule==='OUI'?'#ef4444':'#9ca3af'}}>{r.annule || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{r.adresse || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.secteur || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.tournee || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">{r.typeMutation || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{r.dateStr}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono">{r.codeClient || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  )
}