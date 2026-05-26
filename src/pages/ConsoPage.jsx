import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Cell,
} from 'recharts'
import { Card } from '../components/Card.jsx'
import KpiCard from '../components/KpiCard.jsx'
import { Droplet, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import {
  computeKPIs, distributionConso, consosFaibles, topConsommateurs,
  volumeEstimeVsReel, SEUILS,
} from '../lib/analytics.js'
import { PageTitle, ExportBtn, EmptyState } from '../components/PageShared.jsx'
import { fmt, pct } from '../lib/format.js'

export default function ConsoPage({ abos, scope, onExport }) {
  const kpis = useMemo(() => computeKPIs(abos), [abos])
  const dist = useMemo(() => distributionConso(abos), [abos])
  const faibles = useMemo(() => consosFaibles(abos, 50), [abos])
  const tops = useMemo(() => topConsommateurs(abos, 20), [abos])
  const vol = useMemo(() => volumeEstimeVsReel(abos), [abos])

  if (!kpis) return <EmptyState />

  return (
    <div className="space-y-6">
      <PageTitle title="Consommations & volumes" subtitle={`Analyse des volumes facturés et anomalies de consommation — ${scope}`} />

      {/* KPI conso */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Conso moyenne" value={`${fmt(kpis.consoMoyenne, 1)} m³`}
                 sub={`Total : ${fmt(kpis.consoTotale)} m³`} icon={Droplet} tone="info" />
        <KpiCard label="Conso nulles" value={fmt(kpis.consoNulleCount)}
                 sub={`${pct(kpis.consoNulleCount / kpis.total)} · à investiguer`} icon={AlertTriangle}
                 tone={kpis.consoNulleCount / kpis.total > 0.15 ? 'danger' : 'warn'} />
        <KpiCard label="Conso faibles" value={fmt(kpis.consoFaibleCount)}
                 sub={`< ${SEUILS.CONSO_FAIBLE} m³ (hors zéro)`} icon={TrendingDown} tone="warn" />
        <KpiCard label="Conso élevées" value={fmt(kpis.consoElevee)}
                 sub={`Dont ≥ 300 m³ : ${fmt(kpis.consoTropElevee)}`} icon={TrendingUp}
                 tone={kpis.consoTropElevee > 0 ? 'danger' : 'warn'} />
      </div>

      {/* Distribution */}
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
                  <Cell key={i} fill={d.label === '0' ? '#ef4444' : d.label === '1-5' ? '#f59e0b' : d.label === '>300' ? '#7c3aed' : '#2d79bd'} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Volume estimé vs relevé */}
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

      {/* Top consos + faibles */}
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
