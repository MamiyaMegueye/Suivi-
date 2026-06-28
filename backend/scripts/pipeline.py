"""CLI pipeline d'extraction Oracle → DuckDB avec chunking mensuel.

🆕 v5.0 — Ajout `run_incremental_inproc()`
   Version "in-process" appelée par le scheduler FastAPI :
   - NE PAS appeler init_pool() / close_pool() (le pool est géré par le lifespan FastAPI)
   - NE PAS appeler duckdb_client.init_db() (déjà ouvert au démarrage)
   - Retourne un dict {mutations_loaded, egf_loaded, periode}
   `run_incremental()` reste utilisable en CLI (et continue à ouvrir/fermer le pool).

v4.6 — Extract des secteurs (référentiel S_SECTEUR)

Usage :
  python -m scripts.pipeline --initial          # full reload 3 mois, mois par mois
  python -m scripts.pipeline --month 2026-06    # recharge un mois précis
  python -m scripts.pipeline                    # incrémental : mois courant
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import date
from dateutil.relativedelta import relativedelta

sys.path.insert(0, ".")

from app.config import settings
from app.database import init_pool, close_pool, fetch_df
from app import duckdb_client
from app.extractor import SQL_CENTRES, SQL_MUTATIONS, SQL_EGF, SQL_SECTEURS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("pipeline")


# =====================================================================
# Extraction par mois
# =====================================================================
def _mois_borne(annee: int, mois: int) -> tuple[date, date]:
    debut = date(annee, mois, 1)
    fin = (debut + relativedelta(months=1)) - relativedelta(days=1)
    return debut, fin


def extract_centres() -> int:
    log.info("→ Centres…")
    df = fetch_df(SQL_CENTRES, {"zone_id": settings.zone_id})
    n = duckdb_client.replace_table("centres", df)
    log.info("   %d centres", n)
    return n


def extract_secteurs() -> int:
    log.info("→ Secteurs…")
    df = fetch_df(SQL_SECTEURS, {"zone_id": settings.zone_id})
    n = duckdb_client.replace_table("secteurs", df)
    log.info("   %d secteurs", n)
    return n


def extract_month(table: str, sql: str, annee: int, mois: int, append: bool = True) -> int:
    """Extrait 1 mois de mutations ou EGF. Retry si timeout réseau."""
    d_deb, d_fin = _mois_borne(annee, mois)
    params = {
        "zone_id": settings.zone_id,
        "date_debut": d_deb,
        "date_fin": d_fin,
    }
    for attempt in range(1, 4):
        try:
            t0 = time.time()
            df = fetch_df(sql, params)
            if settings.centres_inclus_list:
                df = df[df["CODE_CENTRE"].isin(settings.centres_inclus_list)]
            dur = time.time() - t0
            log.info("   [%s %d-%02d] %d lignes en %.1fs",
                     table, annee, mois, len(df), dur)
            if append:
                duckdb_client.append_table(table, df, date_col=_date_col(table),
                                           date_debut=d_deb, date_fin=d_fin)
            else:
                duckdb_client.replace_table(table, df)
            return len(df)
        except Exception as e:
            msg = str(e)
            non_retryable = (
                "Binder Error" in msg
                or "Conversion Error" in msg
                or "Catalog Error" in msg
            )
            if non_retryable:
                log.error("   [%s %d-%02d] ❌ Erreur DuckDB (non retryable) : %s",
                          table, annee, mois, msg[:200])
                raise
            log.warning("   tentative %d/3 [%s %d-%02d] échouée : %s",
                        attempt, table, annee, mois, msg[:200])
            if attempt == 3:
                raise
            time.sleep(5 * attempt)


def _date_col(table: str) -> str:
    return {"mutations": "DATE_DEMANDE", "egf": "DATE_FACTURE"}[table]


# =====================================================================
# 🆕 v5.0 — Cœur d'extraction (sans toucher au pool ni à DuckDB init)
# =====================================================================
def _do_incremental() -> dict:
    """Logique d'extraction du mois courant, partagée entre CLI et scheduler."""
    today = date.today()
    d_deb, d_fin = _mois_borne(today.year, today.month)

    extract_centres()
    extract_secteurs()

    duckdb_client.delete_range("mutations", "DATE_DEMANDE",  d_deb, d_fin)
    duckdb_client.delete_range("egf",       "DATE_FACTURE", d_deb, d_fin)

    n_mut = extract_month("mutations", SQL_MUTATIONS, today.year, today.month, append=True)
    n_egf = extract_month("egf",       SQL_EGF,       today.year, today.month, append=True)

    _write_meta_ok()
    duckdb_client.set_meta(
        "last_refresh_periode",
        f"{d_deb.isoformat()} → {d_fin.isoformat()}",
    )

    return {
        "mutations_loaded": int(n_mut or 0),
        "egf_loaded":       int(n_egf or 0),
        "periode":          f"{d_deb.isoformat()} → {d_fin.isoformat()}",
    }


# =====================================================================
# Modes CLI (gèrent le cycle de vie pool + DuckDB)
# =====================================================================
def run_initial(nb_mois: int = 3) -> None:
    log.info("=== INITIAL LOAD (%d mois, mois par mois) ===", nb_mois)
    init_pool()
    duckdb_client.init_db()
    try:
        extract_centres()
        extract_secteurs()

        today = date.today()
        duckdb_client.truncate("mutations")
        duckdb_client.truncate("egf")

        for i in range(nb_mois - 1, -1, -1):
            ref = today - relativedelta(months=i)
            log.info("--- Mois %d-%02d ---", ref.year, ref.month)
            extract_month("mutations", SQL_MUTATIONS, ref.year, ref.month, append=True)
            extract_month("egf",       SQL_EGF,       ref.year, ref.month, append=True)

        _write_meta_ok()
        log.info("=== INITIAL LOAD OK ===")
    finally:
        close_pool()


def run_incremental() -> None:
    """Mode CLI — ouvre et ferme le pool Oracle."""
    log.info("=== INCREMENTAL CLI (mois courant) ===")
    init_pool()
    duckdb_client.init_db()
    try:
        _do_incremental()
        log.info("=== INCREMENTAL OK ===")
    finally:
        close_pool()


# 🆕 v5.0
def run_incremental_inproc() -> dict:
    """Mode in-process — appelé par le scheduler FastAPI.

    Ne touche PAS au pool Oracle (FastAPI le gère via lifespan).
    Ne touche PAS à duckdb_client.init_db() / close_db() (déjà ouvert).
    Retourne un dict avec les compteurs pour traçabilité.
    """
    log.info("=== INCREMENTAL INPROC (mois courant, sans toucher au pool) ===")
    result = _do_incremental()
    log.info("=== INCREMENTAL INPROC OK : %s ===", result)
    return result


def run_month(year: int, month: int) -> None:
    log.info("=== RELOAD MOIS %d-%02d ===", year, month)
    init_pool()
    duckdb_client.init_db()
    try:
        extract_centres()
        extract_secteurs()
        d_deb, d_fin = _mois_borne(year, month)
        duckdb_client.delete_range("mutations", "DATE_DEMANDE",  d_deb, d_fin)
        duckdb_client.delete_range("egf",       "DATE_FACTURE", d_deb, d_fin)
        extract_month("mutations", SQL_MUTATIONS, year, month, append=True)
        extract_month("egf",       SQL_EGF,       year, month, append=True)
        _write_meta_ok()
    finally:
        close_pool()


def _write_meta_ok() -> None:
    c = duckdb_client.counts()
    duckdb_client.set_meta("last_refresh_status",     "ok")
    duckdb_client.set_meta("last_refresh_triggered_by", "scheduler")
    duckdb_client.set_meta("last_refresh_mutations",  str(c.get("mutations", 0)))
    duckdb_client.set_meta("last_refresh_egf",        str(c.get("egf", 0)))
    duckdb_client.set_meta("last_refresh_centres",    str(c.get("centres", 0)))
    duckdb_client.set_meta("last_refresh_secteurs",   str(c.get("secteurs", 0)))


# =====================================================================
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group()
    g.add_argument("--initial", action="store_true",
                   help="Full reload des 3 mois roulants (mois par mois)")
    g.add_argument("--month", type=str, metavar="YYYY-MM",
                   help="Recharge un mois précis (ex: 2026-06)")
    args = p.parse_args()

    if args.initial:
        run_initial(nb_mois=settings.egf_months_rolling + 1)
    elif args.month:
        y, m = args.month.split("-")
        run_month(int(y), int(m))
    else:
        run_incremental()