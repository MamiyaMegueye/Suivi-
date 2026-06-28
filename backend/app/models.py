"""Schémas Pydantic exposés par l'API."""
from datetime import date
from typing import Any
from pydantic import BaseModel, Field


class Centre(BaseModel):
    code: int
    nom: str


class Mutation(BaseModel):
    num_demande: str | None = None
    ref_abonnement: int | None = None
    code_client: int | None = None
    nom_client: str | None = None
    type_demande: str | None = None
    type_mutation: str | None = None
    date_demande: date | None = None
    valide: str | None = None
    annule: str | None = None
    code_centre: int | None = None
    nom_centre: str | None = None
    secteur: str | None = None
    adresse: str | None = None
    cree_par: str | None = None


class Facture(BaseModel):
    centre: str | None = None
    code_centre: int | None = None
    secteur: str | None = None
    num_facture: str | None = None
    reference: int | None = None
    anc_reference: int | None = None
    nom: str | None = None
    tarif: str | None = None
    tournee: str | None = None
    compteur: int | None = None
    reference_compteur: str | None = None
    date_facture: date | None = None
    type_facture: str | None = None
    date_debut: date | None = None
    date_fin: date | None = None
    index_debut: float | None = None
    index_fin: float | None = None
    consommation: float | None = None
    v_facture: float | None = None
    montant: float | None = None
    arrieres: float | None = None
    solde: float | None = None
    adresse: str | None = None
    type_comptage: str | None = None


class Anomalie(BaseModel):
    regle: str
    code: str
    gravite: str  # Critique / Haute / Moyenne
    ref_abo: str | None = None
    num_demande: str | None = None
    nom_client: str | None = None
    compteur: str | None = None
    secteur: str | None = None
    detail: str


class AuditStats(BaseModel):
    totalMutations: int = 0
    totalSansFacture: int = 0
    totalDoublons: int = 0
    totalSansForfait: int = 0
    nbBranchReabAuditees: int = 0
    totalCompteurRecycle: int = 0
    totalFraisNonFactures: int = 0
    totalCompteurPartage: int = 0
    totalAnomalies: int = 0
    critiques: int = 0
    hautes: int = 0
    moyennes: int = 0


class AuditResponse(BaseModel):
    stats: AuditStats
    anomalies: list[Anomalie]
    resultats: list[dict[str, Any]] = Field(default_factory=list)
