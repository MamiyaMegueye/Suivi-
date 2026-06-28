"""GET /api/egf — lu depuis le cache DuckDB.

🆕 v4.4 — Paramètre optionnel `secteur` pour filtrage côté backend
🆕 v4.3 — to_jsonable_records pour nettoyer les NaN (CONSOMMATION, INDEX_DEBUT, etc.)
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
import logging

from app import duckdb_client
from app.utils import to_jsonable_records

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/egf")
def list_egf(
    centre: int = Query(...),
    date_debut: date = Query(...),
    date_fin: date = Query(...),
    secteur: Optional[str] = Query(None),  # 🆕 v4.4
):
    try:
        if secteur:
            df = duckdb_client.read_df(
                """SELECT * FROM egf
                   WHERE CODE_CENTRE = ?
                     AND DATE_FACTURE BETWEEN ? AND ?
                     AND TRIM(SECTEUR) = TRIM(?)
                   ORDER BY DATE_FACTURE DESC, NUM_FACTURE""",
                [centre, date_debut, date_fin, secteur],
            )
        else:
            df = duckdb_client.read_df(
                """SELECT * FROM egf
                   WHERE CODE_CENTRE = ? AND DATE_FACTURE BETWEEN ? AND ?
                   ORDER BY DATE_FACTURE DESC, NUM_FACTURE""",
                [centre, date_debut, date_fin],
            )
        return to_jsonable_records(df)
    except Exception as e:
        logger.exception("Erreur /egf")
        raise HTTPException(status_code=500, detail=str(e))