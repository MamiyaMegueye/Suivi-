/**
 * analyticsMutation.js — v7.1
 *
 * 🆕 v7.1 :
 *   - R8 étendue : déclenche aussi sur consommation === 0 (pas seulement null/absent).
 *     Cas typique : l'agent recopie le dernier index comme index de fermeture
 *     → consommation calculée = exactement 0. Symptôme de pose sur index mémoire.
 *
 * 🆕 v7 :
 *   - R8 RÉACTIVÉE : "Résilier sur index mémoire"
 *     Facture Arrêt du Compte avec CONSOMMATION nulle/absente
 *     → le releveur n'a pas pris le dernier index (conservation index mémoire)
 *
 * v6 :
 *   - R5 (Compteur sur plusieurs abonnés) SUPPRIMÉE de l'audit
 *   - R2 Multi-mutations : fenêtre 3 mois après date demande, seuil ≥ 2 factures
 *   - `adresse` ajoutée dans tous les baseAno (pour affichage tableau anomalies)
 *
 * v5 :
 *   - R7 garde, R8 supprimée, R9 ajoutée (Résiliation non clôturée)
 *
 * Règles métier actives :
 *  R1 — Mutation non facturée                        : Mutation Compteur validée sans Facture Mutation
 *  R2 — Multi-mutations                              : ≥ 2 Factures Mutation dans les 3 mois après date demande
 *  R3 — Consommation nulle sans forfait              : V_FACTURE = 0 ET facture précédente ≠ Forfaitaire
 *  R4 — Nv abonnement / Réabonnement — index pose > 0: 1ʳᵉ facture avec index après NB/Réab avec Index_Début > 0
 *  R6 — Nv abonnement / Réabonnement non facturé     : NB/Réab validé sans Facture Nv Abonnement / Réabonnement
 *  R7 — Résiliation avec solde impayé                : Facture Arrêt du Compte avec solde > 1 000 MRU
 *  R8 — Résilier sur index mémoire               : Facture Arrêt du Compte avec consommation nulle/absente  🆕 v7
 *  R9 — Résiliation non clôturée                     : Résiliation validée sans aucune Facture Arrêt du Compte
 */

/* ============================================================
 * HELPERS
 * ============================================================ */

const isSameMonth = (d1, d2) =>
  d1 && d2 &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear()

const facturesPour = (egfRows, refAbo, type) =>
  egfRows.filter(f => f.reference === refAbo && f.typeFacture === type)

const sortDesc = (factures) =>
  [...factures].sort((a, b) => {
    if (!a.dateFacture) return 1
    if (!b.dateFacture) return -1
    return b.dateFacture - a.dateFacture
  })

const sortAsc = (factures) =>
  [...factures].sort((a, b) => {
    if (!a.dateFacture) return 1
    if (!b.dateFacture) return -1
    return a.dateFacture - b.dateFacture
  })

/* 🆕 v6 — Ajoute N mois à une date */
const addMonths = (date, n) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

/* ============================================================
 * MAPPING & seuils
 * ============================================================ */
const TYPE_FACTURE_FRAIS = {
  'Nouveau Branchement': 'Facture Nv Abonnement',
  'Réabonnement'       : 'Facture Réabonnement',
}

const SEUIL_SOLDE_IMPAYE_MRU = 1000
const SEUIL_MULTI_MUTATIONS  = 2     // 🆕 v6 — R2 : ≥ 2 factures
const FENETRE_MULTI_MOIS     = 3     // 🆕 v6 — R2 : sur 3 mois après date demande

/* ============================================================
 * R4 + R6 — Audit Nv Branchement / Réabonnement
 * ============================================================ */
function reglesNbReabonnement(mutationRows, egfRows) {
  const anomalies = []

  const demandes = mutationRows.filter(m =>
    m.valide === 'OUI' &&
    m.annule === 'NON' &&
    Object.keys(TYPE_FACTURE_FRAIS).includes(m.typeDemande)
  )

  for (const mut of demandes) {
    const ref = (mut.refAbo || '').toString().trim()
    if (!ref) continue

    const typeAttendu = TYPE_FACTURE_FRAIS[mut.typeDemande]
    const dateDem     = mut.date

    const facturesAbo = egfRows.filter(
      f => (f.reference || '').toString().trim() === ref
    )

    const baseAno = {
      refAbo       : ref,
      numDemande   : mut.numDemande,
      nomClient    : mut.client,
      nomCentre    : mut.nomCentre,
      secteur      : mut.secteur,
      adresse      : mut.adresse,         // 🆕 v6
      typeMutation : mut.typeDemande,
      typeDemande  : mut.typeDemande,
      dateDemande  : mut.dateStr,
    }

    /* R6 : Frais NB / Réab non facturés */
    const LIBELLE_R6 = {
      'Nouveau Branchement': 'Nv abonnement (création) non facturé',
      'Réabonnement'       : 'Réabonnement non facturé',
    }
    const fraisFactures = facturesAbo.filter(
      f => (f.typeFacture || '').trim() === typeAttendu
    )
    if (fraisFactures.length === 0) {
      anomalies.push({
        ...baseAno,
        regle  : LIBELLE_R6[mut.typeDemande] || `${mut.typeDemande} non facturé`,
        detail : `Demande validée le ${mut.dateStr} mais aucune ${typeAttendu} ` +
                 `émise dans les EGF (perte des frais).`,
        gravite: 'Haute',
      })
    }

    /* R4 : Index de pose > 0 */
    const TYPES_AVEC_INDEX = new Set([
      'Facture Relevée',
      'Facture Estimée',
      'Facture Mutation',
    ])

    const facturesIndexApresDemande = sortAsc(
      facturesAbo.filter(f =>
        TYPES_AVEC_INDEX.has((f.typeFacture || '').trim()) &&
        f.dateFacture && dateDem && f.dateFacture >= dateDem
      )
    )

    if (facturesIndexApresDemande.length > 0) {
      const prem     = facturesIndexApresDemande[0]
      const idxDebut = Number(prem.indexDebut)
      const cpt      = (prem.compteur || '').toString().trim()
      const typeF    = (prem.typeFacture || '').trim()

      if (Number.isFinite(idxDebut) && idxDebut > 0) {
        anomalies.push({
          ...baseAno,
          numFacture          : prem.numFacture,
          compteur            : cpt,
          indexDebut          : idxDebut,
          dateFactureStr      : prem.dateFactureStr,
          typeFacturePremiere : typeF,
          regle               : 'Nv abonnement / Réabonnement — index pose > 0',
          detail              : `1ʳᵉ facture avec index après ${mut.typeDemande} ` +
                                `(${typeF} du ${prem.dateFactureStr}) avec Index_Début = ${idxDebut} ` +
                                `(devrait être 0). Compteur ${cpt} probablement recyclé d'un ancien abonné.`,
          gravite             : 'Critique',
        })
      }
    }
  }

  return anomalies
}

/* ============================================================
 * R7 + R9 — Audit Résiliation
 * ============================================================ */
function reglesResiliation(mutationRows, egfRows) {
  const anomalies = []

  const resiliations = mutationRows.filter(m =>
    m.typeDemande === 'Résiliation' &&
    m.valide === 'OUI' &&
    m.annule === 'NON'
  )

  for (const mut of resiliations) {
    const ref     = (mut.refAbo || '').toString().trim()
    const dateDem = mut.date
    if (!ref) continue

    const baseAno = {
      refAbo       : ref,
      numDemande   : mut.numDemande,
      nomClient    : mut.client,
      nomCentre    : mut.nomCentre,
      secteur      : mut.secteur,
      adresse      : mut.adresse,         // 🆕 v6
      typeMutation : mut.typeDemande,
      typeDemande  : mut.typeDemande,
      dateDemande  : mut.dateStr,
    }

    const facturesArret = sortAsc(
      egfRows.filter(f =>
        (f.reference || '').toString().trim() === ref &&
        (f.typeFacture || '').trim() === 'Facture Arrêt du Compte' &&
        f.dateFacture && dateDem &&
        (f.dateFacture >= dateDem || isSameMonth(f.dateFacture, dateDem))
      )
    )

    /* R9 : Aucune Facture Arrêt du Compte */
    if (facturesArret.length === 0) {
      anomalies.push({
        ...baseAno,
        regle  : 'Résiliation non clôturée',
        detail : `Résiliation validée le ${mut.dateStr} mais aucune Facture Arrêt du Compte ` +
                 `émise dans les EGF — la résiliation n'est pas clôturée comptablement.`,
        gravite: 'Haute',
      })
      continue
    }

    const fa = facturesArret[0]

    /* R7 : Solde impayé > 1 000 MRU */
    const solde = Number(fa.solde)
    if (Number.isFinite(solde) && solde > SEUIL_SOLDE_IMPAYE_MRU) {
      anomalies.push({
        ...baseAno,
        numFacture     : fa.numFacture,
        dateFactureStr : fa.dateFactureStr,
        compteur       : fa.compteur,
        solde          : fa.solde,
        consommation   : fa.consommation,
        regle  : 'Résiliation avec solde impayé',
        detail : `Résiliation validée le ${mut.dateStr}. La Facture Arrêt du Compte ` +
                 `du ${fa.dateFactureStr} laisse un solde de ${solde.toLocaleString('fr-FR')} MRU ` +
                 `(seuil : ${SEUIL_SOLDE_IMPAYE_MRU} MRU). Créance à risque de non-recouvrement.`,
        gravite: 'Haute',
      })
    }

    /* 🆕 v7 — R8 : Consommation nulle sur Facture Arrêt du Compte
       → le releveur n'a pas pris le dernier index (conservation index mémoire)
       🆕 v7.1 — Inclut aussi conso === 0 (cas où l'agent recopie le dernier
       index comme index de fermeture → consommation calculée = exactement 0) */
    const conso = fa.consommation
    const consoEstNulle =
      conso === null ||
      conso === undefined ||
      conso === '' ||
      (typeof conso === 'number' && !Number.isFinite(conso)) ||
      (typeof conso === 'number' && conso === 0) ||
      (typeof conso === 'string' && conso.trim() === '0')

    if (consoEstNulle) {
      anomalies.push({
        ...baseAno,
        numFacture     : fa.numFacture,
        dateFactureStr : fa.dateFactureStr,
        compteur       : fa.compteur,
        solde          : fa.solde,
        consommation   : fa.consommation,
        regle  : 'Résilier sur index mémoire',
        detail : `Résiliation validée le ${mut.dateStr}. La Facture Arrêt du Compte ` +
                 `du ${fa.dateFactureStr} affiche une consommation ` +
                 (conso === 0 || conso === '0'
                    ? `nulle (= 0)`
                    : `non enregistrée`) +
                 ` — le releveur n'a probablement pas pris le dernier index sur le terrain ` +
                 `(conservation de l'index mémoire au moment de la résiliation).`,
        gravite: 'Haute',
      })
    }
  }

  return anomalies
}

/* ============================================================
 * metaPerRef : compteur + solde le plus récent par abonné
 * ============================================================ */
function buildMetaPerRef(egfRows) {
  const meta = {}
  for (const f of egfRows) {
    const ref = (f.reference || '').toString().trim()
    if (!ref) continue
    if (!meta[ref] || (f.dateFacture && (!meta[ref].dateFacture || f.dateFacture > meta[ref].dateFacture))) {
      meta[ref] = {
        compteur     : f.compteur,
        solde        : f.solde,
        dateFacture  : f.dateFacture,
      }
    }
  }
  return meta
}

/* ============================================================
 * CROISEMENT PRINCIPAL
 * ============================================================ */
export function croiserMutationEGF(mutationRows, egfRows) {
  const anomalies = []
  const resultats = []

  /* === BLOC 1 — Mutations Compteur (R1, R2, R3) === */
  const mutationsActives = mutationRows.filter(
    m => m.valide === 'OUI' &&
        m.annule === 'NON' &&
        m.typeDemande === 'Mutation' &&
        m.typeMutation && m.typeMutation.toLowerCase().includes('compteur')
  )

  for (const mutation of mutationsActives) {
    const refAbo      = mutation.refAbo
    const dateDemande = mutation.date
    if (!refAbo) continue

    const toutesFacturesMutation = facturesPour(egfRows, refAbo, 'Facture Mutation')

    const facturesMutation = toutesFacturesMutation.filter(f => {
      if (!f.dateFacture || !dateDemande) return true
      return f.dateFacture >= dateDemande || isSameMonth(f.dateFacture, dateDemande)
    })

    const ligne = {
      refAbo,
      nomClient       : mutation.client,
      nomCentre       : mutation.nomCentre,
      codeCentre      : mutation.codeCentre,
      secteur         : mutation.secteur,
      adresse         : mutation.adresse,     // 🆕 v6
      typeMutation    : mutation.typeMutation || '—',
      dateDemande     : mutation.dateStr,
      numDemande      : mutation.numDemande,
      facturesMutation,
      factureRetenue  : null,
      vFacture        : null,
      factureAvant    : null,
      statut          : 'OK',
      anomalies       : [],
    }

    // R1 — Mutation non facturée
    if (facturesMutation.length === 0) {
      const anom = {
        refAbo,
        numDemande      : mutation.numDemande,
        nomClient       : mutation.client,
        nomCentre       : mutation.nomCentre,
        secteur         : mutation.secteur,
        adresse         : mutation.adresse,   // 🆕 v6
        typeMutation    : mutation.typeMutation || '—',
        dateDemande     : mutation.dateStr,
        regle           : 'Mutation non facturée',
        detail          : `Aucune Facture Mutation trouvée dans l'EGF pour cet abonné après le ${mutation.dateStr}`,
        gravite         : 'Haute',
        factureRetenue  : null,
        vFacture        : null,
      }
      anomalies.push(anom)
      ligne.statut = 'ANOMALIE'
      ligne.anomalies.push(anom)
      resultats.push(ligne)
      continue
    }

    // 🆕 v6 — R2 — Multi-mutations : ≥ 2 factures dans les 3 mois après date demande
    const finFenetre = dateDemande ? addMonths(dateDemande, FENETRE_MULTI_MOIS) : null

    const facturesDansFenetre = dateDemande
      ? facturesMutation.filter(f =>
          f.dateFacture &&
          f.dateFacture >= dateDemande &&
          f.dateFacture <= finFenetre
        )
      : facturesMutation

    ligne.nbFacturesMutation = facturesDansFenetre.length

    if (facturesDansFenetre.length >= SEUIL_MULTI_MUTATIONS) {
      const facturesTriees = sortDesc(facturesDansFenetre)
      const nums = facturesTriees.map(f => f.numFacture)
      const numsAffiches = nums.slice(0, 3).join(', ')
      const suffixe = nums.length > 3 ? `… (+${nums.length - 3})` : ''

      anomalies.push({
        refAbo,
        numDemande    : mutation.numDemande,
        nomClient     : mutation.client,
        nomCentre     : mutation.nomCentre,
        secteur       : mutation.secteur,
        adresse       : mutation.adresse,    // 🆕 v6
        typeMutation  : mutation.typeMutation || '—',
        dateDemande   : mutation.dateStr,
        regle         : 'Multi-mutations',
        detail        : `${facturesDansFenetre.length} factures mutation dans les ` +
                        `${FENETRE_MULTI_MOIS} mois après le ${mutation.dateStr} ` +
                        `(seuil R2 : ≥ ${SEUIL_MULTI_MUTATIONS}) — N° : ${numsAffiches}${suffixe}`,
        gravite       : 'Moyenne',
        factureRetenue: facturesTriees[0],
        vFacture      : facturesTriees[0].vFacture,
      })
      ligne.statut = ligne.statut === 'ANOMALIE' ? 'ANOMALIE' : 'MULTI'
    }

    const factureRetenue = sortDesc(
      facturesDansFenetre.length > 0 ? facturesDansFenetre : facturesMutation
    )[0]

    // R3 — V_FACTURE = 0 → chercher forfait avant
    const vFact = factureRetenue.vFacture
    if (vFact === 0 || vFact === null) {
      const toutesFactures = egfRows
        .filter(f => f.reference === refAbo && f.dateFacture)
        .sort((a, b) => a.dateFacture - b.dateFacture)

      const dateRef = factureRetenue.dateFacture
      const facturesAvant = dateRef
        ? toutesFactures.filter(f => f.dateFacture < dateRef)
        : []

      const factureAvant = facturesAvant.length > 0
        ? facturesAvant[facturesAvant.length - 1]
        : null

      ligne.factureAvant = factureAvant

      const estForfait = factureAvant &&
        factureAvant.typeFacture === 'Facture Forfaitaire'

      if (!estForfait) {
        const detail = factureAvant
          ? `Facture précédente du ${factureAvant.dateFactureStr} est de type "${factureAvant.typeFacture}" — attendu : Facture Forfaitaire`
          : `Aucune facture précédente trouvée — compteur défectueux non couvert`

        const anom = {
          refAbo,
          numDemande   : mutation.numDemande,
          nomClient    : mutation.client,
          nomCentre    : mutation.nomCentre,
          secteur      : mutation.secteur,
          adresse      : mutation.adresse,   // 🆕 v6
          typeMutation : mutation.typeMutation || '—',
          dateDemande  : mutation.dateStr,
          regle        : 'Conso nulle sans forfait',
          detail,
          gravite      : 'Critique',
          factureRetenue,
          vFacture     : vFact,
          factureAvant,
        }
        anomalies.push(anom)
        ligne.statut = 'ANOMALIE'
        ligne.anomalies.push(anom)
      } else {
        ligne.statut = ligne.statut === 'ANOMALIE' ? 'ANOMALIE' : 'FORFAIT_OK'
      }
    }

    resultats.push(ligne)
  }

  /* === BLOC 2 — Nouveau Branchement & Réabonnement (R4 + R6) === */
  anomalies.push(...reglesNbReabonnement(mutationRows, egfRows))

  /* === 🚫 R5 SUPPRIMÉE EN v6 === */

  /* === BLOC 4 — Résiliations (R7 + R9) === */
  anomalies.push(...reglesResiliation(mutationRows, egfRows))

  /* === STATS GLOBALES === */
  const stats = {
    totalMutations         : mutationsActives.length,
    totalAvecFacture       : resultats.filter(r => r.factureRetenue).length,
    totalSansFacture       : anomalies.filter(a => a.regle === 'Mutation non facturée').length,
    totalDoublons          : anomalies.filter(a => a.regle === 'Multi-mutations').length,
    totalConsoNulle        : resultats.filter(r => r.vFacture === 0 || r.vFacture === null).length,
    totalSansForfait       : anomalies.filter(a => a.regle === 'Conso nulle sans forfait').length,

    nbBranchReabAuditees   : mutationRows.filter(m =>
      m.valide === 'OUI' && m.annule === 'NON' &&
      ['Nouveau Branchement', 'Réabonnement'].includes(m.typeDemande)
    ).length,
    totalCompteurRecycle   : anomalies.filter(a => a.regle === 'Nv abonnement / Réabonnement — index pose > 0').length,
    totalFraisNonFactures  : anomalies.filter(a => /non facturé$/.test(a.regle)).length,

    // 🚫 R5 supprimée — totalCompteurPartage reste à 0 pour compat éventuelle
    totalCompteurPartage   : 0,

    // Résiliations
    nbResiliationsAuditees : mutationRows.filter(m =>
      m.typeDemande === 'Résiliation' && m.valide === 'OUI' && m.annule === 'NON'
    ).length,
    totalSoldeImpaye       : anomalies.filter(a => a.regle === 'Résiliation avec solde impayé').length,
    totalConsoNulleResil   : anomalies.filter(a => a.regle === 'Résilier sur index mémoire').length,  // 🆕 v7
    totalResilNonCloturees : anomalies.filter(a => a.regle === 'Résiliation non clôturée').length,
    totalCreanceRisque     : anomalies
      .filter(a => a.regle === 'Résiliation avec solde impayé')
      .reduce((s, a) => s + (Number(a.solde) || 0), 0),

    totalAnomalies         : anomalies.length,
    critiques              : anomalies.filter(a => a.gravite === 'Critique').length,
    hautes                 : anomalies.filter(a => a.gravite === 'Haute').length,
  }

  const metaPerRef = buildMetaPerRef(egfRows)

  return { resultats, anomalies, stats, metaPerRef }
}