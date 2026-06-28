"""GET /api/audit — exécute R1→R6 sur le cache DuckDB."""
from datetime import date
from dateutil.relativedelta import relativedelta
import logging

from fastapi import APIRouter, HTTPException, Query

from app import duckdb_client
from app.services.rules_engine import executer_audit
from app.models import AuditResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def _fenetre_egf_roulante(date_debut: date, date_fin: date, mois_precedents: int = 2):
    debut_egf = (date_debut.replace(day=1) - relativedelta(months=mois_precedents))
    fin_egf = (date_fin + relativedelta(months=1)).replace(day=1) - relativedelta(days=1)
    return debut_egf, fin_egf


@router.get("/audit", response_model=AuditResponse)
def run_audit(
    centre: int = Query(...),
    date_debut: date = Query(...),
    date_fin: date = Query(...),
    egf_mois_precedents: int = Query(2, ge=0, le=12),
):
    try:
        logger.info("Audit centre=%s période=[%s → %s] (DuckDB)", centre, date_debut, date_fin)
        mutations = duckdb_client.read_df(
            """SELECT * FROM mutations
               WHERE CODE_CENTRE = ? AND DATE_DEMANDE BETWEEN ? AND ?""",
            [centre, date_debut, date_fin],
        )
        egf_debut, egf_fin = _fenetre_egf_roulante(date_debut, date_fin, egf_mois_precedents)
        egf = duckdb_client.read_df(
            """SELECT * FROM egf
               WHERE CODE_CENTRE = ? AND DATE_FACTURE BETWEEN ? AND ?""",
            [centre, egf_debut, egf_fin],
        )
        return executer_audit(mutations, egf)
    except Exception as e:
        logger.exception("Erreur /audit")
        raise HTTPException(status_code=500, detail=str(e))
