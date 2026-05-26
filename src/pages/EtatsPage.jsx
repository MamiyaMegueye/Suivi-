import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'
import { Card } from '../components/Card.jsx'
import KpiCard from '../components/KpiCard.jsx'
import { CheckCircle2, XCircle, Eye, Lock, Wrench } from 'lucide-react'
import { computeKPIs, repartitionEtats, syntheseParSecteur } from '../lib/analytics.js'
import { PageTitle, ExportBtn, EmptyState } from '../components/PageShared.jsx'
import { fmt, pct, colorForAccess, COLORS_ETAT } from '../lib/format.js'

const ETAT_META = {
  'COMPTEUR ACCESSIBLE':   { icon: CheckCircle2, tone: 'good',    short: 'Accessible' },
  'COMPTEUR INACCESSIBLE': { icon: XCircle,      tone: 'warn',    short: 'Inaccessible' },
  'COMPTEUR ILLISIBLE':    { icon: Eye,          tone: 'warn',    short: 'Illisible' },
  'COMPTEUR BLOQUE':       { icon: Lock,         tone: 'danger',  short: 'Bloqué' },
  'COMPTEUR DEFECTUEUX':   { icon: Wrench,       tone: 'danger',  short: 'Défectueux' },
  'AUTRE':                 { icon: XCircle,      tone: 'default', short: 'Autre' },
}

export default function EtatsPage({ abos, scope, onExport }) {
  const kpis = useMemo(() => computeKPIs(abos), [abos])
  const etats = useMemo(() => repartitionEtats(abos), [abos])
  const secteurs = useMemo(() => syntheseParSecteur(abos, null), [abos])

  if (!kpis) return <EmptyState />

  return (
    <div className="space-y-6">
      <PageTitle title="États de comptage" subtitle={`Diagnostic d'accès terrain — ${scope}`} />

      {/* Cartes par état */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {etats.map((e) => {
          const m = ETAT_META[e.etat] || ETAT_META['AUTRE']
          return (
            <KpiCard key={e.etat} label={m.short} value={fmt(e.count)}
                     sub={`${e.pct.toFixed(1)} % du total`} icon={m.icon} tone={m.tone} />
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camembert */}
        <Card title="Répartition par état de comptage" subtitle="Part de chaque modalité">
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={etats} dataKey="count" nameKey="etat" cx="42%" cy="50%" outerRadius={105}
                     label={(e) => `${e.pct.toFixed(0)}%`}>
                  {etats.map((e, i) => <Cell key={i} fill={COLORS_ETAT[e.etat] || '#94a3b8'} />)}
                </Pie>
                <Tooltip formatter={(v, n, p) => [`${fmt(v)} (${p.payload.pct.toFixed(1)}%)`, p.payload.etat]} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Barres */}
        <Card title="Volume par état" subtitle="Beaucoup de bloqués/inaccessibles = problème terrain">
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={etats} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="etat" type="category" width={130}
                       tickFormatter={(v) => (ETAT_META[v]?.short || v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n, p) => [`${fmt(v)} (${p.payload.pct.toFixed(1)}%)`, 'Nombre']} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {etats.map((e, i) => <Cell key={i} fill={COLORS_ETAT[e.etat] || '#94a3b8'} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#334155' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Détail par secteur */}
      <Card
        title={`État de comptage par secteur (${secteurs.length})`}
        subtitle="Repérez les secteurs où l'accès terrain est dégradé"
        action={<ExportBtn onClick={() => onExport(secteurs.map(s => ({
          centre: s.centre, secteur: s.secteur, abonnes: s.total,
          accessible: s.accessible, tauxAccess: (s.tauxAccess * 100).toFixed(1),
          nonReleves: s.nonReleves,
        })), 'etats_par_secteur')} />}
      >
        <div className="table-wrap" style={{ maxHeight: 500 }}>
          <table>
            <thead>
              <tr>
                <th>Centre</th>
                <th>Secteur</th>
                <th className="text-right">Abonnés</th>
                <th className="text-right">Accessible</th>
                <th className="text-right">Taux acc.</th>
                <th className="text-right">Non relevés</th>
              </tr>
            </thead>
            <tbody>
              {secteurs.map((s, i) => (
                <tr key={i} className={s.tauxAccess < 0.7 ? 'warn' : ''}>
                  <td className="text-xs">{s.centre}</td>
                  <td className="font-medium">{s.secteur}</td>
                  <td className="text-right">{fmt(s.total)}</td>
                  <td className="text-right">{fmt(s.accessible)}</td>
                  <td className={`text-right font-semibold ${colorForAccess(s.tauxAccess)}`}>{pct(s.tauxAccess)}</td>
                  <td className="text-right">{fmt(s.nonReleves)} ({pct(s.tauxNonReleve)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
