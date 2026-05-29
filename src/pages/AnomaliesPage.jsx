import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell,
} from 'recharts'
import { Card } from '../components/Card.jsx'
import { AlertTriangle, ShieldAlert, Filter } from 'lucide-react'
import {
  comptageAnomalies, abosAvecAnomalie, CATALOGUE_ANOMALIES, GRAVITE_COLOR,
} from '../lib/analytics.js'
import { PageTitle, ExportBtn, EmptyState } from '../components/PageShared.jsx'
import { fmt } from '../lib/format.js'

const GRAVITE_BADGE = {
  haute:   { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Haute' },
  moyenne: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Moyenne' },
  basse:   { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Basse' },
}

export default function AnomaliesPage({ abos, scope, onExport }) {
  const comptage = useMemo(() => comptageAnomalies(abos), [abos])
  const [selected, setSelected] = useState('TOUTES')

  const listeFiltree = useMemo(() => {
    if (selected === 'TOUTES') return abosAvecAnomalie(abos)
    return abosAvecAnomalie(abos, selected)
  }, [abos, selected])

  const totalAvecAnom = useMemo(() => abosAvecAnomalie(abos).length, [abos])

  if (abos.length === 0) return <EmptyState />

  const selectedDef = CATALOGUE_ANOMALIES.find(d => d.key === selected)

  return (
    <div className="space-y-6">
      <PageTitle title="Anomalies & audit ciblé"
                 subtitle={`Détection automatique des incohérences exploitables pour le contrôle — ${scope}`} />

      {/* Bandeau résumé */}
      <div className="bg-gradient-to-r from-snde-900 to-snde-700 rounded-xl p-5 text-white flex items-center gap-5">
        <div className="bg-white/10 p-3 rounded-xl">
          <ShieldAlert size={28} className="text-cyan-200" />
        </div>
        <div>
          <p className="text-3xl font-bold">{fmt(totalAvecAnom)}</p>
          <p className="text-sm text-cyan-100">
            abonnement(s) présentant au moins une anomalie ·
            <span className="font-semibold"> {((totalAvecAnom / abos.length) * 100).toFixed(1)} %</span> de la population analysée
          </p>
        </div>
      </div>

      {/* Graphique des anomalies */}
      <Card title="Anomalies détectées par type" subtitle="Cliquez sur une barre du graphique ou une ligne du tableau ci-dessous pour filtrer la liste détaillée">
        <div style={{ width: '100%', height: 520 }}>
          <ResponsiveContainer>
            <BarChart data={comptage} layout="vertical" margin={{ left: 20, right: 50, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis dataKey="label" type="category" width={230} tick={{ fontSize: 11 }} interval={0} />
              <Tooltip formatter={(v, n, p) => [`${fmt(v)} (${p.payload.pct.toFixed(1)}%)`, 'Cas']} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} cursor="pointer"
                   onClick={(d) => setSelected(d.key)}>
                {comptage.map((c, i) => <Cell key={i} fill={GRAVITE_COLOR[c.gravite]} />)}
                <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tableau de référence des anomalies */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-snde-700" />
            Catalogue des 15 anomalies détectées — signification et résultats
          </span>
        }
        subtitle="Cliquez sur une ligne pour filtrer la liste détaillée plus bas. Les gravités hautes signalent les cas à investiguer en priorité."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '220px' }}>Libellé</th>
                <th>Signification &amp; intérêt pour le contrôle</th>
                <th className="text-right" style={{ width: '80px' }}>Cas</th>
                <th className="text-right" style={{ width: '70px' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {comptage.map((c) => {
                const isSel = selected === c.key
                const hasCases = c.count > 0
                return (
                  <tr
                    key={c.key}
                    onClick={() => setSelected(isSel ? 'TOUTES' : c.key)}
                    style={{ cursor: 'pointer' }}
                    className={isSel ? 'bg-snde-50' : ''}
                  >
                    <td className="font-semibold text-slate-800 text-sm leading-tight">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: GRAVITE_COLOR[c.gravite] }}
                        />
                        {c.label}
                      </div>
                    </td>
                    <td className="text-xs text-slate-600 leading-relaxed py-2">
                      {c.desc}
                    </td>
                    <td className={`text-right font-bold text-base tabular-nums ${hasCases ? 'text-slate-800' : 'text-slate-300'}`}>
                      {fmt(c.count)}
                    </td>
                    <td className={`text-right text-xs tabular-nums ${hasCases ? 'text-snde-600 font-medium' : 'text-slate-300'}`}>
                      {c.pct.toFixed(1)} %
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GRAVITE_COLOR.haute }}></span>
            Gravité haute — enquête prioritaire
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GRAVITE_COLOR.moyenne }}></span>
            Gravité moyenne — vérification &amp; régularisation
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GRAVITE_COLOR.basse }}></span>
            Gravité basse — signal faible
          </span>
        </div>
      </Card>

      {/* Liste détaillée */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Filter size={16} className="text-snde-600" />
            {selected === 'TOUTES'
              ? `Tous les abonnements avec anomalie (${listeFiltree.length})`
              : `${selectedDef?.label} (${listeFiltree.length})`}
          </span>
        }
        subtitle={selected === 'TOUTES'
          ? 'Filtrez par type en cliquant sur une ligne du tableau ci-dessus'
          : selectedDef?.desc}
        action={
          <div className="flex items-center gap-2">
            {selected !== 'TOUTES' && (
              <button onClick={() => setSelected('TOUTES')}
                      className="text-xs text-snde-600 hover:text-snde-800 underline">Tout afficher</button>
            )}
            <ExportBtn label="CSV" onClick={() => onExport(listeFiltree, selected === 'TOUTES' ? 'anomalies_toutes' : `anomalie_${selected.toLowerCase()}`)} />
          </div>
        }
      >
        {listeFiltree.length === 0 ? (
          <p className="text-emerald-700 text-sm">✓ Aucun cas pour ce filtre.</p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 460 }}>
            <table>
              <thead><tr>
                <th>Centre</th><th>Secteur</th><th>Réf Abo</th><th>N° Compteur</th>
                <th className="text-right">Anc.</th><th className="text-right">Nv.</th>
                <th className="text-right">Conso</th><th>État</th><th>Tarif</th>
                <th>Anomalies détectées</th><th>Matricule</th>
              </tr></thead>
              <tbody>
                {listeFiltree.slice(0, 300).map((a, i) => (
                  <tr key={i} className="alert">
                    <td className="text-xs">{a.centre}</td>
                    <td className="text-xs">{a.secteur}</td>
                    <td className="font-mono">{a.refAbo}</td>
                    <td className="font-mono">{a.numCompteur || '—'}</td>
                    <td className="text-right">{fmt(a.ancienIndex)}</td>
                    <td className="text-right">{fmt(a.nouvelIndex)}</td>
                    <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                    <td className="text-xs">{a.etatComptage}</td>
                    <td className="text-xs">{a.tarif || '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {a.flags.map(f => {
                          const def = CATALOGUE_ANOMALIES.find(d => d.key === f)
                          if (!def) return null
                          return (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                                  style={{ backgroundColor: GRAVITE_COLOR[def.gravite] }}>
                              {def.label}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="font-mono text-xs">{a.matricule || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listeFiltree.length > 300 && (
              <p className="text-xs text-slate-500 p-3 bg-slate-50 border-t">
                Affichage limité à 300 lignes — exportez le CSV pour la liste complète ({listeFiltree.length} cas).
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
