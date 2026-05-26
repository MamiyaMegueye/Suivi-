import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ArrowRight, Users, Gauge, FileWarning, AlertTriangle } from 'lucide-react'
import { Card } from '../components/Card.jsx'
import KpiCard from '../components/KpiCard.jsx'
import { PageTitle, ExportBtn } from '../components/PageShared.jsx'
import { computeKPIs, syntheseParCentre, syntheseParSecteur } from '../lib/analytics.js'
import { fmt, pct, colorForAccess } from '../lib/format.js'

export default function OverviewPage({ abonnements, meta, onExport, onDrillCentre }) {
  const kpis = useMemo(() => computeKPIs(abonnements), [abonnements])
  const centres = useMemo(() => syntheseParCentre(abonnements), [abonnements])
  // Pour le top secteurs, on trie par nombre d'anomalies graves décroissant
  const secteurs = useMemo(() => {
    const all = syntheseParSecteur(abonnements, null)
    return [...all].sort((a, b) => {
      const anomA = a.indexFige + a.fantome + a.doublon + a.indexRegressif + a.sautBrutal + a.consoEqMoyenne
      const anomB = b.indexFige + b.fantome + b.doublon + b.indexRegressif + b.sautBrutal + b.consoEqMoyenne
      return anomB - anomA
    })
  }, [abonnements])

  const totalAnomGraves =
    kpis.indexFigeCount + kpis.indexRegressifCount + kpis.fantomeCount + kpis.doublonCount

  return (
    <div className="space-y-6">
      <PageTitle
        title="Vue d'ensemble"
        subtitle="Synthèse globale par centre et par secteur"
      />

      {/* KPI globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Abonnements" value={fmt(kpis.total)} sub={`${meta.nbCentres} centres · ${meta.nbSections} secteurs`} icon={Users} tone="info" />
        <KpiCard label="Taux d'accessibilité" value={pct(kpis.tauxAccessibilite)}
                 sub={`${fmt(kpis.accessible)} compteurs accessibles`} icon={Gauge}
                 tone={kpis.tauxAccessibilite >= 0.85 ? 'good' : kpis.tauxAccessibilite >= 0.7 ? 'warn' : 'danger'} />
        <KpiCard label="Compteurs non relevés" value={fmt(kpis.nonReleves)}
                 sub={`${pct(kpis.tauxNonReleve)} (estimés)`} icon={FileWarning}
                 tone={kpis.tauxNonReleve >= 0.2 ? 'danger' : 'warn'} />
        <KpiCard label="Anomalies graves" value={fmt(totalAnomGraves)}
                 sub="Figés · régressifs · fantômes · doublons" icon={AlertTriangle}
                 tone={totalAnomGraves > 0 ? 'danger' : 'good'} />
      </div>

      {/* Tableau par centre */}
      <Card
        title={`Synthèse par centre (${centres.length})`}
        subtitle="Cliquez sur un centre pour explorer ses états de comptage en détail."
        action={
          <ExportBtn onClick={() => onExport(centres.map(c => ({
            centre: c.centre, secteurs: c.nbSecteurs, abonnes: c.total,
            tauxAccess: (c.tauxAccess * 100).toFixed(1),
            nonReleves: c.nonReleves, consoNulle: c.consoNulle,
            indexFige: c.indexFige, fantome: c.fantome, doublon: c.doublon,
          })), 'synthese_centres')} />
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Centre</th>
                <th className="text-right">Secteurs</th>
                <th className="text-right">Abonnés</th>
                <th className="text-right">Taux acc.</th>
                <th className="text-right">Non relevés</th>
                <th className="text-right">Conso nulles</th>
                <th className="text-right">Anom. graves</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {centres.map((c) => {
                const anomTotal = c.indexFige + c.fantome + c.doublon + c.indexRegressif
                return (
                  <tr key={c.centre} style={{ cursor: 'pointer' }} onClick={() => onDrillCentre(c.centre)}>
                    <td className="font-semibold">{c.centre}</td>
                    <td className="text-right">{c.nbSecteurs}</td>
                    <td className="text-right">{fmt(c.total)}</td>
                    <td className={`text-right font-semibold ${colorForAccess(c.tauxAccess)}`}>{pct(c.tauxAccess)}</td>
                    <td className="text-right">{fmt(c.nonReleves)}</td>
                    <td className="text-right">{fmt(c.consoNulle)}</td>
                    <td className={`text-right font-semibold ${anomTotal > 0 ? 'text-red-700' : ''}`}>
                      {fmt(anomTotal)}
                    </td>
                    <td className="text-snde-600"><ArrowRight size={15} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Comparaison visuelle */}
      {meta.nbCentres > 1 && (
        <Card title="Comparaison des centres" subtitle="Volume d'abonnements et taux d'accessibilité">
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <BarChart data={centres} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="centre" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={80} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 1]}
                       tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => n === "Taux d'accessibilité" ? pct(v) : fmt(v)} />
                <Legend />
                <Bar yAxisId="left" dataKey="total" fill="#1f5e9b" name="Nb abonnements" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="right" dataKey="tauxAccess" fill="#06b6d4" name="Taux d'accessibilité" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Top 10 secteurs avec le plus d'anomalies */}
      <Card
        title="Secteurs avec le plus d'anomalies graves"
        subtitle="Les 10 secteurs comptant le plus de cas (figés, régressifs, fantômes, doublons, sauts brutaux, conso = moyenne)"
        action={<ExportBtn label="Tous les secteurs" onClick={() => onExport(secteurs.map(s => ({
          centre: s.centre, secteur: s.secteur,
          abonnes: s.total, tauxAccess: (s.tauxAccess * 100).toFixed(1),
          nonReleves: s.nonReleves, consoNulle: s.consoNulle,
          indexFige: s.indexFige, fantome: s.fantome, doublon: s.doublon,
          sautBrutal: s.sautBrutal, consoEqMoyenne: s.consoEqMoyenne,
        })), 'synthese_secteurs')} />}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Centre</th>
                <th>Secteur</th>
                <th className="text-right">Abonnés</th>
                <th className="text-right">Taux acc.</th>
                <th className="text-right">Non relevés</th>
                <th className="text-right">Conso nulles</th>
                <th className="text-right">Anom. graves</th>
              </tr>
            </thead>
            <tbody>
              {secteurs.slice(0, 10).map((s, i) => {
                const anomTotal = s.indexFige + s.fantome + s.doublon + s.indexRegressif + s.sautBrutal + s.consoEqMoyenne
                return (
                  <tr key={i}>
                    <td className="text-xs">{s.centre}</td>
                    <td className="font-medium">{s.secteur}</td>
                    <td className="text-right">{fmt(s.total)}</td>
                    <td className={`text-right font-semibold ${colorForAccess(s.tauxAccess)}`}>{pct(s.tauxAccess)}</td>
                    <td className="text-right">{fmt(s.nonReleves)}</td>
                    <td className="text-right">{fmt(s.consoNulle)}</td>
                    <td className={`text-right font-semibold ${anomTotal > 0 ? 'text-red-700' : ''}`}>
                      {fmt(anomTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
