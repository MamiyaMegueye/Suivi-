"""GET /api/centres — liste lue depuis le cache DuckDB.

🆕 v4.3 — Utilise to_jsonable_records pour nettoyer les NaN.
"""
from fastapi import APIRouter, HTTPException
import logging

from app import duckdb_client
from app.utils import to_jsonable_records  # 🆕 v4.3

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/centres")
def list_centres():
    try:
        df = duckdb_client.read_df("SELECT CODE, NOM FROM centres ORDER BY NOM")
        return to_jsonable_records(df)
    except Exception as e:
        logger.exception("Erreur /centres")
        raise HTTPException(status_code=500, detail=str(e))