import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell, Legend,
} from 'recharts'
import { Card } from '../components/Card.jsx'
import KpiCard from '../components/KpiCard.jsx'
import {
  Droplet, TrendingDown, TrendingUp, AlertTriangle,
  FileBarChart, CircleDashed, ListChecks, Grid3x3,
} from 'lucide-react'
import {
  computeKPIs, distributionConso, consosFaibles, topConsommateurs,
  volumeEstimeVsReel, SEUILS,
} from '../lib/analytics.js'
import { PageTitle, ExportBtn, EmptyState } from '../components/PageShared.jsx'
import { fmt, pct } from '../lib/format.js'

/* ============================================================
 *  ANALYSE DES ANOMALIES DÉCLARÉES PAR SNDE (colonne brute)
 *  Lecture pure de la colonne "Anomalies" du fichier source.
 * ============================================================ */

const normLibAnom = (s) => {
  if (!s) return null
  return String(s).replace(/\s+/g, ' ').trim()
}

const categorieAnomSnde = (lib) => {
  if (!lib) return 'AUCUNE'
  const L = lib.toLowerCase()
  if (L.includes('nulle'))                     return 'NULLE'
  if (L.includes('trop') && L.includes('lev')) return 'TROP_ELEVEE'
  if (L.includes('lev'))                       return 'ELEVEE'
  return 'AUTRE'
}

// Normalise les types de comptage pour fusionner les variantes
const normEtat = (e) => {
  if (!e) return 'AUTRE'
  const E = e.toUpperCase()
  if (E.includes('INACCESSIBLE')) return 'COMPTEUR INACCESSIBLE'
  if (E.includes('ACCESSIBLE'))   return 'COMPTEUR ACCESSIBLE'
  if (E.includes('ILLISIBLE'))    return 'COMPTEUR ILLISIBLE'
  if (E.includes('BLOQU'))        return 'COMPTEUR BLOQUE'
  if (E.includes('DEFECT'))       return 'COMPTEUR DEFECTUEUX'
  return 'AUTRE'
}

const COULEURS_ETAT = {
  'COMPTEUR ACCESSIBLE':   '#10b981',
  'COMPTEUR INACCESSIBLE': '#f59e0b',
  'COMPTEUR ILLISIBLE':    '#f97316',
  'COMPTEUR BLOQUE':       '#ef4444',
  'COMPTEUR DEFECTUEUX':   '#7c3aed',
  'AUTRE':                 '#94a3b8',
}

const SHORT_ETAT = {
  'COMPTEUR ACCESSIBLE':   'Accessible',
  'COMPTEUR INACCESSIBLE': 'Inaccessible',
  'COMPTEUR ILLISIBLE':    'Illisible',
  'COMPTEUR BLOQUE':       'Bloqué',
  'COMPTEUR DEFECTUEUX':   'Défectueux',
  'AUTRE':                 'Autre',
}

const COULEURS_SNDE = {
  NULLE:       '#ef4444',
  ELEVEE:      '#f59e0b',
  TROP_ELEVEE: '#7c3aed',
  AUTRE:       '#94a3b8',
  AUCUNE:      '#10b981',
}

const LIBELLE_SNDE = {
  NULLE:       'Consommation Nulle',
  ELEVEE:      'Consommation élevée',
  TROP_ELEVEE: 'Consommation trop élevée',
  AUTRE:       'Autre anomalie',
  AUCUNE:      'Sans anomalie déclarée',
}

function compteAnomaliesSnde(abos) {
  const counts = { NULLE: 0, ELEVEE: 0, TROP_ELEVEE: 0, AUTRE: 0, AUCUNE: 0 }
  for (const a of abos) {
    const lib = normLibAnom(a.anomalies)
    if (!lib) { counts.AUCUNE++; continue }
    counts[categorieAnomSnde(lib)]++
  }
  const total = abos.length || 1
  return [
    { key: 'NULLE',       label: LIBELLE_SNDE.NULLE,       count: counts.NULLE,       pct: counts.NULLE / total * 100,       couleur: COULEURS_SNDE.NULLE },
    { key: 'ELEVEE',      label: LIBELLE_SNDE.ELEVEE,      count: counts.ELEVEE,      pct: counts.ELEVEE / total * 100,      couleur: COULEURS_SNDE.ELEVEE },
    { key: 'TROP_ELEVEE', label: LIBELLE_SNDE.TROP_ELEVEE, count: counts.TROP_ELEVEE, pct: counts.TROP_ELEVEE / total * 100, couleur: COULEURS_SNDE.TROP_ELEVEE },
    { key: 'AUTRE',       label: LIBELLE_SNDE.AUTRE,       count: counts.AUTRE,       pct: counts.AUTRE / total * 100,       couleur: COULEURS_SNDE.AUTRE },
    { key: 'AUCUNE',      label: LIBELLE_SNDE.AUCUNE,      count: counts.AUCUNE,      pct: counts.AUCUNE / total * 100,      couleur: COULEURS_SNDE.AUCUNE },
  ]
}

function abosParAnomalieSnde(abos, cat) {
  return abos.filter(a => {
    const lib = normLibAnom(a.anomalies)
    if (!lib) return cat === 'AUCUNE'
    return categorieAnomSnde(lib) === cat
  })
}

/**
 * Croisement Anomalie SNDE × Type de comptage.
 * Retourne un tableau d'objets prêts pour un graphique en barres empilées :
 *  [{ anomalie: 'Consommation Nulle', 'COMPTEUR ACCESSIBLE': 910, 'COMPTEUR INACCESSIBLE': 0, ... }]
 */
function croisementAnomalieEtat(abos) {
  const cats = ['NULLE', 'ELEVEE', 'TROP_ELEVEE']
  const etats = ['COMPTEUR ACCESSIBLE','COMPTEUR INACCESSIBLE','COMPTEUR ILLISIBLE',
                 'COMPTEUR BLOQUE','COMPTEUR DEFECTUEUX']

  // Initialiser la matrice
  const result = cats.map(c => {
    const row = { anomalie: LIBELLE_SNDE[c], _key: c, total: 0 }
    etats.forEach(e => { row[e] = 0 })
    return row
  })

  // Remplir
  for (const a of abos) {
    const lib = normLibAnom(a.anomalies)
    if (!lib) continue
    const cat = categorieAnomSnde(lib)
    if (!cats.includes(cat)) continue
    const etat = normEtat(a.etatComptage)
    const row = result.find(r => r._key === cat)
    if (!row) continue
    if (etats.includes(etat)) {
      row[etat]++
      row.total++
    }
  }
  return result
}

/* ============================================================ */

export default function ConsoPage({ abos, scope, onExport }) {
  const kpis    = useMemo(() => computeKPIs(abos), [abos])
  const dist    = useMemo(() => distributionConso(abos), [abos])
  const faibles = useMemo(() => consosFaibles(abos, 50), [abos])
  const tops    = useMemo(() => topConsommateurs(abos, 20), [abos])
  const vol     = useMemo(() => volumeEstimeVsReel(abos), [abos])

  // Analyse SNDE
  const anomSnde       = useMemo(() => compteAnomaliesSnde(abos), [abos])
  const totalSnde      = anomSnde.filter(a => a.key !== 'AUCUNE').reduce((s, a) => s + a.count, 0)
  const croisement     = useMemo(() => croisementAnomalieEtat(abos), [abos])

  const listeNulle      = useMemo(() => abosParAnomalieSnde(abos, 'NULLE'),       [abos])
  const listeElevee     = useMemo(() => abosParAnomalieSnde(abos, 'ELEVEE'),      [abos])
  const listeTropElevee = useMemo(() => abosParAnomalieSnde(abos, 'TROP_ELEVEE'), [abos])

  if (!kpis) return <EmptyState />

  // États effectivement présents dans le croisement (on n'affiche pas les colonnes vides)
  const etatsAffiches = ['COMPTEUR ACCESSIBLE','COMPTEUR INACCESSIBLE','COMPTEUR ILLISIBLE',
                         'COMPTEUR BLOQUE','COMPTEUR DEFECTUEUX']
                        .filter(e => croisement.some(row => row[e] > 0))

  return (
    <div className="space-y-6">
      <PageTitle title="Consommations & volumes" subtitle={`Analyse des volumes facturés et anomalies de consommation — ${scope}`} />

      {/* ================================================================
           PARTIE 1 — LOGIQUE INTERNE (Mamiya / Contrôle & Audit) — INCHANGÉE
         ================================================================ */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Conso moyenne" value={`${fmt(kpis.consoMoyenne, 1)} m³`}
                 sub={`Total : ${fmt(kpis.consoTotale)} m³`} icon={Droplet} tone="info" />
        <KpiCard label="Conso nulles" value={fmt(kpis.consoNulleCount)}
                 sub={`${pct(kpis.consoNulleCount / kpis.total)} · à investiguer`} icon={AlertTriangle}
                 tone={kpis.consoNulleCount / kpis.total > 0.15 ? 'danger' : 'warn'} />
        <KpiCard label="Conso faibles" value={fmt(kpis.consoFaibleCount)}
                 sub={`< ${SEUILS.CONSO_FAIBLE} m³ (hors zéro)`} icon={TrendingDown} tone="warn" />
        <KpiCard label="Conso élevées" value={fmt(kpis.consoElevee)}
                 sub={`Dont ≥ 100 m³ : ${fmt(kpis.consoTropElevee)}`} icon={TrendingUp}
                 tone={kpis.consoTropElevee > 0 ? 'danger' : 'warn'} />
      </div>

      <Card title="Distribution de la consommation (m³)"
            subtitle="Beaucoup de zéros / très faibles → suspicion de sous-déclaration, fuites cachées ou compteurs figés.">
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={dist} margin={{ top: 16, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {dist.map((d, i) => (
                  <Cell key={i} fill={d.label === '0' ? '#ef4444' : d.label === '1-5' ? '#f59e0b' : d.label === '>100' ? '#7c3aed' : '#2d79bd'} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Volume facturable : relevé vs estimé"
              subtitle="Plus la part estimée est forte, plus le risque de manque-à-gagner est élevé."
              className="lg:col-span-2">
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={[
                { type: 'Volume relevé', value: vol.volumeReleve, nb: vol.nbReleve },
                { type: 'Volume estimé', value: vol.volumeEstime, nb: vol.nbEstime },
              ]} margin={{ top: 16, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="type" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n, p) => [`${fmt(v)} m³ · ${fmt(p.payload.nb)} abos`, '']} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                  <LabelList dataKey="value" position="top" formatter={(v) => fmt(v)}
                             style={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Part estimée">
          <div className="text-center py-2">
            <p className="text-5xl font-bold text-amber-600">{vol.pctVolumeEstime.toFixed(1)}%</p>
            <p className="text-sm text-slate-500 mt-2">du volume total</p>
            <div className="mt-6 space-y-2 text-sm">
              <Row label="Total m³" value={fmt(vol.totalVolume)} />
              <Row label="Relevé" value={`${fmt(vol.volumeReleve)} m³`} cls="text-emerald-700" />
              <Row label="Estimé" value={`${fmt(vol.volumeEstime)} m³`} cls="text-amber-700" />
              <Row label="Abos estimés" value={`${fmt(vol.nbEstime)} (${vol.pctNbEstime.toFixed(1)}%)`} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Top 20 — plus grosses consommations"
              subtitle="Vérification ciblée recommandée (fuites, sous-comptage tarifaire)"
              action={<ExportBtn label="CSV" onClick={() => onExport(tops, 'top_consos')} />}>
          <div className="table-wrap" style={{ maxHeight: 380 }}>
            <table>
              <thead><tr>
                <th>Centre</th><th>Réf Abo</th><th className="text-right">Conso</th>
                <th className="text-right">Moy.</th><th>État</th><th>Tarif</th>
              </tr></thead>
              <tbody>
                {tops.map((a, i) => (
                  <tr key={i}>
                    <td className="text-xs">{a.centre}</td>
                    <td className="font-mono">{a.refAbo}</td>
                    <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                    <td className="text-right">{fmt(a.consMoyenne)}</td>
                    <td className="text-xs">{a.etatComptage}</td>
                    <td className="text-xs">{a.tarif}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`Consos faibles suspectes (${faibles.length})`}
              subtitle={`Accessibles mais < ${SEUILS.CONSO_FAIBLE} m³ — risque fuite/sous-déclaration`}
              action={<ExportBtn label="CSV" onClick={() => onExport(faibles, 'consos_faibles')} />}>
          {faibles.length === 0 ? <p className="text-sm text-slate-500 italic">Aucun cas.</p> : (
            <div className="table-wrap" style={{ maxHeight: 380 }}>
              <table>
                <thead><tr>
                  <th>Centre</th><th>Secteur</th><th>Réf Abo</th>
                  <th className="text-right">Conso</th><th className="text-right">Moy.</th><th>Tarif</th>
                </tr></thead>
                <tbody>
                  {faibles.map((a, i) => (
                    <tr key={i} className="warn">
                      <td className="text-xs">{a.centre}</td>
                      <td className="text-xs">{a.secteur}</td>
                      <td className="font-mono">{a.refAbo}</td>
                      <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                      <td className="text-right">{fmt(a.consMoyenne)}</td>
                      <td className="text-xs">{a.tarif}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ================================================================
           PARTIE 2 — LOGIQUE SNDE (colonne brute du fichier)
         ================================================================ */}

      <div className="mt-10 pt-6 border-t-2 border-dashed border-slate-100">
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <ListChecks size={22} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-amber-900 mb-1">
                Anomalies déclarées selon la colonne « Anomalies »
              </h2>
              <p className="text-sm text-amber-800 leading-relaxed">
                
              </p>
            </div>
          </div>
        </div>

        {/* KPI synthétique SNDE */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total anomalies SNDE"
                   value={fmt(totalSnde)}
                   sub={`${pct(totalSnde / kpis.total)} des abonnés`}
                   icon={FileBarChart}
                   tone={totalSnde > 0 ? 'warn' : 'good'} />
          <KpiCard label="Conso. Nulle (SNDE)"
                   value={fmt(anomSnde.find(a => a.key === 'NULLE')?.count || 0)}
                   sub="Consommation = 0 dans le fichier"
                   icon={CircleDashed} tone="danger" />
          <KpiCard label="Conso. élevée (SNDE)"
                   value={fmt(anomSnde.find(a => a.key === 'ELEVEE')?.count || 0)}
                   sub="Libellée 'élevée' par SNDE"
                   icon={TrendingUp} tone="warn" />
          <KpiCard label="Conso. trop élevée (SNDE)"
                   value={fmt(anomSnde.find(a => a.key === 'TROP_ELEVEE')?.count || 0)}
                   sub="Libellée 'trop élevée' par SNDE"
                   icon={AlertTriangle} tone="danger" />
        </div>

        {/* GRAPHIQUE BARRES : Volume par modalité SNDE (vue simple) */}
        <Card title="Volume par modalité SNDE"
              subtitle="Nombre d'abonnés concernés par chaque libellé déclaré par SNDE.">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={anomSnde.filter(a => a.key !== 'AUCUNE')} layout="vertical"
                        margin={{ left: 50, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="label" type="category" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n, p) => [`${fmt(v)} (${p.payload.pct.toFixed(1)}%)`, 'Nombre']} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {anomSnde.filter(a => a.key !== 'AUCUNE').map((e, i) => <Cell key={i} fill={e.couleur} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#334155' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

                {/* GRAPHIQUE CROISÉ : Anomalies SNDE × Type de comptage (barres empilées) */}
        <Card title="Croisement : Anomalie SNDE × Type de comptage"
              subtitle="Pour chaque anomalie déclarée par SNDE, voyez la répartition par état du compteur. Permet de comprendre dans quelles conditions SNDE pose chaque libellé.">
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <BarChart data={croisement} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="anomalie" tick={{ fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => [fmt(v), SHORT_ETAT[n] || n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => SHORT_ETAT[v] || v} />
                {etatsAffiches.map(e => (
                  <Bar key={e} dataKey={e} stackId="a" fill={COULEURS_ETAT[e]} radius={[0, 0, 0, 0]}>
                    <LabelList dataKey={e}
                               position="center"
                               formatter={(v) => v > 30 ? fmt(v) : ''}
                               style={{ fontSize: 11, fill: '#fff', fontWeight: 600 }} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Tableau croisé chiffré (sous le graphique) */}
        <Card title="Tableau croisé Anomalie × Type de comptage"
              subtitle="Valeurs exactes du croisement — nombre d'abonnés par couple (anomalie, état)."
              action={<ExportBtn label="CSV" onClick={() => onExport(croisement, 'croisement_anomalie_etat')} />}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Anomalie SNDE</th>
                  {etatsAffiches.map(e => (
                    <th key={e} className="text-right" style={{ color: COULEURS_ETAT[e] }}>
                      {SHORT_ETAT[e]}
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {croisement.map((row, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{row.anomalie}</td>
                    {etatsAffiches.map(e => {
                      const v = row[e] || 0
                      const p = row.total > 0 ? (v / row.total * 100).toFixed(0) : 0
                      return (
                        <td key={e} className="text-right">
                          {v > 0 ? (
                            <span>
                              <span className="font-semibold">{fmt(v)}</span>
                              <span className="text-xs text-slate-400 ml-1">({p}%)</span>
                            </span>
                          ) : '—'}
                        </td>
                      )
                    })}
                    <td className="text-right font-bold">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Trois listes détaillées */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <Card title={`SNDE · Conso Nulle (${listeNulle.length})`}
                subtitle="Tag direct de la colonne Anomalies."
                action={<ExportBtn label="CSV" onClick={() => onExport(listeNulle, 'snde_conso_nulle')} />}>
            {listeNulle.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Aucun cas.</p>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table>
                  <thead><tr>
                    <th>Réf Abo</th>
                    <th className="text-right">Conso</th>
                    <th className="text-right">Moy.</th>
                    <th>État</th>
                  </tr></thead>
                  <tbody>
                    {listeNulle.slice(0, 100).map((a, i) => (
                      <tr key={i} className="alert">
                        <td className="font-mono text-xs">{a.refAbo}</td>
                        <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                        <td className="text-right">{fmt(a.consMoyenne)}</td>
                        <td className="text-xs">{a.etatComptage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listeNulle.length > 100 && (
                  <p className="text-xs text-slate-500 p-2 bg-slate-50 border-t">
                    100 premières lignes — exportez pour les {listeNulle.length} cas.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title={`SNDE · Conso élevée (${listeElevee.length})`}
                subtitle="Tag direct de la colonne Anomalies."
                action={<ExportBtn label="CSV" onClick={() => onExport(listeElevee, 'snde_conso_elevee')} />}>
            {listeElevee.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Aucun cas.</p>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table>
                  <thead><tr>
                    <th>Réf Abo</th>
                    <th className="text-right">Conso</th>
                    <th className="text-right">Moy.</th>
                    <th>État</th>
                  </tr></thead>
                  <tbody>
                    {listeElevee.slice(0, 100).map((a, i) => (
                      <tr key={i} className="warn">
                        <td className="font-mono text-xs">{a.refAbo}</td>
                        <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                        <td className="text-right">{fmt(a.consMoyenne)}</td>
                        <td className="text-xs">{a.etatComptage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listeElevee.length > 100 && (
                  <p className="text-xs text-slate-500 p-2 bg-slate-50 border-t">
                    100 premières lignes — exportez pour les {listeElevee.length} cas.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title={`SNDE · Conso trop élevée (${listeTropElevee.length})`}
                subtitle="Tag direct de la colonne Anomalies."
                action={<ExportBtn label="CSV" onClick={() => onExport(listeTropElevee, 'snde_conso_trop_elevee')} />}>
            {listeTropElevee.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Aucun cas.</p>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table>
                  <thead><tr>
                    <th>Réf Abo</th>
                    <th className="text-right">Conso</th>
                    <th className="text-right">Moy.</th>
                    <th>État</th>
                  </tr></thead>
                  <tbody>
                    {listeTropElevee.slice(0, 100).map((a, i) => (
                      <tr key={i} className="alert">
                        <td className="font-mono text-xs">{a.refAbo}</td>
                        <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                        <td className="text-right">{fmt(a.consMoyenne)}</td>
                        <td className="text-xs">{a.etatComptage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listeTropElevee.length > 100 && (
                  <p className="text-xs text-slate-500 p-2 bg-slate-50 border-t">
                    100 premières lignes — exportez pour les {listeTropElevee.length} cas.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Note méthodologique */}
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
            <ListChecks size={18} className="text-slate-600" />
            
          </h3>
 
        </div>

      </div>
    </div>
  )
}

function Row({ label, value, cls = '' }) {
  return (
    <div className={`flex justify-between ${cls}`}>
      <span>{label}</span><span className="font-semibold">{value}</span>
    </div>
  )
}
