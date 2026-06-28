"""Moteur d'audit — règles R1 → R6.

Porte la logique de analyticsMutation.js en Python/pandas.

Mappings métier critiques :
  - Pour Nouveau Branchement → Facture Nv Abonnement
  - Pour Réabonnement        → Facture Réabonnement
  - Types factures portant un index : Relevée / Estimée / Mutation
  - Seuil compteur valide : > 1000 ; placeholder spécial : 999999
"""
from __future__ import annotations

import logging
import pandas as pd

from app.models import Anomalie, AuditStats, AuditResponse

logger = logging.getLogger(__name__)

# ---------- Constantes métier ----------
TYPE_FACTURE_FRAIS = {
    "Nouveau Branchement": "Facture Nv Abonnement",
    "Réabonnement":        "Facture Réabonnement",
}
TYPES_FACTURE_AVEC_INDEX = ["Facture Relevée", "Facture Estimée", "Facture Mutation"]
SEUIL_COMPTEUR_VALIDE = 1000
COMPTEUR_PLACEHOLDER  = 999999


def _norm(s):
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    return str(s).strip().lower()


def _is_mutation_compteur(row) -> bool:
    """TYPE_MUTATION contient 'compteur' (insensible casse + tirets/espaces)."""
    tm = _norm(row.get("TYPE_MUTATION"))
    return "compteur" in tm and "référence compteur" not in tm and "reference compteur" not in tm


def _factures_apres(egf: pd.DataFrame, ref_abo, date_dem) -> pd.DataFrame:
    if pd.isna(ref_abo) or ref_abo is None:
        return egf.iloc[0:0]
    sub = egf[(egf["REFERENCE"] == ref_abo) & (egf["DATE_FACTURE"] >= date_dem)]
    return sub.sort_values("DATE_FACTURE")


def _facture_precedente(egf: pd.DataFrame, ref_abo, date_fact) -> pd.Series | None:
    sub = egf[(egf["REFERENCE"] == ref_abo) & (egf["DATE_FACTURE"] < date_fact)]
    if sub.empty:
        return None
    return sub.sort_values("DATE_FACTURE").iloc[-1]


# =====================================================================
#                           CATÉGORIE A
# =====================================================================
def regle_R1_mutation_non_facturee(mutations: pd.DataFrame, egf: pd.DataFrame) -> list[Anomalie]:
    """R1 — Mutation Compteur validée sans Facture Mutation postérieure (HAUTE)."""
    anomalies: list[Anomalie] = []
    cible = mutations[
        (mutations["TYPE_DEMANDE"] == "Mutation")
        & (mutations["VALIDE"] == "OUI")
        & (mutations["ANNULE"] != "OUI")
        & (mutations.apply(_is_mutation_compteur, axis=1))
    ]
    for _, m in cible.iterrows():
        post = _factures_apres(egf, m["REF_ABONNEMENT"], m["DATE_DEMANDE"])
        if post[post["TYPE_FACTURE"] == "Facture Mutation"].empty:
            anomalies.append(Anomalie(
                regle="Mutation non facturée", code="R1", gravite="Haute",
                ref_abo=str(m["REF_ABONNEMENT"]) if pd.notna(m["REF_ABONNEMENT"]) else None,
                num_demande=str(m["NUM_DEMANDE"]),
                nom_client=m.get("NOM_CLIENT"),
                secteur=m.get("SECTEUR"),
                detail=f"Aucune Facture Mutation émise depuis le {m['DATE_DEMANDE']}."
            ))
    return anomalies


def regle_R2_multi_mutations(mutations: pd.DataFrame, egf: pd.DataFrame) -> list[Anomalie]:
    """R2 — ≥ 2 Factures Mutation pour le même abonné depuis la demande (MOYENNE)."""
    anomalies: list[Anomalie] = []
    cible = mutations[
        (mutations["TYPE_DEMANDE"] == "Mutation")
        & (mutations["VALIDE"] == "OUI")
        & (mutations["ANNULE"] != "OUI")
        & (mutations.apply(_is_mutation_compteur, axis=1))
    ]
    for _, m in cible.iterrows():
        post = _factures_apres(egf, m["REF_ABONNEMENT"], m["DATE_DEMANDE"])
        fm = post[post["TYPE_FACTURE"] == "Facture Mutation"]
        if len(fm) >= 2:
            anomalies.append(Anomalie(
                regle="Multi-mutations", code="R2", gravite="Moyenne",
                ref_abo=str(m["REF_ABONNEMENT"]) if pd.notna(m["REF_ABONNEMENT"]) else None,
                num_demande=str(m["NUM_DEMANDE"]),
                nom_client=m.get("NOM_CLIENT"),
                secteur=m.get("SECTEUR"),
                detail=f"{len(fm)} Factures Mutation détectées depuis le {m['DATE_DEMANDE']}."
            ))
    return anomalies


def regle_R3_conso_nulle_sans_forfait(mutations: pd.DataFrame, egf: pd.DataFrame) -> list[Anomalie]:
    """R3 — Facture Mutation à conso=0 dont la précédente n'est pas Forfaitaire (CRITIQUE)."""
    anomalies: list[Anomalie] = []
    cible = mutations[
        (mutations["TYPE_DEMANDE"] == "Mutation")
        & (mutations["VALIDE"] == "OUI")
        & (mutations["ANNULE"] != "OUI")
        & (mutations.apply(_is_mutation_compteur, axis=1))
    ]
    for _, m in cible.iterrows():
        post = _factures_apres(egf, m["REF_ABONNEMENT"], m["DATE_DEMANDE"])
        fm = post[post["TYPE_FACTURE"] == "Facture Mutation"]
        for _, f in fm.iterrows():
            try:
                vf = float(f.get("V_FACTURE") or 0)
            except (TypeError, ValueError):
                vf = 0.0
            if vf == 0:
                prev = _facture_precedente(egf, m["REF_ABONNEMENT"], f["DATE_FACTURE"])
                if prev is None or prev["TYPE_FACTURE"] != "Facture Forfaitaire":
                    anomalies.append(Anomalie(
                        regle="Conso nulle sans forfait", code="R3", gravite="Critique",
                        ref_abo=str(m["REF_ABONNEMENT"]) if pd.notna(m["REF_ABONNEMENT"]) else None,
                        num_demande=str(m["NUM_DEMANDE"]),
                        nom_client=m.get("NOM_CLIENT"),
                        secteur=m.get("SECTEUR"),
                        detail=(f"Facture Mutation {f.get('NUM_FACTURE')} à V_FACTURE=0 ; "
                                f"facture précédente = {prev['TYPE_FACTURE'] if prev is not None else 'aucune'}.")
                    ))
    return anomalies


# =====================================================================
#                           CATÉGORIE B
# =====================================================================
def regle_R4_index_pose_positif(mutations: pd.DataFrame, egf: pd.DataFrame) -> list[Anomalie]:
    """R4 — NB/Réab : 1ère facture portant un index avec INDEX_DEBUT > 0 (CRITIQUE)."""
    anomalies: list[Anomalie] = []
    cible = mutations[
        (mutations["TYPE_DEMANDE"].isin(["Nouveau Branchement", "Réabonnement"]))
        & (mutations["VALIDE"] == "OUI")
        & (mutations["ANNULE"] != "OUI")
    ]
    for _, m in cible.iterrows():
        post = _factures_apres(egf, m["REF_ABONNEMENT"], m["DATE_DEMANDE"])
        avec_idx = post[post["TYPE_FACTURE"].isin(TYPES_FACTURE_AVEC_INDEX)]
        if avec_idx.empty:
            continue
        first = avec_idx.iloc[0]
        try:
            idx = float(first.get("INDEX_DEBUT") or 0)
        except (TypeError, ValueError):
            idx = 0.0
        if idx > 0:
            anomalies.append(Anomalie(
                regle="Index de pose > 0", code="R4", gravite="Critique",
                ref_abo=str(m["REF_ABONNEMENT"]) if pd.notna(m["REF_ABONNEMENT"]) else None,
                num_demande=str(m["NUM_DEMANDE"]),
                nom_client=m.get("NOM_CLIENT"),
                secteur=m.get("SECTEUR"),
                detail=(f"INDEX_DEBUT={idx} sur la 1ère facture {first['TYPE_FACTURE']} "
                        f"({first.get('NUM_FACTURE')}) — compteur déjà utilisé.")
            ))
    return anomalies


def regle_R6_frais_non_factures(mutations: pd.DataFrame, egf: pd.DataFrame) -> list[Anomalie]:
    """R6 — NB sans Facture Nv Abonnement / Réab sans Facture Réabonnement (HAUTE)."""
    anomalies: list[Anomalie] = []
    cible = mutations[
        (mutations["TYPE_DEMANDE"].isin(["Nouveau Branchement", "Réabonnement"]))
        & (mutations["VALIDE"] == "OUI")
        & (mutations["ANNULE"] != "OUI")
    ]
    for _, m in cible.iterrows():
        type_attendu = TYPE_FACTURE_FRAIS[m["TYPE_DEMANDE"]]
        post = _factures_apres(egf, m["REF_ABONNEMENT"], m["DATE_DEMANDE"])
        if post[post["TYPE_FACTURE"] == type_attendu].empty:
            anomalies.append(Anomalie(
                regle=f"{m['TYPE_DEMANDE']} non facturé", code="R6", gravite="Haute",
                ref_abo=str(m["REF_ABONNEMENT"]) if pd.notna(m["REF_ABONNEMENT"]) else None,
                num_demande=str(m["NUM_DEMANDE"]),
                nom_client=m.get("NOM_CLIENT"),
                secteur=m.get("SECTEUR"),
                detail=f"Aucune {type_attendu} émise depuis le {m['DATE_DEMANDE']} (perte de frais)."
            ))
    return anomalies


# =====================================================================
#                           CATÉGORIE C
# =====================================================================
def regle_R5_compteur_partage(egf: pd.DataFrame) -> list[Anomalie]:
    """R5 — Même compteur (> 1000, ≠ 999999) rattaché à ≥ 2 références (HAUTE)."""
    anomalies: list[Anomalie] = []
    if egf.empty:
        return anomalies
    df = egf.copy()
    df["COMPTEUR_NUM"] = pd.to_numeric(df["COMPTEUR"], errors="coerce")
    df = df[(df["COMPTEUR_NUM"] > SEUIL_COMPTEUR_VALIDE) & (df["COMPTEUR_NUM"] != COMPTEUR_PLACEHOLDER)]
    if df.empty:
        return anomalies
    grp = df.groupby("COMPTEUR_NUM")["REFERENCE"].nunique()
    multi = grp[grp >= 2]
    for compteur, n in multi.items():
        sub = df[df["COMPTEUR_NUM"] == compteur]
        refs = sub["REFERENCE"].dropna().unique().tolist()
        nom = sub["NOM"].dropna().iloc[0] if not sub["NOM"].dropna().empty else None
        secteur = sub["SECTEUR"].dropna().iloc[0] if not sub["SECTEUR"].dropna().empty else None
        for ref in refs:
            anomalies.append(Anomalie(
                regle="Compteur sur plusieurs abonnés", code="R5", gravite="Haute",
                ref_abo=str(ref), num_demande=None,
                nom_client=nom, compteur=str(int(compteur)), secteur=secteur,
                detail=f"Compteur {int(compteur)} rattaché à {n} références : {refs}.",
            ))
    return anomalies


# =====================================================================
#                       ORCHESTRATION
# =====================================================================
def executer_audit(mutations: pd.DataFrame, egf: pd.DataFrame) -> AuditResponse:
    """Exécute R1→R6 et agrège stats + anomalies."""
    if mutations is None or mutations.empty:
        mutations = pd.DataFrame(columns=["TYPE_DEMANDE", "VALIDE", "ANNULE", "TYPE_MUTATION",
                                          "REF_ABONNEMENT", "DATE_DEMANDE", "NUM_DEMANDE",
                                          "NOM_CLIENT", "SECTEUR"])
    if egf is None or egf.empty:
        egf = pd.DataFrame(columns=["REFERENCE", "DATE_FACTURE", "TYPE_FACTURE",
                                    "NUM_FACTURE", "V_FACTURE", "INDEX_DEBUT",
                                    "COMPTEUR", "NOM", "SECTEUR"])

    r1 = regle_R1_mutation_non_facturee(mutations, egf)
    r2 = regle_R2_multi_mutations(mutations, egf)
    r3 = regle_R3_conso_nulle_sans_forfait(mutations, egf)
    r4 = regle_R4_index_pose_positif(mutations, egf)
    r5 = regle_R5_compteur_partage(egf)
    r6 = regle_R6_frais_non_factures(mutations, egf)

    anomalies = r1 + r2 + r3 + r4 + r5 + r6

    nb_branch_reab = int(((mutations["TYPE_DEMANDE"].isin(["Nouveau Branchement", "Réabonnement"]))
                          & (mutations["VALIDE"] == "OUI")
                          & (mutations["ANNULE"] != "OUI")).sum())

    stats = AuditStats(
        totalMutations=int(len(mutations)),
        totalSansFacture=len(r1),
        totalDoublons=len(r2),
        totalSansForfait=len(r3),
        nbBranchReabAuditees=nb_branch_reab,
        totalCompteurRecycle=len(r4),
        totalFraisNonFactures=len(r6),
        totalCompteurPartage=len(r5),
        totalAnomalies=len(anomalies),
        critiques=sum(1 for a in anomalies if a.gravite == "Critique"),
        hautes=sum(1 for a in anomalies if a.gravite == "Haute"),
        moyennes=sum(1 for a in anomalies if a.gravite == "Moyenne"),
    )
    return AuditResponse(stats=stats, anomalies=anomalies, resultats=[])
