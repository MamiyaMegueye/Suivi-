"""Accès DuckDB : cache local, schéma, lectures.

🆕 v5.2 — Table `audit_log` pour suivre les demandes déjà contrôlées
v5.0+ — Voir release notes
v4.7 — Suppression de la PK composite sur `secteurs`
v4.6 — Ajout table `secteurs`
v4.5 — Fix _check_schema_version
v4.4 — Ajout colonne TOURNEE dans mutations
v4.3 — Auto-migration : DROP+CREATE quand SCHEMA_VERSION change
"""
import logging
from pathlib import Path
from contextlib import contextmanager
from threading import Lock

import duckdb
import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)
_lock = Lock()
_conn: duckdb.DuckDBPyConnection | None = None


# 🆕 v5.2 — bump pour créer la table audit_log
SCHEMA_VERSION = 6


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS mutations (
    NUM_DEMANDE     VARCHAR,
    REF_ABONNEMENT  VARCHAR,
    CODE_CLIENT     VARCHAR,
    NOM_CLIENT      VARCHAR,
    TYPE_DEMANDE    VARCHAR,
    TYPE_MUTATION   VARCHAR,
    DATE_DEMANDE    DATE,
    VALIDE          VARCHAR,
    ANNULE          VARCHAR,
    CODE_CENTRE     INTEGER,
    NOM_CENTRE      VARCHAR,
    SECTEUR         VARCHAR,
    TOURNEE         VARCHAR,
    ADRESSE         VARCHAR,
    CREE_PAR        VARCHAR
);

CREATE TABLE IF NOT EXISTS egf (
    CENTRE              VARCHAR,
    CODE_CENTRE         INTEGER,
    SECTEUR             VARCHAR,
    NUM_FACTURE         VARCHAR,
    REFERENCE           VARCHAR,
    ANC_REFERENCE       VARCHAR,
    NOM                 VARCHAR,
    TARIF               VARCHAR,
    TOURNEE             VARCHAR,
    COMPTEUR            VARCHAR,
    REFERENCE_COMPTEUR  VARCHAR,
    DATE_FACTURE        DATE,
    TYPE_FACTURE        VARCHAR,
    DATE_DEBUT          DATE,
    DATE_FIN            DATE,
    INDEX_DEBUT         DOUBLE,
    INDEX_FIN           DOUBLE,
    CONSOMMATION        DOUBLE,
    V_FACTURE           DOUBLE,
    MONTANT             DOUBLE,
    ARRIERES            DOUBLE,
    SOLDE               DOUBLE,
    ADRESSE             VARCHAR,
    TYPE_COMPTAGE       VARCHAR
);

CREATE TABLE IF NOT EXISTS centres (
    CODE  INTEGER PRIMARY KEY,
    NOM   VARCHAR
);

CREATE TABLE IF NOT EXISTS secteurs (
    CODE_CENTRE  INTEGER,
    SECT_CODE    VARCHAR,
    SECT_LIBLT   VARCHAR
);

-- 🆕 v5.2 — Log des demandes déjà contrôlées par l'utilisateur
-- Pour qu'une demande disparaisse de l'onglet "Nouveautés" après clic.
CREATE TABLE IF NOT EXISTS audit_log (
    NUM_DEMANDE   VARCHAR PRIMARY KEY,
    CONTROLE_PAR  VARCHAR,
    CONTROLE_AT   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meta (
    KEY         VARCHAR PRIMARY KEY,
    VALUE       VARCHAR,
    UPDATED_AT  TIMESTAMP
);
"""

# audit_log volontairement HORS de DATA_TABLES :
# on NE veut PAS le supprimer lors d'une migration de schéma (on perdrait
# les contrôles utilisateur). On le crée via SCHEMA_SQL et c'est tout.
DATA_TABLES = ("mutations", "egf", "centres", "secteurs")


def _check_schema_version(conn: duckdb.DuckDBPyConnection) -> None:
    """Compare la version stockée avec SCHEMA_VERSION et migre si besoin."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS meta (
            KEY         VARCHAR PRIMARY KEY,
            VALUE       VARCHAR,
            UPDATED_AT  TIMESTAMP
        )
    """)

    row = conn.execute("SELECT VALUE FROM meta WHERE KEY = 'schema_version'").fetchone()
    current = int(row[0]) if row and row[0] else 0

    if current == SCHEMA_VERSION:
        return

    existing = conn.execute(f"""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
          AND table_name IN {DATA_TABLES}
    """).fetchall()
    has_existing_tables = len(existing) > 0

    need_drop = (current > 0) or (current == 0 and has_existing_tables)

    if need_drop:
        if current == 0:
            logger.warning(
                "DuckDB : tables data existantes sans versioning "
                "→ DROP et recréation au schéma v%d", SCHEMA_VERSION,
            )
        else:
            logger.warning(
                "DuckDB : schéma obsolète (v%d → v%d) → DROP et recréation des tables data",
                current, SCHEMA_VERSION,
            )
        for t in DATA_TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        # ⚠️ NE PAS dropper audit_log — c'est l'historique utilisateur
        logger.info("DuckDB : audit_log préservée (historique utilisateur)")
    else:
        logger.info("DuckDB : nouveau cache (schéma v%d)", SCHEMA_VERSION)

    conn.execute(SCHEMA_SQL)
    conn.execute(
        "INSERT OR REPLACE INTO meta (KEY, VALUE, UPDATED_AT) VALUES (?, ?, CURRENT_TIMESTAMP)",
        ["schema_version", str(SCHEMA_VERSION)],
    )

    if need_drop:
        logger.warning("👉 Relance `python -m scripts.pipeline --initial` pour repeupler le cache")


def init_db() -> None:
    global _conn
    path = Path(settings.duckdb_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    _conn = duckdb.connect(str(path))
    _check_schema_version(_conn)
    _conn.execute(SCHEMA_SQL)
    logger.info("DuckDB prêt : %s (schéma v%d)", path.resolve(), SCHEMA_VERSION)


def close_db() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


@contextmanager
def writer():
    with _lock:
        yield _conn


def read_df(sql: str, params: list | None = None) -> pd.DataFrame:
    """🆕 v5.6.2 — Thread-safe : utilise le lock partagé pour éviter les
    collisions avec les writes concurrents qui faisaient retourner None.
    """
    if _conn is None:
        init_db()
    with _lock:
        df = _conn.execute(sql, params or []).fetch_df()
    if df is None:
        # Garde-fou défensif : on ne propage jamais None vers les endpoints
        import pandas as pd
        return pd.DataFrame()
    return df


def set_meta(key: str, value: str) -> None:
    with writer() as c:
        c.execute(
            "INSERT OR REPLACE INTO meta (KEY, VALUE, UPDATED_AT) VALUES (?, ?, CURRENT_TIMESTAMP)",
            [key, value],
        )


def get_meta(key: str) -> tuple[str | None, str | None]:
    if _conn is None:
        init_db()
    row = _conn.execute("SELECT VALUE, UPDATED_AT FROM meta WHERE KEY = ?", [key]).fetchone()
    if not row:
        return None, None
    return row[0], (row[1].isoformat() if row[1] else None)


def replace_table(table: str, df: pd.DataFrame) -> int:
    with writer() as c:
        c.register("_tmp_df", df)
        c.execute(f"DELETE FROM {table}")
        if not df.empty:
            c.execute(f"INSERT INTO {table} SELECT * FROM _tmp_df")
        c.unregister("_tmp_df")
        n = c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    return int(n)


def append_table(table: str, df: pd.DataFrame, date_col: str | None = None,
                 date_debut=None, date_fin=None) -> int:
    if df.empty:
        return 0
    with writer() as c:
        c.register("_tmp_df", df)
        c.execute(f"INSERT INTO {table} SELECT * FROM _tmp_df")
        c.unregister("_tmp_df")
    return len(df)


def truncate(table: str) -> None:
    with writer() as c:
        c.execute(f"DELETE FROM {table}")


def delete_range(table: str, date_col: str, date_debut, date_fin) -> int:
    with writer() as c:
        n = c.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {date_col} BETWEEN ? AND ?",
            [date_debut, date_fin],
        ).fetchone()[0]
        c.execute(
            f"DELETE FROM {table} WHERE {date_col} BETWEEN ? AND ?",
            [date_debut, date_fin],
        )
    return int(n)


def counts() -> dict:
    out = {}
    with writer() as c:
        for t in DATA_TABLES:
            out[t] = int(c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
    return out


# ============================================================
# 🆕 v5.2 — API audit_log (demandes contrôlées par l'utilisateur)
# ============================================================
def mark_controle(num_demande: str, controle_par: str = "user") -> bool:
    """Marque une demande comme contrôlée. Idempotent (INSERT OR REPLACE).
    Retourne True si nouvelle insertion, False si déjà présente."""
    with writer() as c:
        existed = c.execute(
            "SELECT 1 FROM audit_log WHERE NUM_DEMANDE = ?", [num_demande]
        ).fetchone()
        c.execute(
            """INSERT OR REPLACE INTO audit_log (NUM_DEMANDE, CONTROLE_PAR, CONTROLE_AT)
               VALUES (?, ?, CURRENT_TIMESTAMP)""",
            [num_demande, controle_par],
        )
    return existed is None


def unmark_controle(num_demande: str) -> bool:
    """Retire une demande de audit_log (la fait ré-apparaître dans Nouveautés)."""
    with writer() as c:
        n = c.execute(
            "DELETE FROM audit_log WHERE NUM_DEMANDE = ?", [num_demande]
        ).fetchone()
    return True


def count_non_controlees() -> int:
    """Nombre de mutations PAS encore contrôlées (mutations - audit_log)."""
    if _conn is None:
        init_db()
    row = _conn.execute("""
        SELECT COUNT(*)
        FROM mutations m
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_log a WHERE a.NUM_DEMANDE = m.NUM_DEMANDE
        )
    """).fetchone()
    return int(row[0] if row else 0)