import { useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  LayoutDashboard, Gauge, Droplet, ShieldAlert, UserCheck, Table2, Upload,
} from 'lucide-react'

import Sidebar from './components/Sidebar.jsx'
import FilterBar from './components/FilterBar.jsx'
import ImportPage from './pages/ImportPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import EtatsPage from './pages/EtatsPage.jsx'
import ConsoPage from './pages/ConsoPage.jsx'
import AnomaliesPage from './pages/AnomaliesPage.jsx'
import ReleveursPage from './pages/ReleveursPage.jsx'
import DataPage from './pages/DataPage.jsx'

import { parseEtat101 } from './lib/parser.js'
import {
  filtrer, secteursDuCentre, abosAvecAnomalie, casCritiques,
} from './lib/analytics.js'

export default function App() {
  const [rawBuffer, setRawBuffer] = useState(null)   // garde le fichier pour re-parser si coef change
  const [fileName, setFileName] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [coefBloque, setCoefBloque] = useState(1.0)

  const [page, setPage] = useState('import')
  const [selectedCentre, setSelectedCentre] = useState('TOUS')
  const [selectedSecteur, setSelectedSecteur] = useState('TOUS')

  // === Parse (réutilisable si coef change) ===
  const runParse = useCallback((buffer, name, coef) => {
    setLoading(true); setError(null)
    setTimeout(() => {
      try {
        const result = parseEtat101(buffer, { coefBloque: coef })
        if (!result.abonnements || result.abonnements.length === 0) {
          setError("Aucun abonnement détecté. Vérifiez qu'il s'agit bien d'un État 101 SNDE.")
          setLoading(false); return
        }
        setData({ ...result, fileName: name })
        setPage('overview')
        setLoading(false)
      } catch (e) {
        console.error(e)
        setError(`Erreur lors de l'analyse : ${e.message}`)
        setLoading(false)
      }
    }, 60)
  }, [])

  const handleFileLoaded = useCallback((buffer, name) => {
    setRawBuffer(buffer); setFileName(name)
    runParse(buffer, name, coefBloque)
  }, [runParse, coefBloque])

  const handleChangeCoef = (coef) => {
    setCoefBloque(coef)
    if (rawBuffer) runParse(rawBuffer, fileName, coef)  // re-parse à chaud
  }

  const handleReset = () => {
    setData(null); setRawBuffer(null); setFileName(null)
    setError(null); setPage('import')
    setSelectedCentre('TOUS'); setSelectedSecteur('TOUS')
  }

  // === Données filtrées (partagées entre pages) ===
  const abosFiltres = useMemo(
    () => data ? filtrer(data.abonnements, selectedCentre, selectedSecteur) : [],
    [data, selectedCentre, selectedSecteur]
  )
  const secteursDispo = useMemo(
    () => data ? secteursDuCentre(data.abonnements, selectedCentre) : [],
    [data, selectedCentre]
  )

  const scope = selectedCentre === 'TOUS'
    ? 'tous centres'
    : selectedSecteur === 'TOUS'
      ? selectedCentre
      : `${selectedCentre} / ${selectedSecteur}`

  // === Export Excel enrichi ===
  const handleExport = (rows, baseName) => {
    if (!rows || rows.length === 0) return
    const ws = XLSX.utils.json_to_sheet(rows.map(normalizeRow))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Export')
    const ts = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `SNDE_${baseName}_${ts}.xlsx`)
  }

  // === Badges sidebar (compteurs d'alerte) ===
  const nbAnomalies = useMemo(() => data ? abosAvecAnomalie(abosFiltres).length : 0, [data, abosFiltres])

  const pages = [
    { id: 'import',    label: 'Importer',          icon: Upload },
    { id: 'overview',  label: "Vue d'ensemble",    icon: LayoutDashboard },
    { id: 'etats',     label: 'États de comptage', icon: Gauge },
    { id: 'conso',     label: 'Consommations',     icon: Droplet },
    { id: 'anomalies', label: 'Anomalies & audit', icon: ShieldAlert, badge: nbAnomalies },
    { id: 'releveurs', label: 'Releveurs',         icon: UserCheck },
    { id: 'data',      label: 'Données',           icon: Table2 },
  ]

  const showFilterBar = data && !['import', 'overview'].includes(page)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        pages={pages}
        active={page}
        onNavigate={setPage}
        onReset={data ? handleReset : null}
        meta={data?.meta}
        dataLoaded={!!data}
      />

      <main className="flex-1 min-w-0">
        <div className="max-w-[1500px] mx-auto px-8 py-6 space-y-6">
          {/* En-tête générique de page */}
          {data && page !== 'import' && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-slate-400">
                <span className="font-mono">{data.fileName}</span>
                {data.meta.coefBloque !== 1 && (
                  <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                    coef bloqué = {data.meta.coefBloque}
                  </span>
                )}
              </div>
            </div>
          )}

          {showFilterBar && (
            <FilterBar
              meta={data.meta}
              abonnements={data.abonnements}
              selectedCentre={selectedCentre}
              selectedSecteur={selectedSecteur}
              onChangeCentre={(c) => { setSelectedCentre(c); setSelectedSecteur('TOUS') }}
              onChangeSecteur={setSelectedSecteur}
              secteursDisponibles={secteursDispo}
              nbResultats={abosFiltres.length}
            />
          )}

          {/* Pages */}
          {page === 'import' && (
            <ImportPage
              onFileLoaded={handleFileLoaded}
              loading={loading}
              error={error}
              coefBloque={coefBloque}
              onChangeCoef={handleChangeCoef}
            />
          )}

          {data && page === 'overview' && (
            <OverviewPage
              abonnements={data.abonnements}
              meta={data.meta}
              onExport={handleExport}
              onDrillCentre={(c) => { setSelectedCentre(c); setSelectedSecteur('TOUS'); setPage('etats') }}
            />
          )}

          {data && page === 'etats'     && <EtatsPage     abos={abosFiltres} scope={scope} onExport={handleExport} />}
          {data && page === 'conso'     && <ConsoPage     abos={abosFiltres} scope={scope} onExport={handleExport} />}
          {data && page === 'anomalies' && <AnomaliesPage abos={abosFiltres} scope={scope} onExport={handleExport} />}
          {data && page === 'releveurs' && <ReleveursPage abos={abosFiltres} scope={scope} onExport={handleExport} />}
          {data && page === 'data'      && <DataPage      abos={abosFiltres} scope={scope} onExport={handleExport} />}
        </div>
      </main>
    </div>
  )
}

/* Normalise une ligne d'export (sélectionne / met en forme les colonnes utiles) */
function normalizeRow(r) {
  // Si c'est un abonnement complet
  if (r.refAbo !== undefined) {
    return {
      Centre: r.centre, Secteur: r.secteur,
      'Réf Abo': r.refAbo, 'Anc Réf': r.ancRef, 'N° Compteur': r.numCompteur,
      'Ancien Index': r.ancienIndex, 'Nouvel Index': r.nouvelIndex,
      'Diff Index': r.diffIndex, 'Conso retenue': r.consoRetenue,
      'Conso déclarée': r.consoDeclaree, 'Conso moyenne': r.consMoyenne,
      'Type conso': r.typeConso, 'État comptage': r.etatComptage,
      Tarif: r.tarif, Matricule: r.matricule,
      'Carte non retournée': r.carteNonRetournee, Coupée: r.coupee,
      Anomalies: (r.flags || []).join(' | '),
      Mois: r.mois, Année: r.annee,
    }
  }
  // Sinon, ligne d'agrégat déjà mise en forme : on la renvoie telle quelle
  return r
}
