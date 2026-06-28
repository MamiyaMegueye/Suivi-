// src/lib/realtime.js
// 🆕 v5.0 — Système temps réel pour SNDE Audit
//
// 1. RealtimeProvider : ouvre UNE seule connexion SSE au backend, et la partage
//    entre tous les composants via un mini "event bus" en mémoire.
//
// 2. useServerEvent(eventName, handler) : s'abonne à un type d'event SSE.
//    Le handler reçoit le payload JSON envoyé par le backend.
//
// 3. useToasts() / pushToast() : bus de toasts global. Voir Toast.jsx + ToastContainer.jsx.

import { useEffect, useRef, useState, useCallback } from 'react'
import { openEventStream, SSE_EVENTS } from './apiClient'

/* ============================================================
 * EVENT BUS — un seul EventSource pour toute l'app
 * ============================================================ */
const listeners = new Map() // event_name → Set<handler>
let _es = null
let _live = false
const liveListeners = new Set()

function _setLive(v) {
  if (v === _live) return
  _live = v
  liveListeners.forEach((cb) => { try { cb(v) } catch (e) { console.warn(e) } })
}

function _ensureStream() {
  if (_es) return _es
  _es = openEventStream((evt, payload) => {
    if (evt !== 'ping') _setLive(true)
    if (evt === 'hello') _setLive(true)
    const set = listeners.get(evt)
    if (!set) return
    set.forEach((handler) => {
      try { handler(payload) }
      catch (e) { console.error(`[realtime] handler '${evt}' a throw :`, e) }
    })
  })
  _es.onopen = () => _setLive(true)
  _es.onerror = () => {
    _setLive(false)
    // EventSource reconnecte tout seul (browser native) — pas besoin de close()
  }
  return _es
}

/* Abonnement à un type d'event SSE. */
export function useServerEvent(eventName, handler) {
  // On garde une référence stable du handler pour pas se ré-abonner à chaque render
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler }, [handler])

  useEffect(() => {
    if (!SSE_EVENTS.includes(eventName)) {
      console.warn(`[realtime] event '${eventName}' inconnu`)
    }
    _ensureStream()
    const wrapper = (payload) => ref.current && ref.current(payload)
    if (!listeners.has(eventName)) listeners.set(eventName, new Set())
    listeners.get(eventName).add(wrapper)
    return () => {
      const set = listeners.get(eventName)
      if (set) {
        set.delete(wrapper)
        if (set.size === 0) listeners.delete(eventName)
      }
    }
  }, [eventName])
}

/* Hook qui retourne true si la connexion SSE est ouverte. */
export function useLiveStatus() {
  const [live, setLive] = useState(_live)
  useEffect(() => {
    _ensureStream()
    liveListeners.add(setLive)
    setLive(_live)
    return () => liveListeners.delete(setLive)
  }, [])
  return live
}

/* RealtimeProvider — à placer au plus haut niveau de l'app.
   Force l'ouverture du flux SSE même si aucun composant n'utilise encore useServerEvent. */
export function RealtimeProvider({ children }) {
  useEffect(() => {
    _ensureStream()
    // On NE FERME PAS l'EventSource au unmount du provider racine :
    // il vit pour toute la durée de la session.
  }, [])
  return children
}

/* ============================================================
 * TOAST BUS — global, indépendant de SSE
 * ============================================================ */
const toastListeners = new Set()
let _toasts = []  // [{ id, kind, title, message, action, sticky }]
let _id = 0

function _notify() {
  toastListeners.forEach((cb) => { try { cb([..._toasts]) } catch (e) { console.warn(e) } })
}

export function pushToast(t) {
  const id = ++_id
  const toast = {
    id,
    kind: t.kind || 'info',          // 'info' | 'success' | 'warn' | 'alert'
    title: t.title || '',
    message: t.message || '',
    action: t.action || null,        // { label, onClick }
    sticky: !!t.sticky,              // si true, ne se ferme pas tout seul
    ttl: t.ttl ?? 3000,              // durée avant fermeture auto (ms)
  }
  _toasts = [..._toasts, toast]
  _notify()
  if (!toast.sticky) {
    setTimeout(() => dismissToast(id), toast.ttl)
  }
  return id
}

export function dismissToast(id) {
  const before = _toasts.length
  _toasts = _toasts.filter((t) => t.id !== id)
  if (_toasts.length !== before) _notify()
}

export function clearToasts() {
  _toasts = []
  _notify()
}

export function useToasts() {
  const [list, setList] = useState(_toasts)
  useEffect(() => {
    toastListeners.add(setList)
    setList(_toasts)
    return () => toastListeners.delete(setList)
  }, [])
  const dismiss = useCallback(dismissToast, [])
  return { toasts: list, dismiss }
}