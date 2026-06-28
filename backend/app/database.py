"""Pool de connexions Oracle (mode thin, sans client Instant)."""
import logging
from contextlib import contextmanager

import oracledb
import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)

_pool: oracledb.ConnectionPool | None = None


def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    _pool = oracledb.create_pool(
        user=settings.oracle_user,
        password=settings.oracle_password,
        dsn=settings.oracle_dsn,
        min=settings.oracle_pool_min,
        max=settings.oracle_pool_max,
        increment=settings.oracle_pool_increment,
    )
    logger.info("Pool Oracle créé (%s, min=%d, max=%d)",
                settings.oracle_dsn, settings.oracle_pool_min, settings.oracle_pool_max)


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def get_connection():
    if _pool is None:
        init_pool()
    conn = _pool.acquire()
    try:
        yield conn
    finally:
        _pool.release(conn)


def fetch_df(sql: str, params: dict | None = None, fetch_array_size: int = 1000) -> pd.DataFrame:
    """Exécute une requête paramétrée et retourne un DataFrame pandas."""
    params = params or {}
    with get_connection() as conn:
        cur = conn.cursor()
        cur.arraysize = fetch_array_size
        cur.execute(sql, params)
        cols = [c[0] for c in cur.description]
        rows = cur.fetchall()
        cur.close()
    return pd.DataFrame(rows, columns=cols)
