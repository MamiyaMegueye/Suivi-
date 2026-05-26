import { useMemo } from 'react'
import { Card } from '../components/Card.jsx'
import { analyseReleveurs } from '../lib/analytics.js'
import { PageTitle, ExportBtn, EmptyState } from '../components/PageShared.jsx'
import { fmt, pct, colorForAccess } from '../lib/format.js'

export default function ReleveursPage({ abos, scope, onExport }) {
  const releveurs = useMemo(() => analyseReleveurs(abos), [abos])
  if (abos.length === 0) return <EmptyState />

  return (
    <div className="space-y-6">
      <PageTitle title="Performance des releveurs"
                 subtitle={`Comparaison par matricule — beaucoup de bloqués/illisibles ou d'index figés peuvent signaler un travail bâclé — ${scope}`} />

      <Card
        title={`Releveurs analysés (${releveurs.length})`}
        subtitle="Taux d'accessibilité, anomalies et consommation moyenne par agent"
        action={<ExportBtn onClick={() => onExport(releveurs.map(r => ({
          matricule: r.matricule, centres: r.nbCentres, secteurs: r.nbSecteurs,
          total: r.total, accessible: r.accessible,
          tauxAccess: (r.tauxAccess * 100).toFixed(1),
          inaccessible: r.inaccessible, illisible: r.illisible, bloque: r.bloque,
          consoNulle: r.consoNulle, consoFaible: r.consoFaible,
          indexFige: r.indexFige, incoherences: r.incoherences,
          consoMoyenne: r.consoMoyenne.toFixed(1),
        })), 'performance_releveurs')} />}
      >
        <div className="table-wrap" style={{ maxHeight: 600 }}>
          <table>
            <thead>
              <tr>
                <th>Matricule</th>
                <th className="text-right">Centres</th>
                <th className="text-right">Secteurs</th>
                <th className="text-right">Total</th>
                <th className="text-right">Accessible</th>
                <th className="text-right">Taux acc.</th>
                <th className="text-right">Inacc.</th>
                <th className="text-right">Illisible</th>
                <th className="text-right">Bloqué</th>
                <th className="text-right">Conso nulle</th>
                <th className="text-right">Index figé</th>
                <th className="text-right">Incohér.</th>
                <th className="text-right">Conso moy.</th>
              </tr>
            </thead>
            <tbody>
              {releveurs.map(r => (
                <tr key={r.matricule}>
                  <td className="font-mono font-semibold">{r.matricule}</td>
                  <td className="text-right">{r.nbCentres}</td>
                  <td className="text-right">{r.nbSecteurs}</td>
                  <td className="text-right">{fmt(r.total)}</td>
                  <td className="text-right">{fmt(r.accessible)}</td>
                  <td className={`text-right font-semibold ${colorForAccess(r.tauxAccess)}`}>{pct(r.tauxAccess)}</td>
                  <td className="text-right">{fmt(r.inaccessible)}</td>
                  <td className="text-right">{fmt(r.illisible)}</td>
                  <td className={`text-right ${r.bloque > 0 ? 'text-red-700 font-semibold' : ''}`}>{fmt(r.bloque)}</td>
                  <td className="text-right">{fmt(r.consoNulle)}</td>
                  <td className={`text-right ${r.indexFige > 0 ? 'text-red-700 font-semibold' : ''}`}>{fmt(r.indexFige)}</td>
                  <td className={`text-right ${r.incoherences > 0 ? 'text-red-700 font-semibold' : ''}`}>{fmt(r.incoherences)}</td>
                  <td className="text-right">{fmt(r.consoMoyenne, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
