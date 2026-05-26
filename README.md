# SNDE Analytics — Contrôle & Audit

Outil interne d'analyse des fichiers opérationnels SNDE. Traitement **100 % local** (aucune donnée envoyée à un serveur). Premier module : **Carte de relève (État 101)**.

## Lancer le projet (dans VS Code)

```bash
npm install      # une seule fois
npm run dev      # démarre sur http://localhost:5173
```

Pour générer une version statique : `npm run build` (dossier `dist/`).

## Navigation (barre latérale)

- **Importer** — case d'import compacte + paramètre du coefficient d'estimation des compteurs bloqués.
- **Vue d'ensemble** — priorisation des centres par score de qualité (P1→P4), KPI globaux, comparaison.
- **États de comptage** — répartition accessible / inaccessible / bloqué / illisible / défectueux, détail par secteur.
- **Consommations** — distribution, volume relevé vs estimé, top consos, consos faibles suspectes.
- **Anomalies & audit** — catalogue des 9 règles métier, listes filtrables et exportables en Excel.
- **Releveurs** — performance par matricule (taux d'accès, index figés, incohérences).
- **Données** — table complète avec recherche et export.

## Règles métier de détection

| Anomalie | Critère | Gravité |
|---|---|---|
| Index figé | Ancien = Nouvel sur compteur **accessible** | Haute |
| Index régressif | Nouvel index < ancien | Haute |
| Abonné fantôme | Anc = Nv = Conso = 0 sur accessible | Haute |
| Doublon compteur | Même n° compteur sur plusieurs abos | Haute |
| Compteur nul | N° compteur vide ou = 0 | Moyenne |
| Incohérence index/conso | (Nv − Anc) ≠ conso sur accessible | Moyenne |
| Tarif inadapté | Industriel/Commerce avec moyenne < 10 m³ | Moyenne |
| Domestique élevé | Domestique avec conso > 100 m³ | Moyenne |
| Tarif manquant | Aucun tarif renseigné | Moyenne |

## Calcul de la consommation (selon l'état de comptage)

- **Accessible** → différence d'index réelle (Nouvel − Ancien)
- **Inaccessible / Illisible / Défectueux** → estimation (= consommation moyenne)
- **Bloqué** → consommation moyenne × **coefficient** (paramétrable dans la page Import ; défaut 1.0)

## Architecture

```
src/
  App.jsx              orchestration, navigation, filtres, export Excel
  components/
    Sidebar.jsx        barre latérale de navigation
    FilterBar.jsx      filtres centre / secteur
    Card.jsx, KpiCard.jsx, PageShared.jsx
  pages/               une page par vue
  lib/
    parser.js          lecture État 101 + détection anomalies par abo
    analytics.js       KPI, scores, catalogue d'anomalies, agrégations
    format.js          helpers de formatage
```

L'architecture multi-pages est **générique** : les prochains fichiers (mutations, suivi commercial…) viendront s'ajouter comme nouvelles sections de la barre latérale.
