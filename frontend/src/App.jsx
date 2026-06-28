// src/App.jsx
// 🆕 v5.6 — Bandeau d'alerte RealtimeAlert (demandes validées) en haut de page,
//          cliquable, bascule vers l'onglet Nouveautés
// 🆕 v5.2 — Toggle Audit / Nouveautés avec badge
// 🆕 v5.0 — RealtimeProvider + ToastContainer

import { useEffect, useState, useRef } from 'react'
import { Sparkles, LayoutGrid } from 'lucide-react'

import MutationsPage    from './pages/MutationsPage.jsx'
import SyncBanner       from './components/SyncBanner.jsx'
import ToastContainer   from './components/ToastContainer.jsx'
import NouveautesPanel  from './components/NouveautesPanel.jsx'
import RealtimeAlert    from './components/RealtimeAlert.jsx'
import { RealtimeProvider, useServerEvent } from './lib/realtime'
import { countNouvelles } from './lib/apiClient'

function NavToggle({ view, onChange, badge }) {
  const tabs = [
    { id: 'audit',      label: 'Audit complet',  icon: LayoutGrid },
    { id: 'nouveautes', label: 'Nouveautés',     icon: Sparkles, badge },
  ]
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      {tabs.map((t) => {
        const Icon = t.icon
        const active = view === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} />
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function AppContent() {
  const [view, setView]     = useState('audit')
  const [badge, setBadge]   = useState(0)
  const [alertTrigger, setAlertTrigger] = useState(0)   // 🆕 v5.7 — incrémenté à chaque clic alerte
  const alertRef            = useRef(null)

  // Compteur initial (toutes nouvelles non contrôlées du jour, validées + autres)
  useEffect(() => {
    countNouvelles({ since: 'today' }).then(setBadge).catch(() => setBadge(0))
  }, [])

  useServerEvent('data_changed', () => {
    // Rafraîchit le badge à chaque sync
    countNouvelles({ since: 'today' }).then(setBadge).catch(() => {})
  })

  // Quand l'utilisateur ouvre la vue nouveautés, on recompte + on dismiss le bandeau
  useEffect(() => {
    if (view === 'nouveautes') {
      countNouvelles({ since: 'today' }).then(setBadge).catch(() => {})
      // Cache le bandeau d'alerte (l'utilisateur va voir les nouveautés)
      if (alertRef.current) alertRef.current.dismiss()
    }
  }, [view])

  const handleGoToNouveautes = () => {
    setView('nouveautes')
    setAlertTrigger((t) => t + 1)   // 🆕 v5.7 — déclenche le filtrage "validées du jour"
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1500px] mx-auto px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">
              SNDE Analytics — Mutations &amp; Facturation
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Audit du croisement État Mutation × EGF — temps réel via Oracle CRM_SNDE
            </p>
          </div>
          <div className="flex items-center gap-4">
            <NavToggle view={view} onChange={setView} badge={badge} />
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              Lecture seule sur la prod
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-8 py-6 space-y-4">
        {/* 🆕 v5.6 — Bandeau d'alerte pour nouvelles validées */}
        <RealtimeAlert ref={alertRef} onGoToNouveautes={handleGoToNouveautes} />

        <SyncBanner />
        {view === 'audit'      && <MutationsPage />}
        {view === 'nouveautes' && <NouveautesPanel alertTrigger={alertTrigger} />}
      </main>

      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <RealtimeProvider>
      <AppContent />
    </RealtimeProvider>
  )
}