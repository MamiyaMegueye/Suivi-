"""Tests unitaires du moteur de règles R1→R6 sur jeu de données fictif."""
import pandas as pd
from datetime import date

from app.services.rules_engine import (
    regle_R1_mutation_non_facturee,
    regle_R2_multi_mutations,
    regle_R3_conso_nulle_sans_forfait,
    regle_R4_index_pose_positif,
    regle_R5_compteur_partage,
    regle_R6_frais_non_factures,
    executer_audit,
)


def _mut(num, type_dem, type_mut, ref, dt, valide="OUI", annule="NON"):
    return {
        "NUM_DEMANDE": num, "TYPE_DEMANDE": type_dem, "TYPE_MUTATION": type_mut,
        "REF_ABONNEMENT": ref, "DATE_DEMANDE": dt,
        "VALIDE": valide, "ANNULE": annule,
        "NOM_CLIENT": "TEST CLIENT", "SECTEUR": "01",
    }


def _fact(num, ref, dt, type_f, vfact=1000, idx_deb=0, compteur=2000):
    return {
        "NUM_FACTURE": num, "REFERENCE": ref, "DATE_FACTURE": dt,
        "TYPE_FACTURE": type_f, "V_FACTURE": vfact,
        "INDEX_DEBUT": idx_deb, "COMPTEUR": compteur,
        "NOM": "X", "SECTEUR": "01",
    }


def test_R1_mutation_non_facturee():
    mutations = pd.DataFrame([_mut("D1", "Mutation", "- Compteur", 100, date(2026, 1, 1))])
    egf = pd.DataFrame([_fact("F1", 100, date(2026, 1, 10), "Facture Relevée")])
    res = regle_R1_mutation_non_facturee(mutations, egf)
    assert len(res) == 1 and res[0].code == "R1"


def test_R2_multi_mutations():
    mutations = pd.DataFrame([_mut("D1", "Mutation", "- Compteur", 100, date(2026, 1, 1))])
    egf = pd.DataFrame([
        _fact("F1", 100, date(2026, 1, 5),  "Facture Mutation"),
        _fact("F2", 100, date(2026, 1, 20), "Facture Mutation"),
    ])
    res = regle_R2_multi_mutations(mutations, egf)
    assert len(res) == 1 and res[0].code == "R2"


def test_R3_conso_nulle_sans_forfait():
    mutations = pd.DataFrame([_mut("D1", "Mutation", "- Compteur", 100, date(2026, 1, 1))])
    egf = pd.DataFrame([
        _fact("F0", 100, date(2025, 12, 15), "Facture Relevée"),
        _fact("F1", 100, date(2026, 1, 10),  "Facture Mutation", vfact=0),
    ])
    res = regle_R3_conso_nulle_sans_forfait(mutations, egf)
    assert len(res) == 1 and res[0].gravite == "Critique"


def test_R4_index_pose_positif():
    mutations = pd.DataFrame([_mut("D1", "Nouveau Branchement", None, 200, date(2026, 1, 1))])
    egf = pd.DataFrame([_fact("F1", 200, date(2026, 1, 15), "Facture Relevée", idx_deb=42)])
    res = regle_R4_index_pose_positif(mutations, egf)
    assert len(res) == 1 and res[0].code == "R4"


def test_R5_compteur_partage():
    egf = pd.DataFrame([
        _fact("F1", 100, date(2026, 1, 1), "Facture Relevée", compteur=2384),
        _fact("F2", 200, date(2026, 1, 2), "Facture Relevée", compteur=2384),
    ])
    res = regle_R5_compteur_partage(egf)
    assert len(res) == 2 and all(a.code == "R5" for a in res)


def test_R5_ignore_placeholder():
    egf = pd.DataFrame([
        _fact("F1", 100, date(2026, 1, 1), "Facture Relevée", compteur=999999),
        _fact("F2", 200, date(2026, 1, 2), "Facture Relevée", compteur=999999),
        _fact("F3", 300, date(2026, 1, 3), "Facture Relevée", compteur=500),  # < 1000
    ])
    assert regle_R5_compteur_partage(egf) == []


def test_R6_frais_non_factures():
    mutations = pd.DataFrame([
        _mut("D1", "Nouveau Branchement", None, 300, date(2026, 1, 1)),
        _mut("D2", "Réabonnement",        None, 400, date(2026, 1, 1)),
    ])
    egf = pd.DataFrame([
        _fact("F1", 300, date(2026, 1, 10), "Facture Relevée"),     # ❌ pas Nv Abonnement
        _fact("F2", 400, date(2026, 1, 10), "Facture Réabonnement"),  # ✅ ok
    ])
    res = regle_R6_frais_non_factures(mutations, egf)
    assert len(res) == 1 and res[0].ref_abo == "300"


def test_orchestration_executer_audit():
    mutations = pd.DataFrame([_mut("D1", "Mutation", "- Compteur", 100, date(2026, 1, 1))])
    egf = pd.DataFrame([_fact("F1", 100, date(2026, 1, 10), "Facture Relevée")])
    rep = executer_audit(mutations, egf)
    assert rep.stats.totalAnomalies >= 1
    assert rep.stats.totalSansFacture == 1
