import { useState, useRef } from 'react';
import { parseMutationFile } from '../lib/parserMutation';

// ── Helpers ──────────────────────────────────────────────────────────────────
const pct = (n, total) => total ? ((n / total) * 100).toFixed(1) : '0.0';

const GRAVITE_COLOR = {
  Haute:   'bg-red-100 text-red-700 border border-red-200',
  Moyenne: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  Faible:  'bg-blue-100 text-blue-700 border border-blue-200',
};

const TYPE_DEMANDE_COLOR = {
  'Mutation':              'bg-indigo-100 text-indigo-700',
  'Réabonnement':          'bg-green-100 text-green-700',
  'Résiliation':           'bg-red-100 text-red-700',
  'Nouveau Branchement':   'bg-purple-100 text-purple-700',
  'Reprise de Branchement':'bg-orange-100 text-orange-700',
};

function KpiCard({ label, value, sub, color = 'text-indigo-600' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function PctBar({ label, n, total, color = 'bg-indigo-500' }) {
  const p = pct(n, total);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className="font-semibold text-gray-700">{n} <span className="text-gray-400">({p}%)</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function MutationsPage() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filterGravite, setFilterGravite] = useState('Toutes');
  const [filterRegle, setFilterRegle]     = useState('Toutes');
  const inputRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await parseMutationFile(file);
      setData(result);
      setActiveTab('overview');
    } catch (e) {
      setError('Impossible de lire le fichier. Vérifiez qu\'il s\'agit bien d\'un état Mutation SNDE.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Zone import ──
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
        <div className="text-center">
          <div className="text-4xl mb-3">🔄</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">État Mutations</h1>
          <p className="text-gray-500 text-sm">Importez un fichier Excel exporté depuis le CRM SNDE</p>
        </div>

        <div
          className="w-full max-w-md border-2 border-dashed border-indigo-300 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        >
          <span className="text-5xl">📂</span>
          <p className="text-gray-600 font-medium text-center">
            Glissez-déposez le fichier ici<br/>
            <span className="text-gray-400 text-sm">ou cliquez pour sélectionner</span>
          </p>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">.xls · .xlsx</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-indigo-600 animate-pulse">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Analyse en cours…
          </div>
        )}
        {error && <p className="text-red-500 text-sm text-center max-w-sm">{error}</p>}
      </div>
    );
  }

  // ── Calcul des stats ──
  const { rows, anomalies } = data;
  const total = rows.length;

  // Types de demande
  const typesDemandeMap = {};
  rows.forEach(r => {
    const k = r.typeDemande || 'Non précisé';
    typesDemandeMap[k] = (typesDemandeMap[k] || 0) + 1;
  });

  // Types de mutation (uniquement pour les mutations)
  const typesMutationMap = {};
  rows.filter(r => r.typeDemande === 'Mutation').forEach(r => {
    const k = r.typeMutation || '— Non précisé';
    typesMutationMap[k] = (typesMutationMap[k] || 0) + 1;
  });

  // Statuts
  const nbValides  = rows.filter(r => r.valide === 'OUI').length;
  const nbAnnules  = rows.filter(r => r.annule === 'OUI').length;
  const nbAttente  = rows.filter(r => r.valide === 'NON' && r.annule === 'NON').length;

  // Agents
  const agentsMap = {};
  rows.forEach(r => {
    const k = r.creePar || 'Inconnu';
    agentsMap[k] = (agentsMap[k] || 0) + 1;
  });

  // Anomalies filtrées
  const regles = ['Toutes', ...new Set(anomalies.map(a => a.regle))];
  const anomaliesFiltrees = anomalies.filter(a =>
    (filterGravite === 'Toutes' || a.gravite === filterGravite) &&
    (filterRegle   === 'Toutes' || a.regle   === filterRegle)
  );

  const nbHautes  = anomalies.filter(a => a.gravite === 'Haute').length;
  const nbMoyennes= anomalies.filter(a => a.gravite === 'Moyenne').length;
  const nbFaibles = anomalies.filter(a => a.gravite === 'Faible').length;

  const TABS = ['overview', 'types', 'anomalies', 'données'];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">État Mutations — {rows[0]?.nomCentre ?? '—'}</h1>
          <p className="text-sm text-gray-400">{total} demandes analysées</p>
        </div>
        <button
          onClick={() => { setData(null); setError(null); }}
          className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-4 py-2 hover:bg-indigo-50 transition-all self-start"
        >
          ↩ Importer un autre fichier
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total demandes" value={total} />
        <KpiCard label="Validées" value={nbValides} sub={`${pct(nbValides, total)}%`} color="text-green-600" />
        <KpiCard label="Annulées" value={nbAnnules} sub={`${pct(nbAnnules, total)}%`} color="text-red-500" />
        <KpiCard label="En attente" value={nbAttente} sub={`${pct(nbAttente, total)}%`} color="text-yellow-500" />
      </div>

      {/* Alerte anomalies */}
      {anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-xl">⚠️</span>
          <div className="flex-1 text-sm text-red-700">
            <span className="font-semibold">{anomalies.length} anomalie(s) détectée(s)</span>
            {' — '}
            {nbHautes > 0 && <span className="font-semibold">{nbHautes} haute(s) </span>}
            {nbMoyennes > 0 && <span>{nbMoyennes} moyenne(s) </span>}
            {nbFaibles > 0 && <span className="text-gray-500">{nbFaibles} faible(s)</span>}
          </div>
          <button
            onClick={() => setActiveTab('anomalies')}
            className="text-xs text-red-600 underline hover:text-red-800"
          >
            Voir tout
          </button>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'anomalies' ? `Anomalies (${anomalies.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Onglet Vue d'ensemble ── */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Statuts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4">Statut des demandes</h2>
            <div className="flex gap-4 mb-5">
              {[
                { label: 'Validées', n: nbValides, color: 'bg-green-500' },
                { label: 'En attente', n: nbAttente, color: 'bg-yellow-400' },
                { label: 'Annulées', n: nbAnnules, color: 'bg-red-400' },
              ].map(({ label, n, color }) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5"/>
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke={color.replace('bg-', '').replace('-500','').replace('-400','')}
                        strokeWidth="3.5"
                        strokeDasharray={`${pct(n, total)} ${100 - pct(n, total)}`}
                        strokeLinecap="round"
                        className={color.includes('green') ? 'stroke-green-500' : color.includes('yellow') ? 'stroke-yellow-400' : 'stroke-red-400'}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                      {pct(n, total)}%
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-sm font-semibold text-gray-700">{n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Types de demande */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4">Types de demande</h2>
            <div className="flex flex-col gap-3">
              {Object.entries(typesDemandeMap)
                .sort((a, b) => b[1] - a[1])
                .map(([type, n]) => (
                  <PctBar
                    key={type}
                    label={type}
                    n={n}
                    total={total}
                    color={
                      type === 'Mutation' ? 'bg-indigo-500' :
                      type === 'Réabonnement' ? 'bg-green-500' :
                      type === 'Résiliation' ? 'bg-red-400' :
                      type === 'Nouveau Branchement' ? 'bg-purple-500' :
                      'bg-orange-400'
                    }
                  />
                ))}
            </div>
          </div>

          {/* Agents */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4">Activité par agent (Créée par)</h2>
            <div className="flex flex-col gap-3">
              {Object.entries(agentsMap)
                .sort((a, b) => b[1] - a[1])
                .map(([agent, n]) => (
                  <PctBar key={agent} label={`Agent ${agent}`} n={n} total={total} color="bg-slate-500" />
                ))}
            </div>
          </div>

          {/* Résumé anomalies */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-4">Résumé des anomalies</h2>
            <div className="flex flex-col gap-3">
              <PctBar label="Gravité Haute" n={nbHautes} total={anomalies.length || 1} color="bg-red-500" />
              <PctBar label="Gravité Moyenne" n={nbMoyennes} total={anomalies.length || 1} color="bg-yellow-400" />
              <PctBar label="Gravité Faible" n={nbFaibles} total={anomalies.length || 1} color="bg-blue-400" />
            </div>
            {anomalies.length === 0 && (
              <p className="text-green-600 text-sm mt-2 font-medium">✓ Aucune anomalie détectée</p>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Types ── */}
      {activeTab === 'types' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-6">Types de mutation (détail)</h2>
          <div className="flex flex-col gap-4">
            {Object.entries(typesMutationMap)
              .sort((a, b) => b[1] - a[1])
              .map(([type, n]) => (
                <div key={type} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">{type}</span>
                    <span className="text-gray-500">{n} <span className="text-gray-400">({pct(n, rows.filter(r => r.typeDemande === 'Mutation').length)}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-indigo-500 h-3 rounded-full"
                      style={{ width: `${pct(n, rows.filter(r => r.typeDemande === 'Mutation').length)}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
          {Object.keys(typesMutationMap).length === 0 && (
            <p className="text-gray-400 text-sm">Aucune mutation trouvée dans ce fichier.</p>
          )}
        </div>
      )}

      {/* ── Onglet Anomalies ── */}
      {activeTab === 'anomalies' && (
        <div className="flex flex-col gap-4">
          {/* Filtres */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Gravité :</label>
              <select
                value={filterGravite}
                onChange={e => setFilterGravite(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                {['Toutes', 'Haute', 'Moyenne', 'Faible'].map(g => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Règle :</label>
              <select
                value={filterRegle}
                onChange={e => setFilterRegle(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                {regles.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <span className="text-sm text-gray-400 ml-auto">{anomaliesFiltrees.length} résultat(s)</span>
          </div>

          {/* Table anomalies */}
          {anomaliesFiltrees.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-700 font-medium">
              ✓ Aucune anomalie pour ces critères
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    {['Gravité', 'Règle', 'Détail', 'Num. Demande', 'Client', 'Type', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {anomaliesFiltrees.map((a, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${GRAVITE_COLOR[a.gravite]}`}>
                          {a.gravite}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{a.regle}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs">{a.detail}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{a.numDemande}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.client}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${TYPE_DEMANDE_COLOR[a.typeDemande] || 'bg-gray-100 text-gray-600'}`}>
                          {a.typeDemande}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{a.dateStr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Données ── */}
      {activeTab === 'données' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
              <tr>
                {['Num. Demande', 'Type Demande', 'Client', 'Validé', 'Annulé', 'Type Mutation', 'Secteur', 'Tournée', 'Date', 'Agent'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-600">{r.numDemande}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${TYPE_DEMANDE_COLOR[r.typeDemande] || 'bg-gray-100 text-gray-600'}`}>
                      {r.typeDemande || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[150px] truncate">{r.client}</td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${r.valide === 'OUI' ? 'text-green-600' : 'text-red-500'}`}>
                      {r.valide}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${r.annule === 'OUI' ? 'text-red-500' : 'text-gray-400'}`}>
                      {r.annule}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.typeMutation || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.secteur}</td>
                  <td className="px-3 py-2 text-gray-500">{r.tournee}</td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{r.dateStr}</td>
                  <td className="px-3 py-2 text-gray-500">{r.creePar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
