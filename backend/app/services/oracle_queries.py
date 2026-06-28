"""Lectures depuis DuckDB pour servir l'API.

⚠️ Plus aucun accès Oracle ici. Oracle n'est interrogé QUE par l'extracteur
(app/extractor.py), de manière asynchrone via le scheduler.
"""
from datetime import date
import pandas as pd

from app import duckdb_client


def get_centres() -> pd.DataFrame:
    return duckdb_client.read_df(
        "SELECT CODE, NOM FROM centres WHERE CODE IS NOT NULL ORDER BY NOM"
    )


def get_mutations(code_centre: int, date_debut: date, date_fin: date) -> pd.DataFrame:
    return duckdb_client.read_df(
        """
        SELECT *
        FROM   mutations
        WHERE  CODE_CENTRE  = ?
          AND  DATE_DEMANDE BETWEEN ? AND ?
        ORDER  BY DATE_DEMANDE, NUM_DEMANDE
        """,
        [code_centre, date_debut, date_fin],
    )


def get_egf(code_centre: int, date_debut: date, date_fin: date) -> pd.DataFrame:
    return duckdb_client.read_df(
        """
        SELECT *
        FROM   egf
        WHERE  CODE_CENTRE = ?
          AND  DATE_FACTURE BETWEEN ? AND ?
        ORDER  BY DATE_FACTURE DESC, NUM_FACTURE
        """,
        [code_centre, date_debut, date_fin],
    )
