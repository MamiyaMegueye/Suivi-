// src/lib/exportUtils.js
// 🆕 v5.7 — Helpers d'export Excel mutualisés (GC + Anomalies + génériques)
//
// Reproduit exactement la logique d'export et de classification GC déjà
// présente dans pages/MutationsPage.jsx, mais factorisée pour pouvoir
// l'utiliser aussi depuis l'onglet Nouveautés.

import * as XLSX from 'xlsx'

/* ── Gros consommateurs : secteurs 04 / 4 / 08 / 8 ─────────────────── */
export const SECTEURS_GROS_CONSO = new Set(['04', '4', '08', '8'])

export const estGrosConsommateur = (secteur) => {
  if (!secteur) return false
  return SECTEURS_GROS_CONSO.has(String(secteur).trim())
}

export const normaliseSecteurGC = (secteur) => {
  const s = String(secteur || '').trim()
  if (s === '4' || s === '04') return '04'
  if (s === '8' || s === '08') return '08'
  return s
}

/* ── Statut unifié d'une demande ───────────────────────────────────── */
export const statutDemande = (r) => {
  if (r.annule === 'OUI') return 'Annulé'
  if (r.valide === 'OUI') return 'Validé'
  return 'En attente'
}

/* ── Export Excel générique ────────────────────────────────────────── */
export function exportToExcel(rows, baseFilename, sheetName = 'Données', columnMap = null) {
  if (!rows || rows.length === 0) {
    alert('Aucune donnée à exporter')
    return
  }
  const formatted = columnMap
    ? rows.map(r => {
        const out = {}
        for (const [key, label] of Object.entries(columnMap)) {
          out[label] = r[key] ?? ''
        }
        return out
      })
    : rows
  const ws = XLSX.utils.json_to_sheet(formatted)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30))
  const ts = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${baseFilename}_${ts}.xlsx`)
}

/* ── Mappings de colonnes pour les exports ─────────────────────────── */
export const COLS_GC = {
  numDemande:   'Num Demande',
  refAbo:       'Réf Abo',
  client:       'Client',
  typeDemande:  'Type Demande',
  typeMutation: 'Type Mutation',
  statut:       'Statut',
  dateStr:      'Date',
  nomCentre:    'Centre',
  secteur:      'Secteur',
  numCompteur:  'Num Compteur',   // 🆕 v5.7
  creePar:      'Créé par',       // 🆕 v5.7
  adresse:      'Adresse',
}

export const COLS_ANOMALIES = {
  regle:        'Règle',
  gravite:      'Gravité',
  numDemande:   'Num Demande',
  refAbo:       'Réf Abo',
  nomClient:    'Client',
  typeMutation: 'Type Mutation',
  dateDemande:  'Date Demande',
  nomCentre:    'Centre',
  secteur:      'Secteur',
  numCompteur:  'Num Compteur',   // 🆕 v5.7
  creePar:      'Créé par',       // 🆕 v5.7
  adresse:      'Adresse',
  detail:       'Détail',
}