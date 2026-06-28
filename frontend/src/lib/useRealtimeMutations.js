// src/lib/useRealtimeMutations.js
// 🆕 v5.0 — Hook React pour le temps réel sur la page Mutations.
//
// Rôle :
//   - À chaque event SSE `data_changed`, re-fetch silencieusement les mêmes
//     données (centre + secteur + dates) que celles du dernier chargement.
//   - Si un croisement EGF était déjà calculé, on le relance avec les nouvelles
//     données et on compare le nombre d'anomalies AVANT / APRÈS.
//   - Si de NOUVELLES anomalies sont apparues → toast persistant "alert"
//     avec un bouton "Voir" qui scrolle vers l'onglet croisement.
//   - Sinon → pas de toast (le SyncBanner affichera juste le delta).
//
// Usage dans MutationsPage.jsx :
//
//   const [lastLoadParams, setLastLoadParams] = useState(null)
//
//   const handleOracleData = ({ mutations, egf, centre, secteur, params }) => {
//     setMutationData({ rows: mutations, anomalies: [] })
//     setEgfRows(egf)
//     setCentreCharge(centre)
//     setCroisement(null)
//     setError(null)
//     setLastLoadParams(params)   // ← important : on mémorise les params
//   }
//
//   useRealtimeMutations({
//     lastLoadParams,
//     mutationData,
//     croisement,
//     setMutationData,
//     setEgfRows,
//     setCroisement,
//     setActiveTab,
//   })

import { useRef } from 'react'
import { fetchMutations, fetchEGF } from './apiClient'
import { croiserMutationEGF } from './analyticsMutation'
import { useServerEvent, pushToast } from './realtime'

export function useRealtimeMutations({
  lastLoadParams,
  mutationData,
  croisement,
  setMutationData,
  setEgfRows,
  setCroisement,
  setActiveTab,
}) {
  // Refs vers les valeurs courantes pour éviter de capturer du stale state
  const paramsRef     = useRef(lastLoadParams)
  const hasDataRef    = useRef(!!mutationData)
  const croisementRef = useRef(croisement)

  // Mémoriser via useRef évite de recréer le handler à chaque render
  paramsRef.current     = lastLoadParams
  hasDataRef.current    = !!mutationData
  croisementRef.current = croisement

  useServerEvent('data_changed', async () => {
    const params = paramsRef.current
    // Si l'utilisateur n'a encore rien chargé, on ne fait rien (sa
    // sélection serait perturbée par un fetch inopiné)
    if (!params || !hasDataRef.current) return

    try {
      // Re-fetch silencieux avec EXACTEMENT les mêmes paramètres
      const [newMutations, newEgf] = await Promise.all([
        fetchMutations(params),
        fetchEGF(params),
      ])

      // Si un croisement était en cours d'affichage, on le relance et on
      // compare le nb d'anomalies pour notifier les nouvelles
      const prevCrois = croisementRef.current
      const nbAvant   = prevCrois?.anomalies?.length ?? 0

      let newCrois = null
      if (prevCrois) {
        try {
          newCrois = croiserMutationEGF(newMutations, newEgf)
        } catch (e) {
          console.warn('[realtime] croisement auto échoué :', e)
        }
      }

      // Mise à jour de l'état React
      setMutationData({ rows: newMutations, anomalies: [] })
      setEgfRows(newEgf)
      if (newCrois) setCroisement(newCrois)

      // Toast nouvelles anomalies
      if (newCrois) {
        const nbApres = newCrois.anomalies.length
        const diff = nbApres - nbAvant
        if (diff > 0) {
          pushToast({
            kind: 'alert',
            title: `${diff} nouvelle${diff > 1 ? 's' : ''} anomalie${diff > 1 ? 's' : ''} détectée${diff > 1 ? 's' : ''}`,
            message: `Suite à la dernière synchronisation Oracle (${nbApres} au total)`,
            sticky: true,
            action: {
              label: 'Voir les anomalies →',
              onClick: () => {
                setActiveTab && setActiveTab('croisement')
                // Léger scroll vers le haut pour les exposer
                window.scrollTo({ top: 0, behavior: 'smooth' })
              },
            },
          })
        }
      }
    } catch (e) {
      console.warn('[realtime] re-fetch auto échoué :', e)
      // On ne notifie pas l'utilisateur d'une erreur de re-fetch silencieux
      // pour éviter de polluer l'UI ; le SyncBanner reste source de vérité
    }
  })
}