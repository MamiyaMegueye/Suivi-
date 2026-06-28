"""Extracteur Oracle → DuckDB.

🆕 v5.5 — CREE_PAR utilise UTIL_TRAC (matricule utilisateur traçabilité).
         Confirmé via DBeaver : AGENT_SNDE est NULL en prod, UTIL_TRAC contient
         le matricule de l'agent qui a saisi la demande (ex: 2109).
🆕 v4.9 — Résolution REF_ABONNEMENT + CODE_CLIENT via S_ABONNEMENT.DMD_ID
v4.8 — Fix VALIDE : DMD_FLAG_VLD
v4.7 — SQL_SECTEURS dédupliqué
v4.6 — Ajout SQL_SECTEURS (référentiel S_SECTEUR)
v4.4 — Alias SQL canoniques + mapping validé
"""
import logging
from datetime import date, datetime
from dateutil.relativedelta import relativedelta

import pandas as pd

from app.config import settings
from app.database import fetch_df
from app import duckdb_client

logger = logging.getLogger(__name__)
S = settings.oracle_schema  # CRM_SNDE


# =====================================================================
# Requêtes Oracle SOURCE
# =====================================================================
SQL_CENTRES = f"""
SELECT STR_CODE     AS CODE,
       STR_LIB_LT   AS NOM
FROM   {S}.S_STRUCTURE
WHERE  ZONE_ID = :zone_id
  AND  STR_ID NOT IN (1, 2, 63)
  AND  STR_CODE IS NOT NULL
ORDER  BY STR_LIB_LT
"""

SQL_SECTEURS = f"""
SELECT CODE_CENTRE, SECT_CODE, MIN(SECT_LIBLT) AS SECT_LIBLT
FROM (
    SELECT str.STR_CODE   AS CODE_CENTRE,
           s.SECT_CODE    AS SECT_CODE,
           s.SECT_LIBLT   AS SECT_LIBLT
    FROM   {S}.S_SECTEUR    s
    JOIN   {S}.S_STRUCTURE  str ON str.STR_ID = s.STR_ID
    WHERE  str.ZONE_ID = :zone_id
      AND  str.STR_ID NOT IN (1, 2, 63)
      AND  s.SECT_CODE IS NOT NULL
)
GROUP BY CODE_CENTRE, SECT_CODE
ORDER  BY CODE_CENTRE, SECT_CODE
"""

# 🆕 v5.5 — CREE_PAR = UTIL_TRAC (au lieu de AGENT_SNDE toujours NULL)
SQL_MUTATIONS = f"""
SELECT
    TO_CHAR(d.DMD_ID)                                              AS NUM_DEMANDE,
    TO_CHAR(abn.ABN_ID)                                            AS REF_ABONNEMENT,
    TO_CHAR(abn.CLI_ID)                                            AS CODE_CLIENT,
    d.DMD_NOM                                                      AS NOM_CLIENT,
    td.TYPD_LIB_LT                                                 AS TYPE_DEMANDE,
    d.MSG_MUTATION                                                 AS TYPE_MUTATION,
    d.DMD_DATE                                                     AS DATE_DEMANDE,
    CASE WHEN d.DMD_FLAG_VLD = 1 THEN 'OUI' ELSE 'NON' END         AS VALIDE,
    CASE WHEN d.FLAG_ANNUL   = 1 THEN 'OUI' ELSE 'NON' END         AS ANNULE,
    str.STR_CODE                                                   AS CODE_CENTRE,
    str.STR_LIB_LT                                                 AS NOM_CENTRE,
    s.SECT_CODE                                                    AS SECTEUR,
    t.TOUR_CODE                                                    AS TOURNEE,
    d.DMD_ADRESSE                                                  AS ADRESSE,
    TO_CHAR(d.UTIL_TRAC)                                           AS CREE_PAR       -- 🆕 v5.5
FROM       {S}.S_DEMANDE        d
LEFT JOIN  {S}.S_ABONNEMENT     abn ON abn.DMD_ID  = d.DMD_ID
LEFT JOIN  {S}.S_STRUCTURE      str ON str.STR_ID  = d.STR_ID
LEFT JOIN  {S}.S_TYPE_DEMANDE   td  ON td.TYPD_ID  = d.TYPD_ID
LEFT JOIN  {S}.S_SECTEUR        s   ON s.SECT_ID   = d.SECT_ID
LEFT JOIN  {S}.S_TOURNEE        t   ON t.TOUR_ID   = d.TOUR_ID
WHERE  str.ZONE_ID = :zone_id
  AND  str.STR_ID NOT IN (1, 2, 63)
  AND  d.DMD_DATE BETWEEN :date_debut AND :date_fin
"""

SQL_EGF = f"""
SELECT
    str.STR_LIB_LT                                                 AS CENTRE,
    str.STR_CODE                                                   AS CODE_CENTRE,
    s.SECT_CODE                                                    AS SECTEUR,
    fm.FACT_NUM                                                    AS NUM_FACTURE,
    TO_CHAR(abn.ABN_ID)                                            AS REFERENCE,
    abn.ANCIENNE_REFRENCE                                          AS ANC_REFERENCE,
    COALESCE(cli.CLT_NOMCONCAT,
             cli.CLT_TITRE||' '||cli.CLT_NOM||' '||cli.CLT_PRENOM) AS NOM,
    NULL                                                           AS TARIF,
    t.TOUR_CODE                                                    AS TOURNEE,
    cpt.CPT_SERIE                                                  AS COMPTEUR,
    cpt.CPI_REFERENCE                                              AS REFERENCE_COMPTEUR,
    fm.FACT_DATE                                                   AS DATE_FACTURE,
    CASE fm.TYPE_FACT
        WHEN 0  THEN 'Facture Relevée'
        WHEN 1  THEN 'Facture Forfaitaire'
        WHEN 2  THEN 'Facture Estimée'
        WHEN 4  THEN 'Facture Mutation'
        WHEN 5  THEN 'Facture Nv Abonnement'
        WHEN 6  THEN 'Facture Réabonnement'
        WHEN 7  THEN 'Facture Redressement'
        WHEN 8  THEN 'Facture Débit Intercalaire'
        WHEN 9  THEN 'Facture Arrêt du Compte'
        WHEN 10 THEN 'Facture Pénalité'
        ELSE 'Type ' || TO_CHAR(fm.TYPE_FACT)
    END                                                            AS TYPE_FACTURE,
    rel.REL_DATE_ANC_INDEX                                         AS DATE_DEBUT,
    rel.REL_DATE                                                   AS DATE_FIN,
    rel.REL_ANCIEN_INDEX                                           AS INDEX_DEBUT,
    rel.REL_INDEX                                                  AS INDEX_FIN,
    fm.FAT_QTE_CONS                                                AS CONSOMMATION,
    fm.FACT_MNT                                                    AS V_FACTURE,
    fm.FACT_MNT                                                    AS MONTANT,
    fm.FACT_MNT_TTC - fm.FACT_MNT                                  AS ARRIERES,
    fm.FACT_MNT_TTC                                                AS SOLDE,
    abn.ABN_ADRESSE                                                AS ADRESSE,
    NULL                                                           AS TYPE_COMPTAGE
FROM       {S}.S_FACTURE_M       fm
LEFT JOIN  {S}.S_STRUCTURE       str ON str.STR_ID  = fm.STR_ID
LEFT JOIN  {S}.S_ABONNEMENT      abn ON abn.ABN_ID  = fm.ABN_ID
LEFT JOIN  {S}.S_CLIENT          cli ON cli.CLT_ID  = fm.CLT_ID
LEFT JOIN  {S}.S_RELEVE          rel ON rel.REL_ID  = fm.REL_ID
LEFT JOIN  {S}.S_COMPTEUR_INS    cpt ON cpt.CPI_REF = rel.CPT_REF
LEFT JOIN  {S}.S_SECTEUR         s   ON s.SECT_ID   = fm.SECT_ID
LEFT JOIN  {S}.S_TOURNEE         t   ON t.TOUR_ID   = fm.TOUR_ID
WHERE  str.ZONE_ID = :zone_id
  AND  str.STR_ID NOT IN (1, 2, 63)
  AND  fm.FACT_DATE BETWEEN :date_debut AND :date_fin
  AND  fm.REL_ID IS NOT NULL
"""


# =====================================================================
# Fenêtre legacy
# =====================================================================
def _fenetre_egf() -> tuple[date, date]:
    today = date.today()
    debut = (today.replace(day=1) - relativedelta(months=settings.egf_months_rolling))
    fin = (today.replace(day=1) + relativedelta(months=1)) - relativedelta(days=1)
    return debut, fin


def _fenetre_mutations() -> tuple[date, date]:
    return _fenetre_egf()


# =====================================================================
# refresh_all (legacy)
# =====================================================================
def refresh_all(forced_by: str = "scheduler") -> dict:
    """⚠️ DEPRECATED — Utilise `python -m scripts.pipeline`."""
    started = datetime.utcnow()
    result: dict = {"started_at": started.isoformat(), "triggered_by": forced_by}

    try:
        df_centres = fetch_df(SQL_CENTRES, {"zone_id": settings.zone_id})
        n_centres = duckdb_client.replace_table("centres", df_centres)
        result["centres"] = n_centres

        df_sect = fetch_df(SQL_SECTEURS, {"zone_id": settings.zone_id})
        n_sect = duckdb_client.replace_table("secteurs", df_sect)
        result["secteurs"] = n_sect

        d_deb, d_fin = _fenetre_mutations()
        df_mut = fetch_df(SQL_MUTATIONS, {
            "zone_id": settings.zone_id,
            "date_debut": d_deb,
            "date_fin": d_fin,
        })
        if settings.centres_inclus_list:
            df_mut = df_mut[df_mut["CODE_CENTRE"].isin(settings.centres_inclus_list)]
        n_mut = duckdb_client.replace_table("mutations", df_mut)
        result["mutations"] = n_mut

        df_egf = fetch_df(SQL_EGF, {
            "zone_id": settings.zone_id,
            "date_debut": d_deb,
            "date_fin": d_fin,
        })
        if settings.centres_inclus_list:
            df_egf = df_egf[df_egf["CODE_CENTRE"].isin(settings.centres_inclus_list)]
        n_egf = duckdb_client.replace_table("egf", df_egf)
        result["egf"] = n_egf

        ended = datetime.utcnow()
        result["ended_at"] = ended.isoformat()
        result["duration_seconds"] = (ended - started).total_seconds()
        result["status"] = "ok"

        duckdb_client.set_meta("last_refresh_status", "ok")
        duckdb_client.set_meta("last_refresh_duration", f"{result['duration_seconds']:.1f}")
        duckdb_client.set_meta("last_refresh_triggered_by", forced_by)
        duckdb_client.set_meta("last_refresh_mutations", str(n_mut))
        duckdb_client.set_meta("last_refresh_egf", str(n_egf))
        duckdb_client.set_meta("last_refresh_centres", str(n_centres))
        duckdb_client.set_meta("last_refresh_secteurs", str(n_sect))
        duckdb_client.set_meta("last_refresh_periode",
                               f"{d_deb.isoformat()} → {d_fin.isoformat()}")
        return result

    except Exception as e:
        logger.exception("Échec refresh")
        duckdb_client.set_meta("last_refresh_status", "error")
        duckdb_client.set_meta("last_refresh_error", str(e)[:500])
        result["status"] = "error"
        result["error"] = str(e)
        return result