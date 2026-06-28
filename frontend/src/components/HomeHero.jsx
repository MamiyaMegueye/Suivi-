// src/components/HomeHero.jsx
// 🆕 Vue d'accueil enrichie : greeting + KPI base + raccourcis + activité récente.
// Affichée uniquement quand aucune donnée n'est encore chargée.
//
// Comment utiliser :
//   Dans MutationsPage.jsx, avant <OracleLoader />, place : <HomeHero />
//   (uniquement quand `data == null`, c.-à-d. avant le 1ᵉʳ chargement)
//
// Communication avec OracleLoader :
//   - les raccourcis émettent window.dispatchEvent(new CustomEvent('snde:preset', { detail: {...} }))
//   - OracleLoader écoute cet event et pré-remplit ses champs
//   - OracleLoader pousse aussi dans localStorage 'snde:recentLoads' après chaque chargement réussi

import { useEffect, useState } from 'react'
import {
  CalendarDays, Database, FileText, Building2, Clock,
  Zap, History, ChevronRight,
} from 'lucide-react'
import { fetchStatus } from '../lib/apiClient'

/* ── Helpers dates ─────────────────────────────────────────────── */
const iso = (d) => d.toISOString().slice(0, 10)
const today = () => iso(new Date())
const firstDayMonth = () => {
  const d = new Date(); d.setDate(1); return iso(d)
}
const firstDayMinus = (n) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n)
  return iso(d)
}

/* ── Greeting selon l'heure ────────────────────────────────────── */
const greeting = () => {
  const h = new Date().getHours()
  if (h < 6)  return ''
  if (h < 12) return ''
  if (h < 18) return ''
  return ''
}

const dateLongue = () => new Date().toLocaleDateString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

/* ── Émet un preset (déclenche un pré-remplissage d'OracleLoader) ── */
const emitPreset = (detail) => {
  window.dispatchEvent(new CustomEvent('snde:preset', { detail }))
  // Petit scroll doux vers le loader
  setTimeout(() => {
    document.getElementById('oracle-loader')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 50)
}

/* ── Composants internes ───────────────────────────────────────── */
function MiniKpi({ label, value, sub, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate  : 'border-slate-200 bg-white  text-slate-800',
    info   : 'border-snde-200  bg-snde-50 text-snde-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber  : 'border-amber-200 bg-amber-50 text-amber-900',
  }
  const iconBg = {
    slate  : 'bg-slate-100 text-slate-600',
    info   : 'bg-snde-100  text-snde-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber  : 'bg-amber-100 text-amber-700',
  }
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${tones[tone]}`}>
      <div className={`p-2.5 rounded-lg ${iconBg[tone]}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide font-medium opacity-70">{label}</p>
        <p className="text-xl font-bold mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[11px] opacity-70 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function ShortcutCard({ icon: Icon, title, desc, onClick, color = 'snde' }) {
  const colors = {
    snde  : 'hover:border-snde-400 hover:bg-snde-50/50 text-snde-700',
    emerald: 'hover:border-emerald-400 hover:bg-emerald-50/50 text-emerald-700',
    amber : 'hover:border-amber-400 hover:bg-amber-50/50 text-amber-700',
  }
  return (
    <button
      onClick={onClick}
      className={`group text-left bg-white border border-slate-200 rounded-xl p-4 transition-all ${colors[color]}`}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-800 group-hover:text-current">{title}</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
        </div>
        <ChevronRight size={16} className="text-slate-300 group-hover:text-current mt-1 flex-shrink-0" />
      </div>
    </button>
  )
}

/* ── HomeHero principal ────────────────────────────────────────── */
export default function HomeHero() {
  const [status, setStatus]   = useState(null)
  const [recent, setRecent]   = useState([])

  // Charger le statut backend pour les KPI de bienvenue
  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  // Charger l'activité récente depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('snde:recentLoads')
      const list = raw ? JSON.parse(raw) : []
      setRecent(Array.isArray(list) ? list.slice(0, 4) : [])
    } catch { setRecent([]) }
  }, [])

  /* Raccourcis */
  const presetAujourdhui = () => emitPreset({
    mutDeb: today(),         mutFin: today(),
    egfDeb: firstDayMinus(1), egfFin: today(),
  })
  const presetMois = () => emitPreset({
    mutDeb: firstDayMonth(),  mutFin: today(),
    egfDeb: firstDayMinus(2), egfFin: today(),
  })
  const presetDernier = () => {
    if (recent.length > 0) {
      const r = recent[0]
      emitPreset({
        centre: String(r.centreCode || ''),
        secteur: r.secteur || '',
        mutDeb: r.mutDeb, mutFin: r.mutFin,
        egfDeb: r.egfDeb, egfFin: r.egfFin,
      })
    }
  }

  const periode = status?.periode || '—'

  return (
    <div className="space-y-6">
      {/* ── Hero : greeting + date ───────────────────────── */}
      <div className="bg-gradient-to-br from-snde-700 via-snde-600 to-snde-800 text-white rounded-2xl p-6 shadow-lg shadow-snde-900/20">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-snde-100/90 flex items-center gap-2">
              <CalendarDays size={14} />
              <span className="capitalize">{dateLongue()}</span>
            </p>
            <h2 className="text-2xl md:text-3xl font-bold mt-2">
              {greeting()}
            </h2>
            <p className="text-sm text-snde-100/90 mt-2 max-w-2xl">
              Sélectionne un centre et une période pour lancer le croisement
              État&nbsp;Mutation ×&nbsp;EGF.
              Tu peux aussi utiliser un raccourci ci-dessous pour démarrer .
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-xs">
            <Clock size={14} />
            Période en cache&nbsp;: <span className="font-semibold">{periode}</span>
          </div>
        </div>
      </div>

      {/* ── KPI de bienvenue ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi
          label="Mutations en cache" icon={FileText} tone="info"
          value={status === null ? '—' : (status?.mutations ?? 0).toLocaleString('fr-FR')}
          sub="3 mois glissants"
        />
        <MiniKpi
          label="Factures EGF" icon={Database} tone="info"
          value={status === null ? '—' : (status?.egf ?? 0).toLocaleString('fr-FR')}
          sub="croisement disponible"
        />
        <MiniKpi
          label="Centres" icon={Building2} tone="emerald"
          value={status === null ? '—' : (status?.centres ?? 0)}
          sub="Nouakchott — ZONE_ID 2"
        />
        <MiniKpi
          label="Dernière synchro" icon={Clock} tone="amber"
          value={status?.status === 'ok' ? '✓ OK' : (status?.status || '—')}
          sub={status?.duration_seconds ? `${Number(status.duration_seconds).toFixed(1)}s` : '—'}
        />
      </div>

      {/* ── Raccourcis ───────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-snde-700" />
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Démarrage rapide</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ShortcutCard
            icon={CalendarDays} color="snde"
            title="Audit du jour"
            desc="Mutations validées aujourd'hui · EGF du mois en cours"
            onClick={presetAujourdhui}
          />
          <ShortcutCard
            icon={CalendarDays} color="emerald"
            title="Mois en cours"
            desc="Mutations depuis le 1ᵉʳ du mois · EGF sur 3 mois glissants"
            onClick={presetMois}
          />
          <ShortcutCard
            icon={History} color="amber"
            title={recent.length > 0 ? 'Reprendre le dernier' : 'Aucun chargement récent'}
            desc={
              recent.length > 0
                ? `${recent[0].centreNom || recent[0].centreCode} · ${recent[0].mutDeb} → ${recent[0].mutFin}`
                : 'Tes prochains chargements apparaîtront ici'
            }
            onClick={recent.length > 0 ? presetDernier : undefined}
          />
        </div>
      </div>

      {/* ── Activité récente ─────────────────────────────── */}
      
    </div>
  )
}