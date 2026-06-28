// src/components/NouveauteCard.jsx
// 🆕 v5.2 — Carte individuelle dans l'onglet "Nouveautés".
// Affiche toutes les infos de la demande + un bouton "✓ Contrôler"
// qui fait disparaître la carte (marque comme contrôlée côté backend).

import { Check, MapPin, User, Hash, Calendar, Sparkles, X } from 'lucide-react'

const STATUT_STYLE = {
  Validé:     { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Validé' },
  Annulé:     { bg: 'bg-red-100 text-red-700 border-red-200',           label: 'Annulé' },
  Attente:    { bg: 'bg-amber-100 text-amber-700 border-amber-200',     label: 'En attente' },
}

const TYPE_COLOR = {
  'Mutation':              'bg-indigo-100 text-indigo-700',
  'Nouveau Branchement':   'bg-blue-100 text-blue-700',
  'Réabonnement':          'bg-violet-100 text-violet-700',
  'Résiliation':           'bg-red-100 text-red-700',
}

function statutDe(r) {
  if (r.annule === 'OUI') return 'Annulé'
  if (r.valide === 'OUI') return 'Validé'
  return 'Attente'
}

export default function NouveauteCard({ mutation, onOpen, onControler, busy }) {
  const statut = statutDe(mutation)
  const styleStatut = STATUT_STYLE[statut]
  const colorType = TYPE_COLOR[mutation.typeDemande] || 'bg-slate-100 text-slate-700'

  return (
    <div
      onClick={onOpen}
      className="group relative bg-white rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all p-4 cursor-pointer flex flex-col gap-2"
    >
      {/* Badge "NOUVEAU" en coin */}
      <div className="absolute -top-2 -left-2 flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
        <Sparkles size={10} />
        NOUVEAU
      </div>

      {/* Bouton contrôler en haut à droite */}
      <button
        onClick={(e) => { e.stopPropagation(); onControler() }}
        disabled={busy}
        title="Marquer comme contrôlée (la carte disparaît)"
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-500 transition-all flex items-center justify-center disabled:opacity-40"
      >
        <Check size={14} />
      </button>

      {/* Header : Centre + Type */}
      <div className="flex items-center justify-between mt-2 pr-8">
        <h3 className="font-bold text-slate-800 text-sm truncate">{mutation.nomCentre || '—'}</h3>
      </div>

      {/* Type + statut */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colorType}`}>
          {mutation.typeDemande || '—'}
        </span>
        {mutation.typeMutation && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {mutation.typeMutation}
          </span>
        )}
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${styleStatut.bg}`}>
          {styleStatut.label}
        </span>
      </div>

      {/* Client */}
      <div className="flex items-start gap-2 text-xs text-slate-600">
        <User size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
        <span className="truncate font-medium">{mutation.client || '—'}</span>
      </div>

      {/* Référence */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Hash size={13} className="text-slate-400 flex-shrink-0" />
        <span className="font-mono">
          Réf <strong className="text-slate-700">{mutation.refAbo || '—'}</strong>
        </span>
        {mutation.codeClient && (
          <span className="text-slate-400 text-[10px]">· client {mutation.codeClient}</span>
        )}
      </div>

      {/* Adresse */}
      {mutation.adresse && (
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{mutation.adresse}</span>
        </div>
      )}

      {/* Secteur + tournée + date */}
      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 pt-2 border-t border-slate-100">
        <span title="Secteur">📍 sect. <strong>{mutation.secteur || '—'}</strong></span>
        {mutation.tournee && <span title="Tournée">🚐 t. <strong>{mutation.tournee}</strong></span>}
        <span className="ml-auto flex items-center gap-1">
          <Calendar size={10} />
          {mutation.dateStr}
        </span>
      </div>

      {/* Footer hint */}
      <div className="text-[10px] text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
        ↗ Cliquer pour auditer
      </div>

      {/* Num demande discret en bas */}
      <div className="text-[9px] text-slate-300 font-mono absolute bottom-1 right-3">
        #{mutation.numDemande}
      </div>
    </div>
  )
}