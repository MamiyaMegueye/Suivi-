-- =====================================================================
-- V_ETAT_MUTATION
-- Reproduit l'export Excel "statMutationExcel" (état des demandes de mutation).
-- À créer dans le schéma applicatif (PAS dans CRM_SNDE).
--
-- ⚠️ TODO restants (cf. README §Mappings à valider) :
--   - CLIENT       : DMD_NOM utilisé (à comparer avec Excel d'origine)
--   - CREE_PAR     : AGENT_SNDE utilisé (à comparer ; sinon UTIL_TRAC)
--   - VALIDE       : DMD_FLAG_CLOT utilisé (à comparer ; sinon DMD_FLAG_VLD)
--   - REF_ABONNEMENT + CODE_CLIENT : ABN_ANC vide ~95%, jointure S_ABONNEMENT à finaliser
-- =====================================================================
CREATE OR REPLACE VIEW V_ETAT_MUTATION AS
SELECT
    TO_CHAR(d.DMD_ID)                                              AS NUM_DEMANDE,
    d.ABN_ANC                                                      AS REF_ABONNEMENT,
    NULL                                                           AS CODE_CLIENT,
    d.DMD_NOM                                                      AS NOM_CLIENT,
    td.TYPD_LIB_LT                                                 AS TYPE_DEMANDE,
    d.MSG_MUTATION                                                 AS TYPE_MUTATION,
    d.DMD_DATE                                                     AS DATE_DEMANDE,
    CASE WHEN d.DMD_FLAG_CLOT = 1 THEN 'OUI' ELSE 'NON' END        AS VALIDE,
    CASE WHEN d.FLAG_ANNUL    = 1 THEN 'OUI' ELSE 'NON' END        AS ANNULE,
    str.STR_CODE                                                   AS CODE_CENTRE,
    str.STR_LIB_LT                                                 AS NOM_CENTRE,
    s.SECT_CODE                                                    AS SECTEUR,
    d.DMD_ADRESSE                                                  AS ADRESSE,
    TO_CHAR(d.AGENT_SNDE)                                          AS CREE_PAR
FROM       CRM_SNDE.S_DEMANDE        d
LEFT JOIN  CRM_SNDE.S_STRUCTURE      str ON str.STR_ID  = d.STR_ID
LEFT JOIN  CRM_SNDE.S_TYPE_DEMANDE   td  ON td.TYPD_ID  = d.TYPD_ID
LEFT JOIN  CRM_SNDE.S_SECTEUR        s   ON s.SECT_ID   = d.SECT_ID
WHERE  str.ZONE_ID = 2                       -- Nouakchott
  AND  str.STR_ID NOT IN (1, 2, 63);         -- exclure zones parentes
