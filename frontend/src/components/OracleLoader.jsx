// src/components/OracleLoader.jsx
// 🆕 v5.0 — onData reçoit désormais aussi `params` (centre, secteur, dates),
//          nécessaires pour le re-fetch silencieux temps réel.
// 🆕 v4.8 — Écoute window event 'snde:preset' (raccourcis HomeHero)
//          + ajoute id="oracle-loader" sur le wrapper (scroll cible)
//          + après chargement réussi → push localStorage 'snde:recentLoads'
// v4.7 — Affichage du LIBELLÉ secteur (SECT_LIBLT) sauf gros conso 04/4/08/8
// v4.5 — Codes secteur affichés tels quels
// v4.4 — Dropdown SECTEUR cascading + EGF fin éditable

import { useEffect, useState } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { fetchCentres, fetchSecteurs, fetchMutations, fetchEGF } from '../lib/apiClient'

const today = () => new Date().toISOString().slice(0, 10)
const firstDayMonth = () => {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
}
const firstDayMinus = (n) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

const SECTEURS_GROS_CONSO = new Set(['04', '4', '08', '8'])

const labelSecteur = (s) => {
  const code = String(s.SECTEUR || '').trim()
  if (SECTEURS_GROS_CONSO.has(code)) return code
  return s.LIBELLE && s.LIBELLE.trim() ? s.LIBELLE : code
}

function pushRecentLoad(entry) {
  try {
    const raw = localStorage.getItem('snde:recentLoads')
    const list = raw ? JSON.parse(raw) : []
    const filtered = (Array.isArray(list) ? list : []).filter(r =>
      !(r.centreCode === entry.centreCode && r.mutDeb === entry.mutDeb && r.mutFin === entry.mutFin)
    )
    const next = [entry, ...filtered].slice(0, 8)
    localStorage.setItem('snde:recentLoads', JSON.stringify(next))
  } catch (e) { /* ignore quota / parse errors */ }
}

export default function OracleLoader({ onData }) {
  const [centres,   setCentres]   = useState([])
  const [centre,    setCentre]    = useState('')

  const [secteurs,  setSecteurs]  = useState([])
  const [secteur,   setSecteur]   = useState('')
  const [loadingSec, setLoadingSec] = useState(false)

  const [mutDeb,    setMutDeb]    = useState(firstDayMonth())
  const [mutFin,    setMutFin]    = useState(today())
  const [egfDeb,    setEgfDeb]    = useState(firstDayMinus(2))
  const [egfFin,    setEgfFin]    = useState(today())

  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState(null)
  const [info,      setInfo]      = useState(null)

  /* ── 1. Charger la liste des centres ── */
  useEffect(() => {
    fetchCentres()
      .then((data) => {
        setCentres(data)
        if (data.length === 1) setCentre(String(data[0].CODE))
      })
      .catch((e) => setErr('Centres indisponibles : ' + e.message))
  }, [])

  /* ── 2. Secteurs cascading ── */
  useEffect(() => {
    if (!centre) { setSecteurs([]); setSecteur(''); return }
    setLoadingSec(true)
    fetchSecteurs(Number(centre))
      .then((data) => { setSecteurs(data || []); setSecteur('') })
      .catch((e) => { console.warn('Secteurs indisponibles', e); setSecteurs([]) })
      .finally(() => setLoadingSec(false))
  }, [centre])

  /* ── 3. Écoute des raccourcis HomeHero ─── */
  useEffect(() => {
    const onPreset = (e) => {
      const d = e.detail || {}
      if (d.centre  !== undefined) setCentre(String(d.centre))
      if (d.secteur !== undefined) setSecteur(String(d.secteur))
      if (d.mutDeb) setMutDeb(d.mutDeb)
      if (d.mutFin) setMutFin(d.mutFin)
      if (d.egfDeb) setEgfDeb(d.egfDeb)
      if (d.egfFin) setEgfFin(d.egfFin)
      setInfo('Paramètres pré-remplis depuis le raccourci.')
      setErr(null)
    }
    window.addEventListener('snde:preset', onPreset)
    return () => window.removeEventListener('snde:preset', onPreset)
  }, [])

  async function charger() {
    if (!centre) { setErr('Sélectionne un centre'); return }
    setLoading(true); setErr(null); setInfo(null)

    // 🆕 v5.0 — Paramètres mémorisés pour le re-fetch silencieux temps réel.
    // On fetch mutations sur la fenêtre mutations, ET on garde aussi la fenêtre EGF.
    // Le hook useRealtimeMutations réutilisera ces params pour fetchMutations + fetchEGF.
    const paramsMutations = {
      centre: Number(centre),
      dateDebut: mutDeb,
      dateFin: mutFin,
      secteur,
    }
    const paramsEgf = {
      centre: Number(centre),
      dateDebut: egfDeb,
      dateFin: egfFin,
      secteur,
    }

    try {
      const [mutations, egf] = await Promise.all([
        fetchMutations(paramsMutations),
        fetchEGF(paramsEgf),
      ])
      const c = centres.find(x => x.CODE === Number(centre))
      const sectObj = secteurs.find(x => String(x.SECTEUR) === String(secteur))
      const suffixe = secteur ? ` · secteur ${sectObj ? labelSecteur(sectObj) : secteur}` : ''
      setInfo(`${mutations.length} mutation(s) · ${egf.length} facture(s) EGF chargée(s)${suffixe}`)

      pushRecentLoad({
        ts        : Date.now(),
        centreCode: Number(centre),
        centreNom : c?.NOM || `Centre ${centre}`,
        secteur,
        mutDeb, mutFin, egfDeb, egfFin,
        nbMut: mutations.length,
        nbEgf: egf.length,
      })

      onData({
        mutations, egf,
        centre: c,
        secteur,
        // 🆕 v5.0 — params réutilisables par useRealtimeMutations
        params: paramsMutations,
        paramsEgf,
      })
    } catch (e) {
      setErr(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const secteurAffiche = (() => {
    const o = secteurs.find(x => String(x.SECTEUR) === String(secteur))
    return o ? labelSecteur(o) : secteur
  })()

  return (
    <div id="oracle-loader" className="bg-white rounded-xl border border-snde-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Database size={18} className="text-snde-700" />
            Charger depuis Oracle
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Source : cache DuckDB (rafraîchi automatiquement depuis CRM_SNDE)
          </p>
        </div>
      </div>

      {/* Ligne 1 : Centre + Secteur */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Centre</label>
          <select
            value={centre}
            onChange={(e) => setCentre(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snde-500"
          >
            <option value="">— Sélectionner un centre —</option>
            {centres.map((c) => (
              <option key={c.CODE} value={c.CODE}>{c.NOM} ({c.CODE})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Secteur {loadingSec && <span className="text-slate-400">(chargement…)</span>}
          </label>
          <select
            value={secteur}
            onChange={(e) => setSecteur(e.target.value)}
            disabled={!centre || loadingSec || secteurs.length === 0}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-snde-500"
          >
            <option value="">— Tous les secteurs ({secteurs.length}) —</option>
            {secteurs.map((s, i) => (
              <option key={`${s.SECTEUR}-${i}`} value={s.SECTEUR}>
                {labelSecteur(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ligne 2 : Dates */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mutations — début</label>
          <input type="date" value={mutDeb} onChange={(e) => setMutDeb(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mutations — fin</label>
          <input type="date" value={mutFin} onChange={(e) => setMutFin(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">EGF — début</label>
          <input type="date" value={egfDeb} onChange={(e) => setEgfDeb(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">EGF — fin</label>
          <input type="date" value={egfFin} onChange={(e) => setEgfFin(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
      {info && !err && <p className="text-emerald-600 text-sm mb-3">{info}</p>}

      <button
        onClick={charger}
        disabled={!centre || loading}
        className="w-full py-2.5 rounded-lg bg-snde-700 text-white font-medium text-sm
                   hover:bg-snde-800 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-all flex items-center justify-center gap-2"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Chargement…</>
          : <>🔍 Charger Mutations + EGF depuis Oracle{secteur ? ` (${secteurAffiche})` : ''}</>}
      </button>
    </div>
  )
}