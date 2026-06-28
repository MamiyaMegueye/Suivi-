// src/components/SyncBanner.jsx
// 🆕 v5.0 — Utilise le bus realtime central (useServerEvent / useLiveStatus)
//          - n'ouvre PLUS son propre EventSource (1 seule connexion partagée)
//          - écoute refresh_started / refresh_finished / data_changed
//          - affiche le delta après chaque sync (ex: "+3 mutations · +5 EGF")

import { useEffect, useState, useCallback } from 'react'
import { RotateCw } from 'lucide-react'
import { fetchStatus, reloadCache } from '../lib/apiClient'
import { useServerEvent, useLiveStatus, pushToast } from '../lib/realtime'

function formatRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  // clamp à 0 — protège contre une horloge client en avance sur le serveur
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (diff < 5)    return 'à l\'instant'
  if (diff < 60)   return `il y a ${Math.floor(diff)} s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return d.toLocaleString('fr-FR')
}

function fmtDelta(delta) {
  if (!delta) return null
  const parts = []
  if (delta.mutations) parts.push(`${delta.mutations > 0 ? '+' : ''}${delta.mutations} mutation${Math.abs(delta.mutations) > 1 ? 's' : ''}`)
  if (delta.egf)       parts.push(`${delta.egf > 0 ? '+' : ''}${delta.egf} EGF`)
  return parts.length ? parts.join(' · ') : null
}

export default function SyncBanner() {
  const [status, setStatus]       = useState(null)
  const [reloading, setReloading] = useState(false)
  const [lastDelta, setLastDelta] = useState(null)
  const live = useLiveStatus()

  const refresh = useCallback(async () => {
    try { setStatus(await fetchStatus()) }
    catch (e) { setStatus({ status: 'unreachable', error: e.message }) }
  }, [])

  /* Fetch initial + tick lent pour le "il y a X min" */
  useEffect(() => {
    refresh()
    const t = setInterval(() => setStatus((s) => s ? { ...s } : s), 30_000) // re-render pour "il y a X min"
    return () => clearInterval(t)
  }, [refresh])

  /* Abonnements SSE */
  useServerEvent('refresh_started', () => { setReloading(true) })

  useServerEvent('refresh_finished', (payload) => {
    setReloading(false)
    refresh()
    if (payload?.status === 'error') {
      pushToast({
        kind: 'alert',
        title: 'Sync échouée',
        message: payload.error || 'Erreur inconnue lors du refresh',
        sticky: true,
      })
    }
  })

  useServerEvent('data_changed', (payload) => {
    setLastDelta(payload?.delta || null)
    const txt = fmtDelta(payload?.delta)
    if (txt) {
      pushToast({
        kind: 'success',
        title: 'Cache à jour',
        message: txt,
        ttl: 3500,
      })
    }
  })

  async function handleReload() {
    setReloading(true)
    try { await reloadCache() }
    catch (e) {
      pushToast({
        kind: 'alert',
        title: 'Erreur reload',
        message: e.response?.data?.detail || e.message,
        sticky: true,
      })
      setReloading(false)
    }
  }

  const isLoadingInitial = status === null   // 🆕 v5.7.5 — fetch initial pas encore arrivé
  const isErr = status?.status === 'error' || status?.status === 'unreachable'
  const dotColor =
    isLoadingInitial ? 'bg-slate-300 animate-pulse'
    : reloading ? 'bg-snde-500 animate-pulse'
    : isErr   ? 'bg-red-500'
    : status?.status === 'ok' ? 'bg-emerald-500'
    : 'bg-slate-400'

  const deltaTxt = fmtDelta(lastDelta)

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex items-center gap-4 text-sm shadow-sm flex-wrap">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="font-semibold text-slate-800">
          {isLoadingInitial ? 'Initialisation…'
          : reloading ? 'Synchronisation en cours…'
          : isErr   ? 'Cache désynchronisé'
                    : 'Cache à jour'}
        </span>
      </div>

      <div className="text-slate-500">
        Dernière sync : <strong className="text-slate-700">{isLoadingInitial ? '…' : formatRelative(status?.last_refresh)}</strong>
        {status?.duration_seconds && (
          <span className="ml-2 text-slate-400">({Number(status.duration_seconds).toFixed(1)}s)</span>
        )}
      </div>

      <div className="text-slate-500 hidden md:block">
        Mutations <strong className="text-slate-700">{isLoadingInitial ? '—' : (status?.mutations ?? 0)}</strong>
        {' · '}EGF <strong className="text-slate-700">{isLoadingInitial ? '—' : (status?.egf ?? 0)}</strong>
        {' · '}Centres <strong className="text-slate-700">{isLoadingInitial ? '—' : (status?.centres ?? 0)}</strong>
      </div>

      {deltaTxt && !reloading && (
        <div className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Dernier delta : {deltaTxt}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className={`text-xs ${live ? 'text-emerald-600' : 'text-slate-400'}`}>
          ● Live {live ? 'on' : 'off'}
        </span>
        <button
          onClick={handleReload}
          disabled={reloading}
          className="flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm text-slate-700"
        >
          <RotateCw size={14} className={reloading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {status?.error && (
        <div className="text-red-600 text-xs font-mono w-full mt-1">{status.error}</div>
      )}
    </div>
  )
}