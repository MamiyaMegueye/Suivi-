"""Utilitaires partagés — v4.3

🆕 v4.3 — `to_jsonable_records()` : convertit un DataFrame en list[dict] 100% JSON-safe.

Problème : pandas renvoie NaN (float), NaT (datetime), +Inf/-Inf. Le module json
standard de Python (utilisé par Starlette/FastAPI) refuse ces valeurs, alors que
JavaScript les remplacerait par `null`. On fait le nettoyage côté Python.
"""
from __future__ import annotations

import math
import pandas as pd


def to_jsonable_records(df: pd.DataFrame) -> list[dict]:
    """Convertit un DataFrame en records JSON-safe.

    Remplace par None :
      - NaN (float manquant)
      - NaT (datetime manquant)
      - +Inf / -Inf
      - pd.NA (extension nullable)

    Conserve tels quels les Timestamp/date/datetime (FastAPI sait les sérialiser
    via son ResponseModel ou son encodeur par défaut).
    """
    if df is None or df.empty:
        return []

    records = df.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if v is None:
                continue
            # NaN / Inf flottants
            if isinstance(v, float):
                if math.isnan(v) or math.isinf(v):
                    row[k] = None
                continue
            # NaT / pd.NA (scalaire seulement, pd.isna sur un array lèverait)
            try:
                if pd.isna(v):
                    row[k] = None
            except (TypeError, ValueError):
                # pd.isna peut râler sur certains types exotiques — on laisse passer
                pass
    return records