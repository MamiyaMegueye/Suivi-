"""GET /api/secteurs — liste lue depuis la table référentielle `secteurs`.

🆕 v5.6 — Fix bug "1000 secteurs" :
   - CAST(CODE_CENTRE AS INTEGER) pour comparer correctement quel que soit le type
     stocké en DuckDB (parfois VARCHAR, parfois INTEGER selon historique)
   - DISTINCT pour dédupliquer si la table contient des doublons
   - Logs INFO pour debug
v4.6 — Source = table `secteurs` du cache DuckDB
"""
from fastapi import APIRouter, HTTPException, Query
import logging

from app import duckdb_client
from app.utils import to_jsonable_records

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/secteurs")
def list_secteurs(centre: int = Query(...)):
    """Retourne tous les secteurs d'un centre depuis le référentiel S_SECTEUR."""
    try:
        # 🆕 v5.6 — CAST + DISTINCT pour fiabilité
        df = duckdb_client.read_df(
            """SELECT DISTINCT
                      TRIM(CAST(SECT_CODE AS VARCHAR))  AS SECTEUR,
                      MIN(SECT_LIBLT)                   AS LIBELLE
               FROM   secteurs
               WHERE  CAST(CODE_CENTRE AS INTEGER) = ?
               GROUP  BY TRIM(CAST(SECT_CODE AS VARCHAR))
               ORDER  BY SECTEUR""",
            [int(centre)],
        )
        logger.info("[secteurs] centre=%d → %d secteurs", centre, len(df))
        return to_jsonable_records(df)
    except Exception as e:
        logger.exception("Erreur /secteurs (centre=%s)", centre)
        raise HTTPException(status_code=500, detail=str(e))