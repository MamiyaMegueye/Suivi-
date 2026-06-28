-- =====================================================================
-- V_ETAT_FACTURES_GLOBAL (EGF)
-- Version réduite aux colonnes utilisées par les règles d'audit R1→R6.
-- Pour la version 59 colonnes complète, voir le fichier de spec EGF.
-- =====================================================================
CREATE OR REPLACE VIEW V_ETAT_FACTURES_GLOBAL AS
SELECT
    str.STR_LIB_LT                                                 AS CENTRE,
    str.STR_CODE                                                   AS CODE_CENTRE,
    s.SECT_CODE                                                    AS SECTEUR,
    fm.FACT_NUM                                                    AS NUM_FACTURE,
    abn.ABN_ID                                                     AS REFERENCE,
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
FROM       CRM_SNDE.S_FACTURE_M       fm
LEFT JOIN  CRM_SNDE.S_STRUCTURE       str ON str.STR_ID  = fm.STR_ID
LEFT JOIN  CRM_SNDE.S_ABONNEMENT      abn ON abn.ABN_ID  = fm.ABN_ID
LEFT JOIN  CRM_SNDE.S_CLIENT          cli ON cli.CLT_ID  = fm.CLT_ID
LEFT JOIN  CRM_SNDE.S_RELEVE          rel ON rel.REL_ID  = fm.REL_ID
LEFT JOIN  CRM_SNDE.S_COMPTEUR_INS    cpt ON cpt.CPI_REF = rel.CPT_REF
LEFT JOIN  CRM_SNDE.S_SECTEUR         s   ON s.SECT_ID   = fm.SECT_ID
LEFT JOIN  CRM_SNDE.S_TOURNEE         t   ON t.TOUR_ID   = fm.TOUR_ID
WHERE  str.ZONE_ID = 2
  AND  fm.REL_ID IS NOT NULL;
