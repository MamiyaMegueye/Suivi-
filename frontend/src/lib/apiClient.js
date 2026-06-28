// src/lib/apiClient.js
// 🆕 v5.7 — fetchNouvellesAnomaliesData : mutations + EGF liées pour croisement
// 🆕 v5.6 — fetchNouvelles/countNouvelles supportent `since` + `valideOnly`
// 🆕 v5.4 — reshapeMutation expose heureStr et dateHeureStr (DATE_DEMANDE TIMESTAMP)
// 🆕 v5.2 — Endpoints "Nouveautés"
// 🆕 v5.0 — openEventStream écoute `data_changed`
// 🆕 v4.6 — toStr nettoie les `.0` que pandas ajoute aux entiers
// 🆕 v4.4 — fetchSecteurs() + paramètre secteur pour mutations/egf

import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const http = axios.create({ baseURL: API_URL, timeout: 60_000 })

/* ── Helpers ─────────────────────────────────────────────────────────── */
const toDate = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const toNum = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toStr = (v) => {
  if (v == null) return ''
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return Number.isInteger(v) ? String(v) : String(v)
  }
  let s = String(v).trim()
  if (/^-?\d+\.0+$/.test(s)) {
    s = s.replace(/\.0+$/, '')
  }
  return s
}

// Formats date/heure
const HH_MM = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const fmtDateHeure = (d) => d ? `${d.toLocaleDateString('fr-FR')} ${HH_MM(d)}` : '—'
const fmtHeure = (d) => d ? HH_MM(d) : ''
const aHeure = (d) => d && !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0)

/* ── Reshape Mutation ──────────────────────────────────────────────── */
function reshapeMutation(r) {
  const dateObj = toDate(r.DATE_DEMANDE)
  const hasHeure = aHeure(dateObj)
  return {
    nomCentre   : toStr(r.NOM_CENTRE),
    codeCentre  : toStr(r.CODE_CENTRE),
    numDemande  : toStr(r.NUM_DEMANDE),
    refAbo      : toStr(r.REF_ABONNEMENT),
    typeDemande : toStr(r.TYPE_DEMANDE),
    client      : toStr(r.NOM_CLIENT),
    creePar     : toStr(r.CREE_PAR),
    valide      : r.VALIDE ? String(r.VALIDE).toUpperCase() : null,
    annule      : r.ANNULE ? String(r.ANNULE).toUpperCase() : null,
    adresse     : toStr(r.ADRESSE),
    secteur     : toStr(r.SECTEUR),
    tournee     : toStr(r.TOURNEE),
    typeMutation: toStr(r.TYPE_MUTATION),
    date        : dateObj,
    dateStr     : dateObj ? dateObj.toLocaleDateString('fr-FR') : '—',
    heureStr     : hasHeure ? fmtHeure(dateObj) : '',
    dateHeureStr : dateObj ? (hasHeure ? fmtDateHeure(dateObj) : dateObj.toLocaleDateString('fr-FR')) : '—',
    hasHeure,
    codeClient  : toStr(r.CODE_CLIENT),
    numCompteur : toStr(r.NUM_COMPTEUR),   // 🆕 v5.7 — récupéré via sous-requête EGF
  }
}

/* ── Reshape EGF ────────────────────────────────────────────────────── */
function reshapeEGF(r) {
  const dateFacture = toDate(r.DATE_FACTURE)
  return {
    centre        : toStr(r.CENTRE),
    codeCentre    : toStr(r.CODE_CENTRE),
    secteur       : toStr(r.SECTEUR),
    numFacture    : toStr(r.NUM_FACTURE),
    reference     : toStr(r.REFERENCE),
    ancRef        : toStr(r.ANC_REFERENCE),
    nom           : toStr(r.NOM),
    tarif         : toStr(r.TARIF),
    codeFacture   : '',
    tournee       : toStr(r.TOURNEE),
    dateCreation  : null,
    compteur      : toStr(r.COMPTEUR),
    refCompteur   : toStr(r.REFERENCE_COMPTEUR),
    dateFacture,
    dateFactureStr: dateFacture ? dateFacture.toLocaleDateString('fr-FR') : '—',
    moisFacture   : dateFacture ? dateFacture.getMonth() + 1 : null,
    anneeFacture  : dateFacture ? dateFacture.getFullYear() : null,
    typeFacture   : toStr(r.TYPE_FACTURE),
    dateDebut     : toDate(r.DATE_DEBUT),
    dateFin       : toDate(r.DATE_FIN),
    indexDebut    : toNum(r.INDEX_DEBUT),
    indexFin      : toNum(r.INDEX_FIN),
    consommation  : toNum(r.CONSOMMATION),
    vFacture      : toNum(r.V_FACTURE),
    montant       : toNum(r.MONTANT),
    arrieres      : toNum(r.ARRIERES),
    solde         : toNum(r.SOLDE),
    adresse       : toStr(r.ADRESSE),
    typeComptage  : toStr(r.TYPE_COMPTAGE),
  }
}

/* ── API : système ────────────────────────────────────────────────── */
export async function fetchHealth() { return (await http.get('/health')).data }
export async function fetchStatus() { return (await http.get('/api/status')).data }
export async function reloadCache() { return (await http.post('/api/reload')).data }

/* ── API : référentiels ────────────────────────────────────────────── */
export async function fetchCentres() {
  const { data } = await http.get('/api/centres')
  return data
}

export async function fetchSecteurs(centre) {
  const { data } = await http.get('/api/secteurs', { params: { centre } })
  return data
}

/* ── API : données ─────────────────────────────────────────────────── */
export async function fetchMutations({ centre, dateDebut, dateFin, secteur = '' }) {
  const params = { centre, date_debut: dateDebut, date_fin: dateFin }
  if (secteur) params.secteur = secteur
  const { data } = await http.get('/api/mutations', { params })
  return data.map(reshapeMutation)
}

export async function fetchEGF({ centre, dateDebut, dateFin, secteur = '' }) {
  const params = { centre, date_debut: dateDebut, date_fin: dateFin }
  if (secteur) params.secteur = secteur
  const { data } = await http.get('/api/egf', { params })
  return data.map(reshapeEGF)
}

/* ── 🆕 v5.2/5.6 : API Nouveautés ─────────────────────────────────── */
/**
 * @param {Object} opts
 * @param {number|null} [opts.centre]        - filtre code centre
 * @param {string} [opts.since='today']      - 'today' | 'all' | 'YYYY-MM-DD'
 * @param {boolean} [opts.valideOnly=false]  - ne renvoyer que les validées
 * @param {number} [opts.limit=500]
 */
export async function fetchNouvelles({
  centre = null, since = 'today', valideOnly = false, limit = 500,
} = {}) {
  const params = { limit }
  if (centre != null && centre !== '') params.centre = centre
  if (since && since !== 'today') params.since = since
  else if (since === 'today') params.since = todayISO()
  if (valideOnly) params.valide_only = true
  const { data } = await http.get('/api/nouvelles', { params })
  return data.map(reshapeMutation)
}

export async function countNouvelles({
  centre = null, since = 'today', valideOnly = false,
} = {}) {
  const params = {}
  if (centre != null && centre !== '') params.centre = centre
  if (since && since !== 'today') params.since = since
  else if (since === 'today') params.since = todayISO()
  if (valideOnly) params.valide_only = true
  const { data } = await http.get('/api/nouvelles/count', { params })
  return data.count
}

/* ── 🆕 v5.7 : Données pour croisement EGF côté front ─────────────── */
/**
 * Renvoie { mutations, egf } reshaped, prêt à passer à croiserMutationEGF().
 * Mêmes filtres que fetchNouvelles.
 */
export async function fetchNouvellesAnomaliesData({
  centre = null, since = 'today', valideOnly = false, limit = 2000,
} = {}) {
  const params = { limit }
  if (centre != null && centre !== '') params.centre = centre
  if (since && since !== 'today') params.since = since
  else if (since === 'today') params.since = todayISO()
  if (valideOnly) params.valide_only = true
  const { data } = await http.get('/api/nouvelles/anomalies-data', { params })
  return {
    mutations: (data.mutations || []).map(reshapeMutation),
    egf:       (data.egf || []).map(reshapeEGF),
  }
}

export async function marquerControle(numDemande, par = 'user') {
  const { data } = await http.post(
    `/api/nouvelles/${encodeURIComponent(numDemande)}/controler`,
    null,
    { params: { par } },
  )
  return data
}

export async function annulerControle(numDemande) {
  const { data } = await http.delete(
    `/api/nouvelles/${encodeURIComponent(numDemande)}/controler`,
  )
  return data
}

export async function fetchCroisementDemande(numDemande) {
  const { data } = await http.get(
    `/api/nouvelles/${encodeURIComponent(numDemande)}/croisement`,
  )
  return {
    mutation:         reshapeMutation(data.mutation),
    facturesLiees:    (data.factures_liees || []).map(reshapeEGF),
    mutationsMemeAbo: (data.mutations_meme_abo || []).map(reshapeMutation),
    controle:         data.controle || { deja_controlee: false },
  }
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/* ── SSE ───────────────────────────────────────────────────────────── */
export const SSE_EVENTS = [
  'hello',
  'ping',
  'refresh_started',
  'refresh_finished',
  'data_changed',
]

export function openEventStream(onEvent) {
  const es = new EventSource(`${API_URL}/api/events`)
  SSE_EVENTS.forEach((evt) => {
    es.addEventListener(evt, (e) => {
      try { onEvent(evt, JSON.parse(e.data)) }
      catch { onEvent(evt, {}) }
    })
  })
  return es
}