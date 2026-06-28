"""Endpoints d'administration : statut du cache, refresh manuel, flux SSE.

🆕 v5.0 — Le flux /events émet maintenant :
   - hello              : à la connexion
   - ping               : heartbeat 15s
   - refresh_started    : début de sync (manuel ou périodique)
   - refresh_finished   : fin de sync, avec status, delta, counts
   - data_changed       : émis seulement si le refresh a réellement modifié le cache
"""
import logging

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app import duckdb_client, scheduler

router = APIRouter(tags=["admin"])
logger = logging.getLogger(__name__)


@router.get("/status")
def status():
    """État du cache DuckDB + dernier refresh."""
    last_status, last_ts = duckdb_client.get_meta("last_refresh_status")
    last_duration, _    = duckdb_client.get_meta("last_refresh_duration")
    last_by, _          = duckdb_client.get_meta("last_refresh_triggered_by")
    last_mut, _         = duckdb_client.get_meta("last_refresh_mutations")
    last_egf, _         = duckdb_client.get_meta("last_refresh_egf")
    last_centres, _     = duckdb_client.get_meta("last_refresh_centres")
    last_periode, _     = duckdb_client.get_meta("last_refresh_periode")
    last_error, _       = duckdb_client.get_meta("last_refresh_error")

    return {
        "last_refresh": last_ts,
        "status": last_status,
        "duration_seconds": float(last_duration) if last_duration else None,
        "triggered_by": last_by,
        "mutations": int(last_mut) if last_mut else 0,
        "egf": int(last_egf) if last_egf else 0,
        "centres": int(last_centres) if last_centres else 0,
        "periode": last_periode,
        "error": last_error if last_status == "error" else None,
    }


@router.post("/reload")
def reload_cache():
    """Force un refresh immédiat (asynchrone, ne bloque pas)."""
    scheduler.trigger_refresh_now(triggered_by="manual")
    return {"status": "scheduled"}


@router.get("/events")
async def events():
    """Flux SSE — voir docstring du module pour la liste des events."""
    return EventSourceResponse(scheduler.sse_stream())