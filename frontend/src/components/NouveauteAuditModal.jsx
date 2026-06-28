// src/components/NouveauteAuditModal.jsx
// 🆕 v5.2 — Modal d'audit pour une demande "nouveauté".
// Appelle GET /api/nouvelles/{numDemande}/croisement pour récupérer :
//   - la mutation
//   - toutes les factures EGF liées (par REF_ABONNEMENT ET ANC_REFERENCE)
//   - toutes les autres mutations du même abonné (pour R2 multi-mutations)
// Puis lance croiserMutationEGF() pour calculer les anomalies applicables.

import { useEffect, useState } from 'react'
import { X, Loader2, AlertTriangle, CheckCircle2, Check, FileText, ExternalLink } from 'lucide-react'
import { fetchCroisementDemande, marquerControle } from '../lib/apiClient'
import { croiserMutationEGF } from '../lib/analyticsMutation'
import { pushToast } from '../lib/realtime'

const GRAVITE_STYLE = {
  Critique : 'bg-red-100 text-red-700 border-red-300',
  Haute    : 'bg-orange-100 text-orange-700 border-orange-200',
  Moyenne  : 'bg-amber-100 text-amber-700 border-amber-200',
  Faible   : 'bg-blue-100 text-blue-700 border-blue-200',
}

const fmtMRU = (n) => Number.isFinite(Number(n))
  ? Number(n).toLocaleString('fr-FR') + ' MRU'
  : '—'

const statutDe = (r) => r.annule === 'OUI' ? 'Annulé' : r.valide === 'OUI' ? 'Validé' : 'En attente'

export default function NouveauteAuditModal({ numDemande, onClose, onControlee }) {
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [data, setData]             = useState(null)
  const [croisement, setCroisement] = useState(null)
  const [controling, setControling] = useState(false)

  // 1. Fetch
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fetchCroisementDemande(numDemande)
      .then((d) => {
        if (cancelled) return
        setData(d)
        // 2. Lancer le croisement local sur ces données
        try {
          const result = croiserMutationEGF(d.mutationsMemeAbo, d.facturesLiees)
          // On ne garde que les anomalies CONCERNANT cette demande précise
          // (R2 multi-mutations peut produire des anomalies sur d'autres demandes
          //  du même abonné — on les garde pour info)
          setCroisement(result)
        } catch (e) {
          console.warn('Croisement local échoué :', e)
          setCroisement({ anomalies: [], stats: {} })
        }
      })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.detail || e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [numDemande])

  // Échap pour fermer
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleControler = async () => {
    setControling(true)
    try {
      await marquerControle(numDemande)
      pushToast({
        kind: 'success',
        title: 'Demande contrôlée',
        message: `Demande #${numDemande} marquée comme auditée`,
        ttl: 2500,
      })
      onControlee && onControlee(numDemande)
      onClose()
    } catch (e) {
      pushToast({
        kind: 'alert',
        title: 'Erreur',
        message: e.message,
        sticky: true,
      })
    } finally {
      setControling(false)
    }
  }

  // Filtrer les anomalies qui concernent NOTRE demande
  const mutation = data?.mutation
  const anomaliesPropres = (croisement?.anomalies || []).filter(a =>
    a.numDemande === numDemande || a.refAbo === mutation?.refAbo
  )
  // Anomalies sur LA demande elle-même (numDemande direct)
  const anomDirectes = anomaliesPropres.filter(a => a.numDemande === numDemande)
  // Autres anomalies sur le même abonné (info bonus)
  const anomMemeAbo  = anomaliesPropres.filter(a => a.numDemande !== numDemande)

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Audit de la demande</h2>
              <span className="font-mono text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                #{numDemande}
              </span>
            </div>
            {mutation && (
              <p className="text-xs text-slate-500 mt-0.5">
                {mutation.client} · {mutation.nomCentre} · secteur {mutation.secteur}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <span className="ml-3 text-sm">Chargement de la demande et des factures…</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
              ❌ {error}
            </div>
          )}

          {!loading && !error && mutation && (
            <>
              {/* Bloc 1 — Infos demande */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoBlock title="Informations demande">
                  <Row label="Type">{mutation.typeDemande}
                    {mutation.typeMutation && <span className="text-slate-400 ml-1">({mutation.typeMutation})</span>}
                  </Row>
                  <Row label="Date">{mutation.dateStr}</Row>
                  <Row label="Statut">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      mutation.valide === 'OUI' ? 'bg-emerald-100 text-emerald-700'
                      : mutation.annule === 'OUI' ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>{statutDe(mutation)}</span>
                  </Row>
                  <Row label="Créée par">{mutation.creePar || '—'}</Row>
                </InfoBlock>

                <InfoBlock title="Abonné">
                  <Row label="Nom">{mutation.client}</Row>
                  <Row label="Réf. abonné">
                    <span className="font-mono">{mutation.refAbo}</span>
                  </Row>
                  <Row label="Code client">
                    <span className="font-mono text-xs">{mutation.codeClient || '—'}</span>
                  </Row>
                  <Row label="Adresse">{mutation.adresse || '—'}</Row>
                  <Row label="Secteur · Tournée">
                    {mutation.secteur || '—'}
                    {mutation.tournee && <span className="text-slate-400 ml-1">· t. {mutation.tournee}</span>}
                  </Row>
                </InfoBlock>
              </div>

              {/* Bloc 2 — Verdict audit */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} /> Verdict de l'audit
                </h3>

                {anomDirectes.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm">
                    <CheckCircle2 size={18} />
                    <span>Aucune anomalie détectée sur cette demande.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-red-700">
                      ⚠️ {anomDirectes.length} anomalie(s) détectée(s) :
                    </div>
                    {anomDirectes.map((a, i) => (
                      <AnomalieRow key={i} a={a} />
                    ))}
                  </div>
                )}

                {anomMemeAbo.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="text-xs text-slate-500 mb-2">
                      Autres anomalies sur le même abonné (Réf {mutation.refAbo}) :
                    </div>
                    <div className="space-y-1">
                      {anomMemeAbo.map((a, i) => (
                        <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${GRAVITE_STYLE[a.gravite] || ''}`}>
                            {a.gravite}
                          </span>
                          <span>{a.regle}</span>
                          <span className="text-slate-400 font-mono">· #{a.numDemande}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bloc 3 — Factures EGF liées */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
                  <FileText size={14} /> Factures EGF liées ({data.facturesLiees.length})
                </h3>
                {data.facturesLiees.length === 0 ? (
                  <div className="text-sm text-slate-400 italic py-3">
                    Aucune facture trouvée pour la référence abonnement {mutation.refAbo}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          {['N° facture', 'Type', 'Date', 'Conso.', 'Montant', 'Solde'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.facturesLiees.map((f, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-mono">{f.numFacture}</td>
                            <td className="px-3 py-1.5">{f.typeFacture}</td>
                            <td className="px-3 py-1.5 text-slate-500">{f.dateFactureStr}</td>
                            <td className="px-3 py-1.5 text-right">{f.consommation ?? '—'}</td>
                            <td className="px-3 py-1.5 text-right">{fmtMRU(f.montant)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold">{fmtMRU(f.solde)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bloc 4 — Autres demandes du même abonné */}
              {data.mutationsMemeAbo.length > 1 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                    Autres demandes du même abonné ({data.mutationsMemeAbo.length - 1})
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          {['Num', 'Type', 'Sous-type', 'Date', 'Statut'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.mutationsMemeAbo
                          .filter(m => m.numDemande !== numDemande)
                          .map((m, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-1.5 font-mono">{m.numDemande}</td>
                              <td className="px-3 py-1.5">{m.typeDemande}</td>
                              <td className="px-3 py-1.5 text-slate-500">{m.typeMutation || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-500">{m.dateStr}</td>
                              <td className="px-3 py-1.5">{statutDe(m)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {data?.controle?.deja_controlee
              ? `✓ Déjà contrôlée le ${data.controle.at}`
              : 'En attente de contrôle'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Fermer
            </button>
            <button
              onClick={handleControler}
              disabled={controling || data?.controle?.deja_controlee}
              className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-40"
            >
              {controling
                ? <><Loader2 size={14} className="animate-spin" /> Marquage…</>
                : <><Check size={14} /> Marquer contrôlée</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Helpers UI ───── */
function InfoBlock({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <dt className="text-xs text-slate-400 uppercase font-medium w-32 flex-shrink-0 mt-0.5">{label}</dt>
      <dd className="text-slate-700 flex-1">{children}</dd>
    </div>
  )
}

function AnomalieRow({ a }) {
  return (
    <div className="bg-white border border-red-200 rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${GRAVITE_STYLE[a.gravite] || ''}`}>
          {a.gravite}
        </span>
        <span className="font-semibold text-sm text-red-800">{a.regle}</span>
      </div>
      {a.detail && (
        <p className="text-xs text-slate-600 leading-relaxed">{a.detail}</p>
      )}
      {a.solde != null && a.solde > 0 && (
        <p className="text-xs text-red-700 font-semibold">Solde impayé : {fmtMRU(a.solde)}</p>
      )}
    </div>
  )
}