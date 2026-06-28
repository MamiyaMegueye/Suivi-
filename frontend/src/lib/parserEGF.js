import * as XLSX from 'xlsx'

const clean = (v) => {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const d = new Date(String(v).trim())
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parse un fichier EGF SNDE (Excel)
 * Retourne un tableau de lignes de facturation
 */
export function parseEGFFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb   = XLSX.read(data, { type: 'array', cellDates: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

        // Trouver la ligne d'en-tête (contient "Référence" ou "Centre")
        let hIdx = raw.findIndex(row =>
          row && row.some(c => typeof c === 'string' && c.trim() === 'Centre')
        )
        if (hIdx === -1) hIdx = 0

        const headers = raw[hIdx].map(h => clean(h))

        const idx = (label) => headers.findIndex(h => h === label)

        // Index des colonnes clés
        const I = {
          centre        : idx('Centre'),
          codeCentre    : idx('Code Centre'),
          secteur       : idx('Secteur'),
          numFacture    : idx('Num Facture'),
          reference     : idx('Référence'),
          ancRef        : idx('Anc Référence'),
          nom           : idx('Nom'),
          tarif         : idx('Tarif'),
          codeFacture   : idx('Code facture'),
          tournee       : idx('Tournée'),
          dateCreation  : idx('Date Création'),
          compteur      : idx('Compteur'),
          refCompteur   : idx('Référence compteur'),
          dateFacture   : idx('Date Facture'),
          typeFacture   : idx('Type facture'),
          dateDebut     : idx('Date début'),
          dateFin       : idx('Date fin'),
          indexDebut    : idx('Index début'),
          indexFin      : idx('Index fin'),
          consommation  : idx('Consommation'),
          vFacture      : idx('V_FACTURE'),
          montant       : idx('Montant'),
          arrieres      : idx('Arriérés'),
          solde         : idx('Solde'),
          adresse       : idx('Adresse'),
          typeComptage  : idx('TYPE COMPTAGE'),
        }

        const rows = []
        for (let i = hIdx + 1; i < raw.length; i++) {
          const r = raw[i]
          if (!r || r.every(c => c === null || c === '')) continue

          const get    = (key) => I[key] >= 0 ? r[I[key]] : null
          const getStr = (key) => clean(get(key))
          const getNum = (key) => toNum(get(key))
          const getDt  = (key) => toDate(get(key))

          const reference = getStr('reference')
          if (!reference) continue

          const dateFacture = getDt('dateFacture')

          rows.push({
            centre       : getStr('centre'),
            codeCentre   : getStr('codeCentre'),
            secteur      : getStr('secteur'),
            numFacture   : getStr('numFacture'),
            reference,                                    // Réf Abonnement — clé de jointure
            ancRef       : getStr('ancRef'),
            nom          : getStr('nom'),
            tarif        : getStr('tarif'),
            codeFacture  : getStr('codeFacture'),
            tournee      : getStr('tournee'),
            dateCreation : getDt('dateCreation'),
            compteur     : getStr('compteur'),
            refCompteur  : getStr('refCompteur'),
            dateFacture,
            dateFactureStr: dateFacture
              ? dateFacture.toLocaleDateString('fr-FR')
              : '—',
            moisFacture  : dateFacture ? dateFacture.getMonth() + 1 : null,
            anneeFacture : dateFacture ? dateFacture.getFullYear() : null,
            typeFacture  : getStr('typeFacture'),
            dateDebut    : getDt('dateDebut'),
            dateFin      : getDt('dateFin'),
            indexDebut   : getNum('indexDebut'),
            indexFin     : getNum('indexFin'),
            consommation : getNum('consommation'),
            vFacture     : getNum('vFacture'),
            montant      : getNum('montant'),
            arrieres     : getNum('arrieres'),
            solde        : getNum('solde'),
            adresse      : getStr('adresse'),
            typeComptage : getStr('typeComptage'),
          })
        }

        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}