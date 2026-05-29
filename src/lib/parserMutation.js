import * as XLSX from 'xlsx';

/**
 * Parse le fichier Excel "État Mutation" SNDE
 * Colonnes : Nom Centre, Code Centre, Num Demande, Réf Abonnement,
 *            Type Demande, Client, Créée par, Validé, Annulé,
 *            Adresse, Secteur, Tournée, Type Mutation, Date Demande, Code Client
 */
export function parseMutationFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

        // Trouver la ligne d'en-tête (contient "Nom Centre")
        let headerIdx = raw.findIndex(row =>
          row.some(cell => typeof cell === 'string' && cell.trim() === 'Nom Centre')
        );
        if (headerIdx === -1) headerIdx = 1; // fallback ligne 2

        const headers = raw[headerIdx].map(h => (h ? String(h).trim() : ''));

        const rows = [];
        for (let i = headerIdx + 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.every(c => c === null || c === '')) continue;

          const get = (label) => {
            const idx = headers.findIndex(h => h === label);
            if (idx === -1) return null;
            const val = r[idx];
            return val !== null && val !== undefined ? String(val).trim() : null;
          };

          const nomCentre    = get('Nom Centre');
          const codeCentre   = get('Code Centre');
          const numDemande   = get('Num. Demande');
          const refAbo       = get('Réf Abonnement');
          const typeDemande  = get('Type Demande');
          const client       = get('Client');
          const creePar      = get('Créée par');
          const valide       = get('Validé');
          const annule       = get('Annulé');
          const adresse      = get('Adresse');
          const secteur      = get('Secteur');
          const tournee      = get('Tournée');
          const typeMutation = get('Type Mutation');
          const dateBrut     = r[headers.findIndex(h => h === 'Date Demande')];
          const codeClient   = get('Code Client');

          // Ignorer lignes sans centre
          if (!nomCentre) continue;

          let dateObj = null;
          if (dateBrut instanceof Date) {
            dateObj = dateBrut;
          } else if (typeof dateBrut === 'string' && dateBrut.trim()) {
            dateObj = new Date(dateBrut.trim());
          }

          rows.push({
            nomCentre,
            codeCentre,
            numDemande,
            refAbo,
            typeDemande,
            client,
            creePar,
            valide: valide ? valide.toUpperCase() : null,
            annule: annule ? annule.toUpperCase() : null,
            adresse,
            secteur,
            tournee,
            typeMutation,
            date: dateObj,
            dateStr: dateObj ? dateObj.toLocaleDateString('fr-FR') : '—',
            codeClient,
          });
        }

        resolve(detectMutationAnomalies(rows));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Règles métier — anomalies sur les mutations
 */
function detectMutationAnomalies(rows) {
  const anomalies = [];

  // Doublons de numéro de demande
  const numCount = {};
  rows.forEach(r => {
    if (r.numDemande) numCount[r.numDemande] = (numCount[r.numDemande] || 0) + 1;
  });

  rows.forEach((r, i) => {
    // Règle 1 : Mutation non validée et non annulée (en attente suspecte)
    if (r.typeDemande === 'Mutation' && r.valide === 'NON' && r.annule === 'NON') {
      anomalies.push({
        index: i,
        numDemande: r.numDemande,
        nomCentre: r.nomCentre,
        client: r.client,
        typeDemande: r.typeDemande,
        typeMutation: r.typeMutation,
        dateStr: r.dateStr,
        regle: 'Mutation en attente',
        detail: 'Demande non validée et non annulée',
        gravite: 'Moyenne',
      });
    }

    // Règle 2 : Annulée mais validée (incohérence)
    if (r.valide === 'OUI' && r.annule === 'OUI') {
      anomalies.push({
        index: i,
        numDemande: r.numDemande,
        nomCentre: r.nomCentre,
        client: r.client,
        typeDemande: r.typeDemande,
        typeMutation: r.typeMutation,
        dateStr: r.dateStr,
        regle: 'Incohérence validé/annulé',
        detail: 'Demande marquée Validée ET Annulée simultanément',
        gravite: 'Haute',
      });
    }

    // Règle 3 : Doublon de numéro de demande
    if (r.numDemande && numCount[r.numDemande] > 1) {
      anomalies.push({
        index: i,
        numDemande: r.numDemande,
        nomCentre: r.nomCentre,
        client: r.client,
        typeDemande: r.typeDemande,
        typeMutation: r.typeMutation,
        dateStr: r.dateStr,
        regle: 'Doublon numéro demande',
        detail: `Numéro ${r.numDemande} apparaît ${numCount[r.numDemande]} fois`,
        gravite: 'Haute',
      });
    }

    // Règle 4 : Mutation sans type de mutation précisé
    if (r.typeDemande === 'Mutation' && !r.typeMutation) {
      anomalies.push({
        index: i,
        numDemande: r.numDemande,
        nomCentre: r.nomCentre,
        client: r.client,
        typeDemande: r.typeDemande,
        typeMutation: '—',
        dateStr: r.dateStr,
        regle: 'Type mutation manquant',
        detail: 'Mutation sans précision du type',
        gravite: 'Moyenne',
      });
    }

    // Règle 5 : Adresse manquante
    if (!r.adresse || r.adresse === '') {
      anomalies.push({
        index: i,
        numDemande: r.numDemande,
        nomCentre: r.nomCentre,
        client: r.client,
        typeDemande: r.typeDemande,
        typeMutation: r.typeMutation || '—',
        dateStr: r.dateStr,
        regle: 'Adresse manquante',
        detail: 'Aucune adresse renseignée pour cet abonné',
        gravite: 'Faible',
      });
    }
  });

  return { rows, anomalies };
}
