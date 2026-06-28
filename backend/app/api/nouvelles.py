"""🆕 v5.7 — Ajout endpoint /api/nouvelles/anomalies-data
   Renvoie mutations non-contrôlées + EGF liées (par REF_ABONNEMENT)
   pour permettre le croisement R1→R9 côté front (via analyticsMutation.js)

🆕 v5.6.1 — Hotfix robustesse :
   - Plus d'alias `AS n` (lu par position : df.iloc[0, 0])
   - Gestion défensive si read_df retourne None ou df vide
   - Log explicite si quelque chose part en erreur

🆕 v5.6 — Filtre par défaut sur la date d'aujourd'hui
🆕 v5.2 — Endpoints initiaux

GET    /api/nouvelles                                  → mutations du jour non contrôlées
GET    /api/nouvelles?since=YYYY-MM-DD                 → depuis cette date
GET    /api/nouvelles?since=all                        → toutes périodes confondues
GET    /api/nouvelles?valide_only=true                 → uniquement les validées
GET    /api/nouvelles/count                            → compteur
GET    /api/nouvelles/anomalies-data                   → 🆕 v5.7 mutations + egf liées
POST   /api/nouvelles/{num_demande}/controler          → marque comme contrôlée
DELETE /api/nouvelles/{num_demande}/controler          → réouvre
GET    /api/nouvelles/{num_demande}/croisement         → demande + factures EGF liées
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
import logging

from app import duckdb_client
from app.utils import to_jsonable_records

router = APIRouter(tags=["nouvelles"])
logger = logging.getLogger(__name__)


def _resolve_since(since: Optional[str]) -> Optional[date]:
    """Convertit le paramètre `since` en date Python.

    Retourne :
      - None             si since=='all' (pas de filtre date)
      - date.today()     si since est None ou vide (défaut = aujourd'hui)
      - date parsée      sinon (format YYYY-MM-DD)
    """
    if since is None or since == "":
        return date.today()
    if since.lower() == "all":
        return None
    try:
        return date.fromisoformat(since)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Format 'since' invalide : {since!r}. Attendu YYYY-MM-DD ou 'all'.",
        )


def _build_where(
    centre: Optional[int],
    since_date: Optional[date],
    valide_only: bool,
) -> tuple[str, list]:
    """Construit la clause WHERE + les paramètres pour mutations non contrôlées."""
    where_parts = [
        """NOT EXISTS (
             SELECT 1 FROM audit_log a WHERE a.NUM_DEMANDE = m.NUM_DEMANDE
           )"""
    ]
    params: list = []

    if centre is not None:
        where_parts.append("CAST(m.CODE_CENTRE AS INTEGER) = ?")
        params.append(int(centre))

    if since_date is not None:
        where_parts.append("CAST(m.DATE_DEMANDE AS DATE) >= ?")
        params.append(since_date)

    if valide_only:
        where_parts.append("UPPER(TRIM(m.VALIDE)) = 'OUI'")

    return " AND ".join(where_parts), params


@router.get("/nouvelles")
def list_nouvelles(
    centre: Optional[int] = Query(None, description="Filtrer par code centre"),
    since: Optional[str]  = Query(None, description="YYYY-MM-DD ou 'all' (défaut: aujourd'hui)"),
    valide_only: bool     = Query(False, description="Si True, ne renvoie que les validées"),
    limit: int            = Query(500, ge=1, le=10000),
):
    """Liste les mutations PAS encore contrôlées (= absentes d'audit_log).

    🆕 v5.7.6 — cap relevé à 10 000 pour vue exhaustive côté front.
    🆕 v5.6.1 — Robuste contre les retours None ou DataFrame vide.
    """
    try:
        since_date = _resolve_since(since)
        where, params = _build_where(centre, since_date, valide_only)
        params_with_limit = params + [int(limit)]

        # 🆕 v5.7 — NUM_COMPTEUR via sous-requête EGF (compteur le plus récent
        # pour ce REF_ABONNEMENT). Renvoie NULL si aucune facture EGF liée.
        sql = f"""
            SELECT m.*,
                   (SELECT e.COMPTEUR
                    FROM   egf e
                    WHERE  e.REFERENCE = m.REF_ABONNEMENT
                      AND  e.COMPTEUR IS NOT NULL
                      AND  TRIM(e.COMPTEUR) <> ''
                    ORDER  BY e.DATE_FACTURE DESC NULLS LAST
                    LIMIT  1)                                AS NUM_COMPTEUR
            FROM   mutations m
            WHERE  {where}
            ORDER  BY m.DATE_DEMANDE DESC, m.NUM_DEMANDE DESC
            LIMIT  ?
        """
        df = duckdb_client.read_df(sql, params_with_limit)

        # 🆕 v5.6.1 — Garde-fous défensifs
        if df is None:
            logger.warning(
                "[nouvelles] read_df a retourné None ! "
                "Probable problème de connexion DuckDB. Retour liste vide."
            )
            return []

        n = len(df)
        logger.info(
            "[nouvelles] centre=%s, since=%s, valide_only=%s → %d résultat(s)",
            centre, since_date, valide_only, n,
        )

        if df.empty:
            return []
        return to_jsonable_records(df)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur /nouvelles")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nouvelles/count")
def count_nouvelles(
    centre: Optional[int] = Query(None),
    since: Optional[str]  = Query(None),
    valide_only: bool     = Query(False),
):
    """Compteur (même filtres que /nouvelles).

    🆕 v5.6.1 — Lit par position iloc[0, 0] (pas d'alias) + garde-fous.
    """
    try:
        since_date = _resolve_since(since)
        where, params = _build_where(centre, since_date, valide_only)

        sql = f"SELECT COUNT(*) FROM mutations m WHERE {where}"
        df = duckdb_client.read_df(sql, params)

        # 🆕 v5.6.1 — Garde-fous défensifs
        if df is None:
            logger.warning("[nouvelles/count] read_df a retourné None ! Retour 0.")
            return {"count": 0}

        if df.empty or df.shape[1] == 0:
            return {"count": 0}

        # Lecture par position : pas de souci d'alias
        value = df.iloc[0, 0]
        return {"count": int(value) if value is not None else 0}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur /nouvelles/count")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# 🆕 v5.7 — Données pour croisement EGF côté front
# =====================================================================
@router.get("/nouvelles/anomalies-data")
def nouvelles_anomalies_data(
    centre: Optional[int] = Query(None, description="Filtrer par code centre"),
    since: Optional[str]  = Query(None, description="YYYY-MM-DD ou 'all' (défaut: aujourd'hui)"),
    valide_only: bool     = Query(False),
    limit: int            = Query(2000, ge=1, le=10000),
):
    """Renvoie les mutations non-contrôlées (mêmes filtres que /nouvelles)
    + toutes les factures EGF liées (par REFERENCE ou ANC_REFERENCE).

    Permet au front de lancer `croiserMutationEGF()` (analyticsMutation.js)
    sur le périmètre "Nouveautés" et d'en extraire les anomalies R1→R9.
    """
    try:
        since_date = _resolve_since(since)
        where, params = _build_where(centre, since_date, valide_only)
        params_with_limit = params + [int(limit)]

        sql_mut = f"""
            SELECT m.*,
                   (SELECT e.COMPTEUR
                    FROM   egf e
                    WHERE  e.REFERENCE = m.REF_ABONNEMENT
                      AND  e.COMPTEUR IS NOT NULL
                      AND  TRIM(e.COMPTEUR) <> ''
                    ORDER  BY e.DATE_FACTURE DESC NULLS LAST
                    LIMIT  1)                                AS NUM_COMPTEUR
            FROM   mutations m
            WHERE  {where}
            ORDER  BY m.DATE_DEMANDE DESC, m.NUM_DEMANDE DESC
            LIMIT  ?
        """
        df_mut = duckdb_client.read_df(sql_mut, params_with_limit)

        if df_mut is None or df_mut.empty:
            logger.info("[nouvelles/anomalies-data] aucune mutation → vide")
            return {"mutations": [], "egf": []}

        # Références abo distinctes pour borner la requête EGF
        refs = (
            df_mut["REF_ABONNEMENT"]
            .dropna()
            .astype(str)
            .unique()
            .tolist()
        )

        if not refs:
            return {"mutations": to_jsonable_records(df_mut), "egf": []}

        placeholders = ",".join(["?"] * len(refs))
        sql_egf = f"""
            SELECT *
            FROM   egf
            WHERE  REFERENCE     IN ({placeholders})
               OR  ANC_REFERENCE IN ({placeholders})
            ORDER  BY REFERENCE, DATE_FACTURE
        """
        df_egf = duckdb_client.read_df(sql_egf, refs + refs)

        egf_rows = (
            to_jsonable_records(df_egf)
            if df_egf is not None and not df_egf.empty
            else []
        )

        logger.info(
            "[nouvelles/anomalies-data] %d mutations, %d factures EGF (refs=%d)",
            len(df_mut), len(egf_rows), len(refs),
        )

        return {
            "mutations": to_jsonable_records(df_mut),
            "egf":       egf_rows,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur /nouvelles/anomalies-data")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nouvelles/{num_demande}/controler")
def controler(num_demande: str, par: str = Query("user")):
    try:
        nouvelle = duckdb_client.mark_controle(num_demande, par)
        return {
            "num_demande": num_demande,
            "controle_par": par,
            "etait_nouvelle": nouvelle,
            "status": "ok",
        }
    except Exception as e:
        logger.exception("Erreur POST /nouvelles/{num_demande}/controler")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/nouvelles/{num_demande}/controler")
def decontroler(num_demande: str):
    try:
        duckdb_client.unmark_controle(num_demande)
        return {"num_demande": num_demande, "status": "ok"}
    except Exception as e:
        logger.exception("Erreur DELETE /nouvelles/{num_demande}/controler")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nouvelles/{num_demande}/croisement")
def croisement(num_demande: str):
    """Retourne la mutation + les factures EGF liées + autres demandes du même abonné."""
    try:
        df_mut = duckdb_client.read_df(
            "SELECT * FROM mutations WHERE NUM_DEMANDE = ?",
            [num_demande],
        )
        if df_mut is None or df_mut.empty:
            raise HTTPException(status_code=404, detail=f"Demande {num_demande} introuvable")
        mutation = to_jsonable_records(df_mut)[0]

        ref_abo = mutation.get("REF_ABONNEMENT")
        if ref_abo:
            df_egf = duckdb_client.read_df(
                """SELECT *
                   FROM egf
                   WHERE REFERENCE = ? OR ANC_REFERENCE = ?
                   ORDER BY DATE_FACTURE""",
                [str(ref_abo), str(ref_abo)],
            )
            factures = to_jsonable_records(df_egf) if df_egf is not None else []
        else:
            factures = []

        if ref_abo:
            df_other_mut = duckdb_client.read_df(
                """SELECT * FROM mutations
                   WHERE REF_ABONNEMENT = ?
                   ORDER BY DATE_DEMANDE""",
                [str(ref_abo)],
            )
            mutations_meme_abo = to_jsonable_records(df_other_mut) if df_other_mut is not None else [mutation]
        else:
            mutations_meme_abo = [mutation]

        ctrl_row = duckdb_client.read_df(
            "SELECT CONTROLE_PAR, CONTROLE_AT FROM audit_log WHERE NUM_DEMANDE = ?",
            [num_demande],
        )
        if ctrl_row is not None and not ctrl_row.empty:
            ctrl = to_jsonable_records(ctrl_row)[0]
            controle = {
                "deja_controlee": True,
                "par": ctrl.get("CONTROLE_PAR"),
                "at": ctrl.get("CONTROLE_AT"),
            }
        else:
            controle = {"deja_controlee": False}

        return {
            "mutation": mutation,
            "factures_liees": factures,
            "mutations_meme_abo": mutations_meme_abo,
            "controle": controle,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur /nouvelles/%s/croisement", num_demande)
        raise HTTPException(status_code=500, detail=str(e))