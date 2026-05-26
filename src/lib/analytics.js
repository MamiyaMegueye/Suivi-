/**
 * Analyses métier pour la direction Contrôle & Audit.
 * Supporte multi-centres / multi-secteurs.
 */
import { normEtat } from './parser.js'

// Seuils métier paramétrables
export const SEUILS = {
  CONSO_FAIBLE: 5,
  CONSO_NULLE: 0,
  CONSO_ELEVEE: 100,
  CONSO_TROP_ELEVEE: 300,
  TAUX_ACCESS_CIBLE: 0.85,
  TAUX_NON_RELEVE_ALERTE: 0.20,
  SEUIL_TARIF_NON_DOM: 10,
  SEUIL_DOMESTIQUE_ELEVE: 100,
}

export const ETATS_COMPTAGE = [
  'COMPTEUR ACCESSIBLE',
  'COMPTEUR INACCESSIBLE',
  'COMPTEUR ILLISIBLE',
  'COMPTEUR BLOQUE',
  'COMPTEUR DEFECTUEUX',
]

/* =====================================================================
 *  CATALOGUE CENTRAL DES ANOMALIES
 * ===================================================================== */
export const CATALOGUE_ANOMALIES = [
  {
    key: 'INDEX_FIGE',
    label: 'Index figé (accessible)',
    desc: "Ancien = Nouvel index alors que l'état est « accessible » : le compteur ne tourne pas, fraude ou erreur non signalée.",
    gravite: 'haute',
    test: (a) => a.indexFige,
  },
  {
    key: 'INDEX_REGRESSIF',
    label: 'Index régressif',
    desc: 'Nouvel index inférieur à l\'ancien — physiquement impossible (saisie erronée ou compteur remplacé sans RAZ).',
    gravite: 'haute',
    test: (a) => a.indexRegressif,
  },
  {
    key: 'ABONNE_FANTOME',
    label: 'Abonné fantôme',
    desc: 'Accessible mais Ancien = Nouvel = Conso = 0 : abonnement sans activité réelle.',
    gravite: 'haute',
    test: (a) => a.fantome,
  },
  {
    key: 'DOUBLON_COMPTEUR',
    label: 'N° compteur en doublon',
    desc: 'Même numéro de compteur sur plusieurs abonnements — impossible physiquement.',
    gravite: 'haute',
    test: (a) => a.doublonCompteur,
  },
  {
    key: 'SAUT_BRUTAL',
    label: 'Saut brutal (> 5× moyenne)',
    desc: "Conso actuelle dépasse 5 fois la moyenne historique sur compteur accessible : fuite probable, fraude antérieure découverte ou commerce dissimulé.",
    gravite: 'haute',
    test: (a) => a.sautBrutal,
  },
  {
    key: 'CONSO_EQ_MOYENNE',
    label: 'Conso = moyenne exacte (accessible)',
    desc: "La consommation déclarée est strictement égale à la moyenne historique. La probabilité statistique d'un tel résultat sur un relevé réel est quasi nulle : le releveur a probablement recopié la moyenne sans aller sur le terrain.",
    gravite: 'haute',
    test: (a) => a.consoEqualsMoyenne,
  },
  {
    key: 'PERIODE_ANORMALE',
    label: 'Période anormale (accessible)',
    desc: "Compteur déclaré accessible mais nb_jours hors plage normale (< 30 ou > 90 jours). Si l'accès était réel, la période devrait correspondre au cycle bimestriel (~60j). Suspicion de relevé fictif ou de retard.",
    gravite: 'moyenne',
    test: (a) => a.periodeAnormale,
  },
  {
    key: 'CONSO_EQ_ANCIEN',
    label: 'Conso = ancien index',
    desc: "La valeur saisie en consommation est strictement égale à l'ancien index : erreur de saisie classique, le releveur a confondu les colonnes.",
    gravite: 'moyenne',
    test: (a) => a.consoEqualsAnc,
  },
  {
    key: 'CONSO_EQ_NOUVEL',
    label: 'Conso = nouvel index',
    desc: "La valeur saisie en consommation est strictement égale au nouvel index : le releveur a oublié de soustraire l'ancien index.",
    gravite: 'moyenne',
    test: (a) => a.consoEqualsNv,
  },
  {
    key: 'INDEX_ROND',
    label: 'Index nouveau rond (multiple de 100)',
    desc: 'Nouvel index = 100, 200, 300… sur compteur accessible. Un compteur réel tombe rarement pile sur 100 — présomption d\'arrondi par le releveur.',
    gravite: 'basse',
    test: (a) => a.indexRond,
  },
  {
    key: 'COMPTEUR_NUL',
    label: 'N° compteur manquant / 0',
    desc: 'Numéro de compteur vide ou égal à 0 : aucune traçabilité physique possible.',
    gravite: 'moyenne',
    test: (a) => a.compteurNul,
  },
  {
    key: 'INCOHERENCE_INDEX',
    label: 'Incohérence index/conso',
    desc: '(Nouvel − Ancien) ≠ consommation déclarée sur un compteur accessible.',
    gravite: 'moyenne',
    test: (a) => a.incoherenceIndex,
  },
  {
    key: 'TARIF_INADAPTE',
    label: 'Tarif inadapté (Indus/Com < 10 m³)',
    desc: 'Abonné industriel/commercial avec une moyenne < 10 m³ : tarif probablement inadapté, manque-à-gagner.',
    gravite: 'moyenne',
    test: (a) => a.tarifInadapte,
  },
  {
    key: 'DOMESTIQUE_ELEVE',
    label: 'Domestique > 100 m³',
    desc: 'Abonné domestique avec conso > 100 m³/période : fuite, sous-location ou usage non déclaré.',
    gravite: 'moyenne',
    test: (a) => a.domestiqueEleve,
  },
  {
    key: 'TARIF_MANQUANT',
    label: 'Tarif manquant',
    desc: 'Aucun tarif renseigné : facturation et catégorisation impossibles.',
    gravite: 'moyenne',
    test: (a) => a.tarifManquant,
  },
]

export const GRAVITE_COLOR = {
  haute:   '#ef4444',
  moyenne: '#f59e0b',
  basse:   '#3b82f6',
}

/* =====================================================================
 *  KPI GLOBAUX
 * ===================================================================== */
export function computeKPIs(abos) {
  const total = abos.length
  if (total === 0) return null

  const byEtat = {}
  for (const e of ETATS_COMPTAGE) byEtat[e] = 0
  byEtat['AUTRE'] = 0

  let accessible = 0
  let nonReleves = 0
  let consoSum = 0
  let consoFaibleCount = 0
  let consoNulleCount = 0
  let consoElevee = 0
  let consoTropElevee = 0
  let incoherenceCount = 0
  let coupesCount = 0
  let cartesNonRetournees = 0
  let indexFigeCount = 0
  let indexRegressifCount = 0
  let fantomeCount = 0
  let doublonCount = 0
  let compteurNulCount = 0
  let tarifInadapteCount = 0
  let domestiqueEleveCount = 0
  let tarifManquantCount = 0
  let sautBrutalCount = 0
  let indexRondCount = 0
  let consoEqAncCount = 0
  let consoEqNvCount = 0
  let periodeAnormaleCount = 0
  let consoEqMoyenneCount = 0

  for (const a of abos) {
    const etat = normEtat(a.etatComptage)
    byEtat[etat] = (byEtat[etat] || 0) + 1

    if (etat === 'COMPTEUR ACCESSIBLE') accessible++
    else if (['COMPTEUR INACCESSIBLE','COMPTEUR ILLISIBLE','COMPTEUR BLOQUE','COMPTEUR DEFECTUEUX'].includes(etat)) {
      nonReleves++
    }

    const c = a.consoRetenue ?? a.consommation
    if (c !== null && c !== undefined) {
      consoSum += c
      if (c === 0) consoNulleCount++
      else if (c < SEUILS.CONSO_FAIBLE) consoFaibleCount++
      if (c >= SEUILS.CONSO_ELEVEE) consoElevee++
      if (c >= SEUILS.CONSO_TROP_ELEVEE) consoTropElevee++
    }
    if (a.incoherenceIndex) incoherenceCount++
    if ((a.coupee || '').toLowerCase().includes('coup')) coupesCount++
    if ((a.carteNonRetournee || '').toLowerCase() === 'oui') cartesNonRetournees++

    if (a.indexFige) indexFigeCount++
    if (a.indexRegressif) indexRegressifCount++
    if (a.fantome) fantomeCount++
    if (a.doublonCompteur) doublonCount++
    if (a.compteurNul) compteurNulCount++
    if (a.tarifInadapte) tarifInadapteCount++
    if (a.domestiqueEleve) domestiqueEleveCount++
    if (a.tarifManquant) tarifManquantCount++

    if (a.sautBrutal) sautBrutalCount++
    if (a.indexRond) indexRondCount++
    if (a.consoEqualsAnc) consoEqAncCount++
    if (a.consoEqualsNv) consoEqNvCount++
    if (a.periodeAnormale) periodeAnormaleCount++
    if (a.consoEqualsMoyenne) consoEqMoyenneCount++
  }

  return {
    total, accessible, nonReleves,
    tauxAccessibilite: accessible / total,
    tauxNonReleve: nonReleves / total,
    consoMoyenne: total > 0 ? consoSum / total : 0,
    consoTotale: consoSum,
    consoNulleCount, consoFaibleCount, consoElevee, consoTropElevee,
    incoherenceCount, coupesCount, cartesNonRetournees, byEtat,
    indexFigeCount, indexRegressifCount, fantomeCount, doublonCount,
    compteurNulCount, tarifInadapteCount, domestiqueEleveCount, tarifManquantCount,
    sautBrutalCount, indexRondCount, consoEqAncCount, consoEqNvCount,
    periodeAnormaleCount, consoEqMoyenneCount,
  }
}

export function repartitionEtats(abos) {
  const counts = {}
  for (const a of abos) {
    const e = normEtat(a.etatComptage)
    counts[e] = (counts[e] || 0) + 1
  }
  return Object.entries(counts).map(([etat, count]) => ({
    etat, count,
    pct: abos.length > 0 ? (count / abos.length) * 100 : 0
  })).sort((a, b) => b.count - a.count)
}

/* =====================================================================
 *  ANOMALIES — comptage à partir du catalogue
 * ===================================================================== */
export function comptageAnomalies(abos) {
  const total = abos.length || 1
  return CATALOGUE_ANOMALIES.map(def => {
    const count = abos.reduce((n, a) => n + (def.test(a) ? 1 : 0), 0)
    return { ...def, count, pct: (count / total) * 100 }
  }).sort((a, b) => b.count - a.count)
}

export function abosAvecAnomalie(abos, key = null) {
  if (key) {
    const def = CATALOGUE_ANOMALIES.find(d => d.key === key)
    return def ? abos.filter(def.test) : []
  }
  return abos.filter(a => CATALOGUE_ANOMALIES.some(d => d.test(a)))
}

export function analyseReleveurs(abos) {
  const map = {}
  for (const a of abos) {
    const m = a.matricule || 'NON_AFFECTE'
    if (!map[m]) {
      map[m] = {
        matricule: m, total: 0,
        accessible: 0, inaccessible: 0, illisible: 0, bloque: 0, defectueux: 0,
        consoNulle: 0, consoFaible: 0,
        consoTotale: 0, consoSommeMoyenne: 0,
        incoherences: 0, indexFige: 0,
        sautBrutal: 0, consoEqMoyenne: 0, periodeAnormale: 0, indexRond: 0,
        centres: new Set(), secteurs: new Set(),
      }
    }
    const r = map[m]
    r.total++
    r.centres.add(a.centre)
    r.secteurs.add(a.secteur)
    const e = normEtat(a.etatComptage)
    if (e === 'COMPTEUR ACCESSIBLE') r.accessible++
    else if (e === 'COMPTEUR INACCESSIBLE') r.inaccessible++
    else if (e === 'COMPTEUR ILLISIBLE') r.illisible++
    else if (e === 'COMPTEUR BLOQUE') r.bloque++
    else if (e === 'COMPTEUR DEFECTUEUX') r.defectueux++

    const c = a.consoRetenue ?? a.consommation
    if (c === 0) r.consoNulle++
    if (c !== null && c > 0 && c < SEUILS.CONSO_FAIBLE) r.consoFaible++
    if (c !== null) r.consoTotale += c
    if (a.consMoyenne !== null) r.consoSommeMoyenne += a.consMoyenne
    if (a.incoherenceIndex) r.incoherences++
    if (a.indexFige) r.indexFige++
    if (a.sautBrutal) r.sautBrutal++
    if (a.consoEqualsMoyenne) r.consoEqMoyenne++
    if (a.periodeAnormale) r.periodeAnormale++
    if (a.indexRond) r.indexRond++
  }
  return Object.values(map).map(r => ({
    ...r,
    nbCentres: r.centres.size,
    nbSecteurs: r.secteurs.size,
    centres: [...r.centres].join(', '),
    secteurs: [...r.secteurs].join(', '),
    tauxAccess: r.total > 0 ? r.accessible / r.total : 0,
    tauxNonReleve: r.total > 0 ? (r.inaccessible + r.illisible + r.bloque + r.defectueux) / r.total : 0,
    consoMoyenne: r.total > 0 ? r.consoTotale / r.total : 0,
  })).sort((a, b) => b.total - a.total)
}

export function analyseAnomaliesSource(abos) {
  const counts = {}
  for (const a of abos) {
    if (a.anomalies) {
      const norm = a.anomalies.trim().replace(/\s+/g, ' ')
      counts[norm] = (counts[norm] || 0) + 1
    }
  }
  return Object.entries(counts)
    .map(([anomalie, count]) => ({ anomalie, count, pct: (count / abos.length) * 100 }))
    .sort((a, b) => b.count - a.count)
}

export function distributionConso(abos) {
  const tranches = [
    { label: '0',       min: 0,    max: 0.01, count: 0 },
    { label: '1-5',     min: 0.01, max: 5,    count: 0 },
    { label: '6-15',    min: 5,    max: 15,   count: 0 },
    { label: '16-30',   min: 15,   max: 30,   count: 0 },
    { label: '31-50',   min: 30,   max: 50,   count: 0 },
    { label: '51-100',  min: 50,   max: 100,  count: 0 },
    { label: '101-300', min: 100,  max: 300,  count: 0 },
    { label: '>300',    min: 300,  max: Infinity, count: 0 },
  ]
  for (const a of abos) {
    const c = a.consoRetenue ?? a.consommation
    if (c === null || c === undefined) continue
    if (c === 0) { tranches[0].count++; continue }
    for (const t of tranches) {
      if (t.label === '0') continue
      if (c >= t.min && c < t.max) { t.count++; break }
    }
  }
  return tranches
}

export function casCritiques(abos) {
  return abos.filter(a =>
    a.indexFige || a.indexRegressif || a.fantome || a.doublonCompteur ||
    a.sautBrutal || a.consoEqualsMoyenne ||
    a.incoherenceIndex ||
    ((a.consoRetenue ?? a.consommation ?? 0) >= SEUILS.CONSO_TROP_ELEVEE) ||
    (normEtat(a.etatComptage) === 'COMPTEUR BLOQUE') ||
    ((a.carteNonRetournee || '').toLowerCase() === 'oui')
  )
}

export function topConsommateurs(abos, n = 20) {
  return [...abos]
    .filter(a => (a.consoRetenue ?? a.consommation) !== null)
    .sort((a, b) => (b.consoRetenue ?? b.consommation ?? 0) - (a.consoRetenue ?? a.consommation ?? 0))
    .slice(0, n)
}

export function consosFaibles(abos, n = 30) {
  return [...abos]
    .filter(a => {
      const c = a.consoRetenue ?? a.consommation
      return c !== null && c > 0 && c < SEUILS.CONSO_FAIBLE &&
             normEtat(a.etatComptage) === 'COMPTEUR ACCESSIBLE'
    })
    .sort((a, b) => (a.consoRetenue ?? a.consommation ?? 0) - (b.consoRetenue ?? b.consommation ?? 0))
    .slice(0, n)
}

export function volumeEstimeVsReel(abos) {
  let volumeReleve = 0, volumeEstime = 0, nbReleve = 0, nbEstime = 0
  for (const a of abos) {
    const c = a.consoRetenue ?? a.consommation
    if (c === null || c === undefined) continue
    if (a.typeConso === 'RELEVEE') { volumeReleve += c; nbReleve++ }
    else if (a.typeConso === 'ESTIMEE' || a.typeConso === 'ESTIMEE_BLOQUE') { volumeEstime += c; nbEstime++ }
  }
  const total = volumeReleve + volumeEstime
  return {
    volumeReleve, volumeEstime, nbReleve, nbEstime,
    totalVolume: total,
    pctVolumeEstime: total > 0 ? (volumeEstime / total) * 100 : 0,
    pctNbEstime: (nbReleve + nbEstime) > 0 ? (nbEstime / (nbReleve + nbEstime)) * 100 : 0,
  }
}

export function analyseTarifs(abos) {
  const map = {}
  for (const a of abos) {
    const t = a.tarif || 'NON RENSEIGNE'
    if (!map[t]) map[t] = { tarif: t, count: 0, consoTotale: 0 }
    map[t].count++
    const c = a.consoRetenue ?? a.consommation
    if (c !== null && c !== undefined) map[t].consoTotale += c
  }
  return Object.values(map)
    .map(t => ({ ...t, consoMoyenne: t.count > 0 ? t.consoTotale / t.count : 0 }))
    .sort((a, b) => b.count - a.count)
}

/* =====================================================================
 *  AGRÉGATIONS PAR CENTRE & PAR SECTEUR
 *  Tri par nombre d'abonnés décroissant (plus simple à expliquer)
 * ===================================================================== */
export function syntheseParCentre(abos) {
  const map = {}
  for (const a of abos) {
    const c = a.centre || 'CENTRE_INCONNU'
    if (!map[c]) map[c] = { centre: c, abos: [], secteurs: new Set() }
    map[c].abos.push(a)
    map[c].secteurs.add(a.secteur)
  }

  return Object.values(map)
    .map(({ centre, abos, secteurs }) => {
      const k = computeKPIs(abos)
      return {
        centre,
        nbSecteurs: secteurs.size,
        secteursListe: [...secteurs].sort().join(', '),
        total: k.total,
        accessible: k.accessible,
        nonReleves: k.nonReleves,
        tauxAccess: k.tauxAccessibilite,
        tauxNonReleve: k.tauxNonReleve,
        consoNulle: k.consoNulleCount,
        consoFaible: k.consoFaibleCount,
        consoTropElevee: k.consoTropElevee,
        incoherences: k.incoherenceCount,
        indexFige: k.indexFigeCount,
        indexRegressif: k.indexRegressifCount,
        fantome: k.fantomeCount,
        doublon: k.doublonCount,
        sautBrutal: k.sautBrutalCount,
        consoEqMoyenne: k.consoEqMoyenneCount,
        consoTotale: k.consoTotale,
        consoMoyenne: k.consoMoyenne,
        cartesNonRetournees: k.cartesNonRetournees,
      }
    })
    .sort((a, b) => b.total - a.total)
}

export function syntheseParSecteur(abos, centre = null) {
  const filtered = centre ? abos.filter(a => a.centre === centre) : abos
  const map = {}
  for (const a of filtered) {
    const key = `${a.centre}||${a.secteur}`
    if (!map[key]) map[key] = { centre: a.centre, secteur: a.secteur, abos: [] }
    map[key].abos.push(a)
  }
  return Object.values(map)
    .map(({ centre, secteur, abos }) => {
      const k = computeKPIs(abos)
      return {
        centre, secteur,
        total: k.total,
        accessible: k.accessible,
        nonReleves: k.nonReleves,
        tauxAccess: k.tauxAccessibilite,
        tauxNonReleve: k.tauxNonReleve,
        consoNulle: k.consoNulleCount,
        consoFaible: k.consoFaibleCount,
        consoTropElevee: k.consoTropElevee,
        incoherences: k.incoherenceCount,
        indexFige: k.indexFigeCount,
        indexRegressif: k.indexRegressifCount,
        fantome: k.fantomeCount,
        doublon: k.doublonCount,
        sautBrutal: k.sautBrutalCount,
        consoEqMoyenne: k.consoEqMoyenneCount,
        consoTotale: k.consoTotale,
        consoMoyenne: k.consoMoyenne,
        cartesNonRetournees: k.cartesNonRetournees,
      }
    })
    .sort((a, b) => {
      // Tri : d'abord par centre, puis par nombre d'abos décroissant
      if (a.centre !== b.centre) return a.centre.localeCompare(b.centre)
      return b.total - a.total
    })
}

export function filtrer(abos, centre = 'TOUS', secteur = 'TOUS') {
  return abos.filter(a => {
    if (centre !== 'TOUS' && a.centre !== centre) return false
    if (secteur !== 'TOUS' && a.secteur !== secteur) return false
    return true
  })
}

export function secteursDuCentre(abos, centre) {
  if (centre === 'TOUS') return [...new Set(abos.map(a => a.secteur))].sort()
  return [...new Set(abos.filter(a => a.centre === centre).map(a => a.secteur))].sort()
}
