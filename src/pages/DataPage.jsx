import { useMemo, useState } from 'react'
import { Card } from '../components/Card.jsx'
import { Search } from 'lucide-react'
import { analyseTarifs, computeKPIs } from '../lib/analytics.js'
import { PageTitle, ExportBtn, EmptyState } from '../components/PageShared.jsx'
import { fmt } from '../lib/format.js'

export default function DataPage({ abos, scope, onExport }) {
  const kpis = useMemo(() => computeKPIs(abos), [abos])
  const tarifs = useMemo(() => analyseTarifs(abos), [abos])
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q.trim()) return abos
    const needle = q.toLowerCase()
    return abos.filter(a =>
      (a.refAbo || '').toLowerCase().includes(needle) ||
      (a.numCompteur || '').toLowerCase().includes(needle) ||
      (a.matricule || '').toLowerCase().includes(needle) ||
      (a.secteur || '').toLowerCase().includes(needle)
    )
  }, [abos, q])

  if (!kpis) return <EmptyState />

  return (
    <div className="space-y-6">
      <PageTitle title="Données détaillées" subtitle={`Répartition tarifaire et table complète des abonnements — ${scope}`} />

      {/* Tarifs */}
      <Card title="Répartition par tarif" subtitle="Volumes par catégorie tarifaire"
            action={<ExportBtn label="CSV" onClick={() => onExport(tarifs, 'tarifs')} />}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Tarif</th><th className="text-right">Nb abos</th><th className="text-right">Part %</th>
              <th className="text-right">Conso totale (m³)</th><th className="text-right">Conso moy. (m³)</th>
            </tr></thead>
            <tbody>
              {tarifs.map(t => (
                <tr key={t.tarif}>
                  <td className="font-medium">{t.tarif}</td>
                  <td className="text-right">{fmt(t.count)}</td>
                  <td className="text-right">{((t.count / kpis.total) * 100).toFixed(1)} %</td>
                  <td className="text-right">{fmt(t.consoTotale)}</td>
                  <td className="text-right">{fmt(t.consoMoyenne, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Table complète */}
      <Card
        title={`Table des abonnements (${filtered.length})`}
        subtitle="Recherche par réf abonné, n° compteur, matricule ou secteur"
        action={<ExportBtn label="Export complet" onClick={() => onExport(filtered, 'export_complet')} />}
      >
        <div className="mb-4 relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-snde-500 focus:bg-white"
          />
        </div>
        <div className="table-wrap" style={{ maxHeight: 600 }}>
          <table>
            <thead><tr>
              <th>Centre</th><th>Secteur</th><th>Réf Abo</th><th>N° Compteur</th>
              <th className="text-right">Anc.</th><th className="text-right">Nv.</th>
              <th className="text-right">Diff.</th><th className="text-right">Conso</th>
              <th>Type</th><th>État</th><th>Tarif</th><th>Matricule</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 500).map((a, i) => (
                <tr key={i} className={a.flags.length > 0 ? 'warn' : ''}>
                  <td className="text-xs">{a.centre}</td>
                  <td className="text-xs">{a.secteur}</td>
                  <td className="font-mono">{a.refAbo}</td>
                  <td className="font-mono">{a.numCompteur || '—'}</td>
                  <td className="text-right">{fmt(a.ancienIndex)}</td>
                  <td className="text-right">{fmt(a.nouvelIndex)}</td>
                  <td className="text-right">{fmt(a.diffIndex)}</td>
                  <td className="text-right font-semibold">{fmt(a.consoRetenue ?? a.consommation)}</td>
                  <td className="text-xs">{a.typeConso}</td>
                  <td className="text-xs">{a.etatComptage}</td>
                  <td className="text-xs">{a.tarif || '—'}</td>
                  <td className="font-mono text-xs">{a.matricule || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <p className="text-xs text-slate-500 p-3 bg-slate-50 border-t">
              Affichage limité à 500 lignes — exportez pour la liste complète ({filtered.length} lignes).
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
