"""Scheduler APScheduler + bus d'événements SSE.

🆕 v5.2 — `data_changed` enrichi avec `new_count` (mutations non-contrôlées)
🆕 v5.0 — TEMPS RÉEL
   - `_run_refresh` async + asyncio.to_thread → ne bloque plus la loop
   - Utilise `run_incremental_inproc` (pas de open/close du pool Oracle)
   - Heartbeat 15s
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import AsyncGenerator

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app import duckdb_client

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None
_subscribers: list[asyncio.Queue] = []


# ====================================================================
# Bus SSE
# ====================================================================
def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    if q in _subscribers:
        _subscribers.remove(q)


def _broadcast(event: str, data: dict) -> None:
    """Publie un événement à tous les clients SSE connectés."""
    payload = {"event": event, "data": data, "ts": datetime.utcnow().isoformat()}
    n_subs = len(_subscribers)
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            logger.warning("Queue SSE pleine, événement perdu pour 1 client")
    if event != "ping":
        logger.info("[SSE] broadcast '%s' → %d client(s)", event, n_subs)


# ====================================================================
# Helpers de snapshot
# ====================================================================
def _counts_snapshot() -> dict:
    """Compte mutations + egf actuellement en cache DuckDB."""
    try:
        c = duckdb_client.counts()
        return {"mutations": c.get("mutations", 0), "egf": c.get("egf", 0)}
    except Exception:
        return {"mutations": 0, "egf": 0}


def _new_count_snapshot() -> int:
    """🆕 v5.2 — Nombre de mutations PAS encore contrôlées."""
    try:
        return duckdb_client.count_non_controlees()
    except Exception:
        return 0


# ====================================================================
# Job de refresh (async)
# ====================================================================
async def _run_refresh(forced_by: str = "scheduler") -> None:
    """Refresh incrémental — async pour ne pas bloquer la loop SSE."""
    logger.info("[refresh] déclenché par %s", forced_by)
    started = datetime.utcnow()
    _broadcast("refresh_started", {"triggered_by": forced_by})

    before = _counts_snapshot()
    before_new = _new_count_snapshot()

    try:
        from scripts.pipeline import run_incremental_inproc
        result = await asyncio.to_thread(run_incremental_inproc)
        status = "ok"
        error = None
    except Exception as e:
        logger.exception("[refresh] échec")
        result = {}
        status = "error"
        error = str(e)[:500]
        duckdb_client.set_meta("last_refresh_status", "error")
        duckdb_client.set_meta("last_refresh_error", error)

    after = _counts_snapshot()
    after_new = _new_count_snapshot()
    delta = {
        "mutations": after["mutations"] - before["mutations"],
        "egf":       after["egf"]       - before["egf"],
    }
    new_delta = after_new - before_new
    duration = (datetime.utcnow() - started).total_seconds()

    finish_payload = {
        "status":      status,
        "triggered_by": forced_by,
        "duration_seconds": round(duration, 1),
        "counts":      after,
        "delta":       delta,
        "new_count":   after_new,        # 🆕 v5.2 — total demandes non-contrôlées
        "new_delta":   new_delta,        # 🆕 v5.2 — nouvelles arrivées non-contrôlées
        "error":       error,
    }
    _broadcast("refresh_finished", finish_payload)

    if status == "ok":
        bumped = (
            delta["mutations"] != 0
            or delta["egf"] != 0
            or new_delta != 0
        )
        if bumped or forced_by == "manual":
            _broadcast("data_changed", {
                "delta":       delta,
                "counts":      after,
                "new_count":   after_new,     # 🆕 v5.2 — pour mettre à jour le badge
                "new_delta":   new_delta,     # 🆕 v5.2
                "triggered_by": forced_by,
            })


def trigger_refresh_now(triggered_by: str = "manual") -> None:
    """Appelé par l'endpoint POST /api/reload."""
    if _scheduler is None:
        try:
            loop = asyncio.get_event_loop()
            loop.create_task(_run_refresh(triggered_by))
        except RuntimeError:
            logger.error("Pas de loop asyncio dispo pour trigger_refresh_now")
        return
    _scheduler.add_job(
        _run_refresh,
        args=[triggered_by],
        id=f"manual-{datetime.utcnow().timestamp()}",
        replace_existing=False,
        misfire_grace_time=60,
    )


# ====================================================================
# Cycle de vie
# ====================================================================
def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    from datetime import timedelta
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_refresh,
        "interval",
        minutes=settings.refresh_interval_minutes,
        id="periodic_refresh",
        # 🆕 v5.1 — 1er refresh 15s après le démarrage (au lieu d'attendre 5 min)
        next_run_time=datetime.utcnow() + timedelta(seconds=15),
        misfire_grace_time=120,
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler démarré (1er run dans 15s, puis toutes les %d min)",
        settings.refresh_interval_minutes,
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


# ====================================================================
# Streaming SSE
# ====================================================================
async def sse_stream() -> AsyncGenerator[dict, None]:
    """Producteur pour l'endpoint /api/events (sse-starlette).

    Events émis :
      - hello             : à la connexion
      - ping              : heartbeat toutes les 15s
      - refresh_started   : juste avant un refresh
      - refresh_finished  : après refresh, avec delta + status + new_count
      - data_changed      : seulement si le refresh a réellement modifié le cache
    """
    q = subscribe()
    try:
        yield {"event": "hello", "data": json.dumps({"connected_at": datetime.utcnow().isoformat()})}
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
                yield {"event": msg["event"], "data": json.dumps(msg)}
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": "{}"}
    finally:
        unsubscribe(q)