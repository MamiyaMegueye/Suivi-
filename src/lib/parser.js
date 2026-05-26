import * as XLSX from 'xlsx'

/**
 * Parser de l'État 101 (Liste des cartes relèves par secteur)
 *
 * Gère :
 *  - Plusieurs CENTRES dans un même fichier
 *  - Plusieurs SECTEURS par centre
 *  - Chaque section est introduite par une ligne "centre: X-NOM   Secteur : Y-NOM   Mois : N   annee : AAAA"
 *  - Chaque ABONNEMENT occupe 2 lignes (ligne A : index/conso, ligne B : état/tarif)
 *
 * Le calcul de la consommation et la détection des anomalies dépendent de
 * l'ÉTAT DE COMPTAGE (accessible / inaccessible / bloqué / illisible / défectueux).
 */

const COL = {
  REF_ABO: 1,
  ANC_REF: 4,
  NUM_COMPTEUR: 5,
  ANCIEN_INDEX: 6,
  NOUVEL_INDEX: 7,
  RAZ: 8,
  CONSOMMATION: 9,
  CONS_MOYENNE: 10,
  ANOMALIES: 11,
  ETAT_COMPTAGE: 12,
  NB_JOURS: 13,
  MATRICULE: 14,
  CARTE_NON_RETOUR: 15,
  COUPEE: 16,
  DATE_COUPURE: 17,
  TARIF: 18,
  MESSAGE: 19,
}

const clean = (v) => {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* =====================================================================
 *  NORMALISATION DE L'ÉTAT DE COMPTAGE
 * ===================================================================== */
export const normEtat = (e) => {
  if (!e) return 'AUTRE'
  const E = e.toUpperCase()
  if (E.includes('INACCESSIBLE')) return 'COMPTEUR INACCESSIBLE'
  if (E.includes('ACCESSIBLE'))   return 'COMPTEUR ACCESSIBLE'
  if (E.includes('ILLISIBLE'))    return 'COMPTEUR ILLISIBLE'
  if (E.includes('BLOQU'))        return 'COMPTEUR BLOQUE'
  if (E.includes('DEFECT'))       return 'COMPTEUR DEFECTUEUX'
  return 'AUTRE'
}

// Catégorie tarifaire simplifiée (pour détecter tarif inadapté)
export const categorieTarif = (tarif) => {
  if (!tarif) return 'INCONNU'
  const T = tarif.toUpperCase()
  if (/(INDUS|COMMERC|ADMIN|PROFESS|SOCIETE|ENTREPR)/.test(T)) return 'NON_DOMESTIQUE'
  if (/(DOMEST|MENAGE|RESID|PARTICUL|SOCIAL)/.test(T)) return 'DOMESTIQUE'
  return 'AUTRE'
}

const parseHeaderLine = (row) => {
  for (const cell of row) {
    if (typeof cell !== 'string') continue
    if (!/centre\s*:/i.test(cell)) continue

    const text = cell
    const centreMatch  = text.match(/centre\s*:\s*(.+?)(?=\s+Secteur\s*:|\s*$)/i)
    const secteurMatch = text.match(/Secteur\s*:\s*(.+?)(?=\s+Mois\s*:|\s*$)/i)
    const moisMatch    = text.match(/Mois\s*:\s*(\d+)/i)
    const anneeMatch   = text.match(/ann[ée]e\s*:\s*(\d+)/i)

    return {
      centre:  centreMatch  ? clean(centreMatch[1])  : 'CENTRE_INCONNU',
      secteur: secteurMatch ? clean(secteurMatch[1]) : 'SECTEUR_INCONNU',
      mois:    moisMatch    ? parseInt(moisMatch[1], 10)  : null,
      annee:   anneeMatch   ? parseInt(anneeMatch[1], 10) : null,
    }
  }
  return null
}

const isLineA = (row) => {
  const ref = row[COL.REF_ABO]
  const idx = row[COL.NOUVEL_INDEX]
  return ref !== null && ref !== undefined && ref !== '' &&
         idx !== null && idx !== undefined && idx !== ''
}

const isLineB = (row) => {
  const etat = row[COL.ETAT_COMPTAGE]
  return typeof etat === 'string' && /COMPTEUR/i.test(etat)
}

/* =====================================================================
 *  PARAMÈTRES DES NOUVEAUX DÉTECTEURS (modifiables si besoin)
 * ===================================================================== */
const RATIO_SAUT_BRUTAL   = 5    // conso > 5 × moyenne historique
const NB_JOURS_MIN_NORMAL = 30   // période normale minimale (jours)
const NB_JOURS_MAX_NORMAL = 90   // période normale maximale (jours)

/* =====================================================================
 *  CALCUL CONSO + DÉTECTION DES ANOMALIES (par abonnement)
 *  Note : les anomalies "globales" (doublons compteur) sont calculées
 *  dans un second passage car elles nécessitent toute la population.
 * ===================================================================== */
const analyseAbonnement = ({ anc, nv, conso, consMoy, etat, numCompteur, tarif, nbJours }, coefBloque = 1.0) => {
  const etatNorm = normEtat(etat)
  const isAccessible = etatNorm === 'COMPTEUR ACCESSIBLE'
  const isInaccessible = etatNorm === 'COMPTEUR INACCESSIBLE' || etatNorm === 'COMPTEUR ILLISIBLE' || etatNorm === 'COMPTEUR DEFECTUEUX'
  const isBloque = etatNorm === 'COMPTEUR BLOQUE'

  const diff = (anc !== null && nv !== null) ? nv - anc : null

  // --- Consommation retenue selon l'état ---
  let consoRetenue, typeConso
  if (isAccessible) {
    consoRetenue = diff !== null ? diff : conso
    typeConso = 'RELEVEE'
  } else if (isBloque) {
    consoRetenue = consMoy !== null ? Math.round(consMoy * coefBloque) : conso
    typeConso = 'ESTIMEE_BLOQUE'
  } else if (isInaccessible) {
    consoRetenue = consMoy !== null ? consMoy : conso
    typeConso = 'ESTIMEE'
  } else {
    consoRetenue = conso
    typeConso = 'INDETERMINE'
  }

  // --- DÉTECTION DES ANOMALIES ---
  const flags = []

  // 1. Index FIGÉ sur ACCESSIBLE
  const indexFige = isAccessible && anc !== null && nv !== null && anc === nv
  if (indexFige) flags.push('INDEX_FIGE')

  // 2. Index RÉGRESSIF
  const indexRegressif = anc !== null && nv !== null && nv < anc
  if (indexRegressif) flags.push('INDEX_REGRESSIF')

  // 3. Abonné FANTÔME
  const fantome = isAccessible && anc === 0 && nv === 0 &&
                  (consoRetenue === 0 || consoRetenue === null)
  if (fantome) flags.push('ABONNE_FANTOME')

  // 4. Incohérence index/conso sur accessible
  const incoherenceIndex = isAccessible && diff !== null && conso !== null &&
                           Math.abs(diff - conso) > 0.5
  if (incoherenceIndex) flags.push('INCOHERENCE_INDEX')

  // 5. Tarif inadapté (Indus/Com < 10 m³)
  const catTarif = categorieTarif(tarif)
  const moyPourTarif = consMoy !== null ? consMoy : consoRetenue
  const tarifInadapte = catTarif === 'NON_DOMESTIQUE' && moyPourTarif !== null && moyPourTarif < 10
  if (tarifInadapte) flags.push('TARIF_INADAPTE')

  // 6. Domestique avec conso > 100 m³
  const domestiqueEleve = catTarif === 'DOMESTIQUE' && consoRetenue !== null && consoRetenue > 100
  if (domestiqueEleve) flags.push('DOMESTIQUE_ELEVE')

  // 7. Tarif manquant
  const tarifManquant = !tarif || tarif.trim() === '' || /NON.?RENSEIGN/i.test(tarif)
  if (tarifManquant) flags.push('TARIF_MANQUANT')

  // 8. N° compteur = 0 ou vide
  const compteurNul = !numCompteur || numCompteur.trim() === '' ||
                      numCompteur.trim() === '0' || /^0+$/.test(numCompteur.trim())
  if (compteurNul) flags.push('COMPTEUR_NUL')

  /* =====================================================================
   *  NOUVEAUX DÉTECTEURS — A, B, C, D, E
   * ===================================================================== */

  // A. SAUT BRUTAL DE CONSOMMATION (conso > 5 × moyenne sur ACCESSIBLE)
  //    Indique fuite, fraude antérieure découverte, ou commerce dissimulé.
  const sautBrutal = isAccessible &&
                     consoRetenue !== null && consoRetenue > 0 &&
                     consMoy !== null && consMoy > 0 &&
                     consoRetenue > consMoy * RATIO_SAUT_BRUTAL
  if (sautBrutal) flags.push('SAUT_BRUTAL')

  // B. INDEX NOUVEAU ROND (multiple de 100) sur ACCESSIBLE
  //    Présomption d'arrondi par le releveur.
  //    On exclut le cas index = 0 (légitime pour nouveau compteur).
  const indexRond = isAccessible &&
                    nv !== null && nv > 0 &&
                    nv % 100 === 0
  if (indexRond) flags.push('INDEX_ROND')

  // C. CONSO = ANCIEN INDEX (erreur saisie : releveur a confondu colonnes)
  //    On exige ancien > 0 pour éviter les faux positifs sur conso = 0.
  const consoEqualsAnc = conso !== null && anc !== null && anc > 0 &&
                         conso === anc
  if (consoEqualsAnc) flags.push('CONSO_EQ_ANCIEN')

  // C-bis. CONSO = NOUVEL INDEX (erreur : le releveur a oublié de soustraire l'ancien)
  //        On exige ancien > 0 pour ne pas confondre avec un compteur neuf.
  const consoEqualsNv = conso !== null && nv !== null && anc !== null && anc > 0 &&
                        conso === nv
  if (consoEqualsNv) flags.push('CONSO_EQ_NOUVEL')

  // D. PÉRIODE ANORMALE SUR ACCESSIBLE (nb_jours < 30 ou > 90)
  //    Si on a réellement accédé, la période devrait être ~60j (cycle bimestriel SNDE).
  //    Hors borne = relevé fictif, retard de tournée, ou abonné oublié du circuit.
  const periodeAnormale = isAccessible &&
                          nbJours !== null &&
                          (nbJours < NB_JOURS_MIN_NORMAL || nbJours > NB_JOURS_MAX_NORMAL)
  if (periodeAnormale) flags.push('PERIODE_ANORMALE')

  // E. CONSO = CONS_MOYENNE EXACTE sur ACCESSIBLE (probabilité quasi nulle)
  //    Forte présomption : le releveur a recopié la moyenne sans aller sur le terrain.
  //    On exige conso > 0 pour ne pas confondre avec un logement réellement inactif.
  const consoEqualsMoyenne = isAccessible &&
                             conso !== null && consMoy !== null &&
                             conso > 0 && conso === consMoy
  if (consoEqualsMoyenne) flags.push('CONSO_EQ_MOYENNE')

  return {
    consoDeclaree: conso,
    diffIndex: diff,
    consoRetenue,
    typeConso,
    etatNorm,
    catTarif,
    // Anomalies historiques
    indexFige, indexRegressif, fantome, incoherenceIndex,
    tarifInadapte, domestiqueEleve, tarifManquant, compteurNul,
    doublonCompteur: false,
    // Nouvelles anomalies
    sautBrutal, indexRond, consoEqualsAnc, consoEqualsNv,
    periodeAnormale, consoEqualsMoyenne,
    flags,
  }
}

/**
 * Parse complet — gère N centres × M secteurs
 */
export function parseEtat101(arrayBuffer, options = {}) {
  const coefBloque = options.coefBloque ?? 1.0

  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

  const sectors = []
  const allAbos = []
  let currentSector = null
  let pendingLineA = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => c === null || c === '')) continue

    const header = parseHeaderLine(row)
    if (header) {
      currentSector = { ...header, abonnements: [] }
      sectors.push(currentSector)
      pendingLineA = null
      continue
    }

    if (isLineA(row)) {
      pendingLineA = {
        refAbo: clean(row[COL.REF_ABO]),
        ancRef: clean(row[COL.ANC_REF]),
        numCompteur: clean(row[COL.NUM_COMPTEUR]),
        ancienIndex: toNum(row[COL.ANCIEN_INDEX]),
        nouvelIndex: toNum(row[COL.NOUVEL_INDEX]),
        consommation: toNum(row[COL.CONSOMMATION]),
        consMoyenne: toNum(row[COL.CONS_MOYENNE]),
        anomalies: clean(row[COL.ANOMALIES]) || null,
        matricule: clean(row[COL.MATRICULE]) || null,
      }
      continue
    }

    if (isLineB(row) && pendingLineA) {
      const etat = clean(row[COL.ETAT_COMPTAGE])
      const tarif = clean(row[COL.TARIF])
      const nbJours = toNum(row[COL.NB_JOURS])

      const info = analyseAbonnement({
        anc: pendingLineA.ancienIndex,
        nv: pendingLineA.nouvelIndex,
        conso: pendingLineA.consommation,
        consMoy: pendingLineA.consMoyenne,
        etat,
        numCompteur: pendingLineA.numCompteur,
        tarif,
        nbJours,
      }, coefBloque)

      const abo = {
        ...pendingLineA,
        raz: clean(row[COL.RAZ]),
        etatComptage: etat,
        nbJours,
        carteNonRetournee: clean(row[COL.CARTE_NON_RETOUR]),
        coupee: clean(row[COL.COUPEE]),
        dateCoupure: row[COL.DATE_COUPURE] || null,
        tarif,
        message: clean(row[COL.MESSAGE]) || null,
        ...info,
        centre:  currentSector?.centre  || 'CENTRE_INCONNU',
        secteur: currentSector?.secteur || 'SECTEUR_INCONNU',
        mois:    currentSector?.mois    ?? null,
        annee:   currentSector?.annee   ?? null,
      }
      if (currentSector) currentSector.abonnements.push(abo)
      allAbos.push(abo)
      pendingLineA = null
    }
  }

  /* =================================================================
   *  SECOND PASSAGE — DOUBLONS DE N° COMPTEUR
   * ================================================================= */
  const compteurCount = {}
  for (const a of allAbos) {
    if (a.compteurNul) continue
    const key = a.numCompteur
    compteurCount[key] = (compteurCount[key] || 0) + 1
  }
  for (const a of allAbos) {
    if (!a.compteurNul && compteurCount[a.numCompteur] > 1) {
      a.doublonCompteur = true
      if (!a.flags.includes('DOUBLON_COMPTEUR')) a.flags.push('DOUBLON_COMPTEUR')
    }
  }

  // === MÉTADONNÉES AGRÉGÉES ===
  const centresUniques  = [...new Set(sectors.map(s => s.centre))].sort()
  const secteursUniques = [...new Set(sectors.map(s => s.secteur))].sort()

  const periodes = sectors
    .filter(s => s.mois && s.annee)
    .map(s => `${String(s.mois).padStart(2,'0')}/${s.annee}`)
  const periodeCounts = {}
  periodes.forEach(p => { periodeCounts[p] = (periodeCounts[p] || 0) + 1 })
  const periode = Object.entries(periodeCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || null

  const meta = {
    centres: centresUniques,
    secteurs: secteursUniques,
    nbCentres: centresUniques.length,
    nbSecteurs: secteursUniques.length,
    nbSections: sectors.length,
    totalAbonnements: allAbos.length,
    periode,
    coefBloque,
    dateImport: new Date().toISOString()
  }

  return { meta, sectors, abonnements: allAbos }
}
