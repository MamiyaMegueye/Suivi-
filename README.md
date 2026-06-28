# SNDE Audit Mutations — v3 (DuckDB + Pipeline chunké)

Audit quotidien des centres SNDE — détection d'anomalies sur compteurs et facturation.

**Aligné sur le pattern `Dashboard`** :
- extraction Oracle → DuckDB local (read-only sur prod)
- périmètre **tous les centres Nouakchott** (`ZONE_ID=2`, exclusions `STR_ID NOT IN (1,2,63)`)
- chargement initial via **CLI mensuel** (robuste sur VPN lent), incrémental ensuite

---

## Architecture

```
                  Oracle PROD (CRM_SNDE)
                          │ SELECT only
        ┌─────────────────┼─────────────────┐
        │                                   │
        ▼                                   ▼
  CLI pipeline                        Scheduler (15 min)
  python -m scripts.pipeline           refresh mois courant
   --initial          (full)            (incrémental)
        │                                   │
        └────────────┬──────────────────────┘
                     ▼
              DuckDB local (snde.duckdb)
                     ▼
              FastAPI (lit DuckDB)
                     ▼
              React + SSE (live)
```

---

## Workflow d'utilisation

### 1) Chargement initial (à faire 1 fois)

Lance la pipeline en mode `--initial` — elle charge mois par mois, avec retry, ce qui passe même via VPN :

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m scripts.pipeline --initial
```

Sortie attendue (env. 5-15 min selon VPN) :
```
=== INITIAL LOAD (3 mois, mois par mois) ===
→ Centres…
   28 centres
--- Mois 2026-04 ---
   [mutations 2026-04] 1234 lignes en 12.3s
   [egf 2026-04]       5678 lignes en 45.2s
--- Mois 2026-05 ---
   [mutations 2026-05] 1100 lignes en 11.1s
   [egf 2026-05]       6200 lignes en 47.8s
--- Mois 2026-06 ---
   ...
=== INITIAL LOAD OK ===
```

### 2) Lancement de l'API

Le backend lit ensuite uniquement DuckDB :

```powershell
uvicorn main:app --reload --port 8001
```

Le scheduler tournera automatiquement toutes les 15 min en mode **incrémental** (mois courant uniquement, rapide).

### 3) Frontend

```powershell
cd frontend
npm run dev
```

Ouvrir http://localhost:5173

### 4) Rafraîchir un mois précis (optionnel)

```powershell
python -m scripts.pipeline --month 2026-05
```

---

## Endpoints REST

| Méthode | URL                | Source            |
|---------|--------------------|-------------------|
| GET     | `/health`          | Oracle ping       |
| GET     | `/api/centres`     | DuckDB            |
| GET     | `/api/mutations`   | DuckDB            |
| GET     | `/api/egf`         | DuckDB            |
| GET     | `/api/audit`       | DuckDB (R1→R6)    |
| GET     | `/api/status`      | DuckDB meta       |
| POST    | `/api/reload`      | déclenche incrémental |
| GET     | `/api/events`      | SSE live          |

---

## Règles d'audit (inchangées)

| Code | Règle                          | Gravité  |
|------|--------------------------------|----------|
| R1   | Mutation non facturée          | Haute    |
| R2   | Multi-mutations                | Moyenne  |
| R3   | Conso nulle sans forfait       | Critique |
| R4   | Index de pose > 0              | Critique |
| R5   | Compteur sur plusieurs abonnés | Haute    |
| R6   | NB / Réab non facturé          | Haute    |

---

## Configuration (`.env`)

| Variable                  | Défaut  | Effet                                          |
|---------------------------|---------|------------------------------------------------|
| `ZONE_ID`                 | 2       | Nouakchott                                     |
| `EGF_MONTHS_ROLLING`      | 2       | nb de mois antérieurs                          |
| `CENTRES_INCLUS`          | (vide)  | filtre optionnel ex `97,98` ; vide = tous      |
| `REFRESH_INTERVAL_MINUTES`| 15      | intervalle scheduler (incrémental mois courant)|
| `DUCKDB_PATH`             | `data/snde.duckdb` | emplacement cache                   |

---

## Sécurité

- **100 % SELECT-only** : aucun INSERT/UPDATE/DELETE/MERGE/DROP/TRUNCATE/ALTER dans le code Oracle
- Requêtes paramétrées (bind variables)
- `.env` dans `.gitignore`

## Tests

```powershell
cd backend
$env:PYTHONPATH="."
pytest tests/ -v
```

→ **8 passed**.

