// src/components/RealtimeAlert.jsx
// 🆕 v5.6 — Bandeau d'alerte persistant qui apparaît quand de nouvelles demandes
// VALIDÉES arrivent en temps réel. Clic → bascule vers l'onglet Nouveautés.
//
// Logique :
//   - Au montage, on note le compteur initial de nouvelles validées du jour.
//   - À chaque event SSE `data_changed`, on refetch le compteur.
//   - Si le compteur AUGMENTE → on affiche le bandeau avec le delta.
//   - Clic sur le bandeau → onGoToNouveautes() (App.jsx bascule la vue) puis hide.
//   - Clic sur X → hide sans naviguer.
//   - Quand l'utilisateur visite manuellement l'onglet Nouveautés, on reset
//     (le composant parent appelle dismiss() via une ref).

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { AlertTriangle, ArrowRight, X } from 'lucide-react'
import { countNouvelles } from '../lib/apiClient'
import { useServerEvent } from '../lib/realtime'

const RealtimeAlert = forwardRef(function RealtimeAlert(
  { onGoToNouveautes },
  ref,
) {
  const [pending, setPending]     = useState(0)   // nb de nouvelles validées non vues
  const [visible, setVisible]     = useState(false)
  const baselineRef               = useRef(null)  // compteur de référence
  const ignoreNext                = useRef(false)

  // Charge le baseline initial = compteur actuel de validées du jour
  useEffect(() => {
    let cancelled = false
    countNouvelles({ since: 'today', valideOnly: true })
      .then((c) => { if (!cancelled) baselineRef.current = c })
      .catch(() => { if (!cancelled) baselineRef.current = 0 })
    return () => { cancelled = true }
  }, [])

  // Permet à App.jsx de cacher le bandeau quand l'utilisateur va sur l'onglet Nouveautés
  useImperativeHandle(ref, () => ({
    dismiss: () => {
      // On met à jour le baseline pour que l'utilisateur ne soit pas re-notifié
      // sur les demandes qu'il vient de consulter.
      countNouvelles({ since: 'today', valideOnly: true })
        .then((c) => { baselineRef.current = c })
        .catch(() => {})
      setPending(0)
      setVisible(false)
    },
  }), [])

  useServerEvent('data_changed', async (payload) => {
    if (ignoreNext.current) { ignoreNext.current = false; return }
    try {
      const c = await countNouvelles({ since: 'today', valideOnly: true })
      const base = baselineRef.current ?? 0
      const delta = c - base
      if (delta > 0) {
        setPending(delta)
        setVisible(true)
      } else if (c === 0) {
        // Tout a été contrôlé entre temps → on cache
        setPending(0)
        setVisible(false)
      }
    } catch (e) {
      // Silencieux : si on n'arrive pas à compter, pas de bandeau
    }
  })

  if (!visible || pending <= 0) return null

  return (
    <button
      onClick={() => {
        onGoToNouveautes && onGoToNouveautes()
        // dismiss sera appelé par App.jsx via la ref une fois la vue changée
      }}
      className="w-full bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-4 hover:shadow-xl transition-all animate-pulse-once"
    >
      <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur">
        <AlertTriangle size={20} />
      </div>
      <div className="flex-1 text-left">
        <div className="font-bold text-base flex items-center gap-2">
          🚨 {pending} nouvelle{pending > 1 ? 's' : ''} demande{pending > 1 ? 's' : ''} VALIDÉE{pending > 1 ? 'S' : ''}
        </div>
        <div className="text-xs opacity-90 mt-0.5">
          Cliquez ici pour ouvrir l'onglet « Nouveautés » et lancer l'audit
        </div>
      </div>
      <ArrowRight size={20} className="flex-shrink-0 animate-pulse" />
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); setVisible(false); setPending(0) }}
        title="Ignorer"
        className="flex-shrink-0 w-7 h-7 hover:bg-white/20 rounded-full flex items-center justify-center"
      >
        <X size={16} />
      </span>
    </button>
  )
})

export default RealtimeAlert