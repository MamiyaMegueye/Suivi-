import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, AlertCircle, Settings2 } from 'lucide-react'

/**
 * Page d'import — case d'import compacte + paramètre coefficient bloqué.
 */
export default function ImportPage({ onFileLoaded, loading, error, coefBloque, onChangeCoef }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState(null)

  const handleFile = (file) => {
    setLocalError(null)
    if (!file) return
    if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) {
      setLocalError('Format non supporté. Utilisez un fichier .xls, .xlsx ou .xlsm.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => onFileLoaded(e.target.result, file.name)
    reader.onerror = () => setLocalError('Impossible de lire le fichier.')
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Importer une carte de relève</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Déposez le fichier Excel — l'analyse se lance automatiquement 
        </p>
      </div>

      {/* ===== Case d'import COMPACTE ===== */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
        className={`
          cursor-pointer border-2 border-dashed rounded-xl px-6 py-6
          flex items-center gap-4 transition-all
          ${dragOver
            ? 'border-snde-600 bg-snde-50'
            : 'border-slate-300 bg-white hover:border-snde-400 hover:bg-snde-50/40'}
        `}
      >
        <div className={`p-3 rounded-lg flex-shrink-0 ${dragOver ? 'bg-snde-600 text-white' : 'bg-snde-100 text-snde-700'}`}>
          <UploadCloud size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800">Glissez votre fichier ici ou cliquez pour parcourir</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Formats : <span className="font-mono">.xls .xlsx .xlsm</span> · plusieurs centres &amp; secteurs supportés
          </p>
        </div>
        <FileSpreadsheet size={20} className="text-slate-300 flex-shrink-0" />
        <input ref={inputRef} type="file" accept=".xls,.xlsx,.xlsm" className="hidden"
               onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      
      {loading && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 text-snde-700">
            <div className="w-5 h-5 border-2 border-snde-600 border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">Analyse du fichier en cours…</span>
          </div>
        </div>
      )}

      {/* Aide */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { t: 'Vue d\'ensemble', d: 'Priorisation des centres et secteurs par score de qualité.' },
          { t: 'États & consommations', d: 'Répartition par état de comptage, consos faibles, volumes estimés.' },
          { t: 'Anomalies & audit', d: 'Index figés, fantômes, doublons, tarifs inadaptés — listes exportables.' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 text-sm">{s.t}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
