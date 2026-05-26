import { SEUILS } from './analytics.js'

export const fmt = (n, d = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d })

export const pct = (n) => `${(n * 100).toFixed(1)} %`

export const COLORS_ETAT = {
  'COMPTEUR ACCESSIBLE':   '#10b981',
  'COMPTEUR INACCESSIBLE': '#f59e0b',
  'COMPTEUR ILLISIBLE':    '#f97316',
  'COMPTEUR BLOQUE':       '#ef4444',
  'COMPTEUR DEFECTUEUX':   '#7c3aed',
  'AUTRE':                 '#94a3b8',
}

export const colorForAccess = (t) =>
  t >= SEUILS.TAUX_ACCESS_CIBLE ? 'text-emerald-700' :
  t >= 0.7                      ? 'text-amber-700'  : 'text-red-700'
