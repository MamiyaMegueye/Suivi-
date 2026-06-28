"""Point d'entrée FastAPI — SNDE Audit Mutations.

🆕 v5.2 — Ajout du router `nouvelles` pour l'onglet "Nouveautés"
🆕 v5.0 — Temps réel SSE (scheduler async)
🆕 v4.4 — Router secteurs pour le dropdown cascading
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_pool, close_pool
from app import duckdb_client
from app.scheduler import start_scheduler, stop_scheduler
from app.api import (
    centres, mutations, egf, audit, health, admin, secteurs,
    nouvelles,  # 🆕 v5.2
)

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("snde-audit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Démarrage : initialisation Oracle + DuckDB + scheduler…")
    init_pool()
    duckdb_client.init_db()
    start_scheduler()
    logger.info("Démarrage terminé.")
    yield
    logger.info("Arrêt : fermeture scheduler + DuckDB + pool Oracle…")
    stop_scheduler()
    duckdb_client.close_db()
    close_pool()


app = FastAPI(
    title="SNDE Audit Mutations API",
    description="Audit R1→R9 sur cache DuckDB rafraîchi périodiquement depuis Oracle.",
    version="5.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(centres.router,   prefix="/api")
app.include_router(secteurs.router,  prefix="/api")
app.include_router(mutations.router, prefix="/api")
app.include_router(egf.router,       prefix="/api")
app.include_router(audit.router,     prefix="/api")
app.include_router(admin.router,     prefix="/api")
app.include_router(nouvelles.router, prefix="/api")  # 🆕 v5.2


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.app_host, port=settings.app_port, reload=True)