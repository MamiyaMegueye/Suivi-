// src/components/ColumnFilter.jsx
// 🆕 v5.7.3 — Filtre style Excel sur en-tête de colonne
//
// Clic sur l'icône → popover avec :
//   - barre de recherche
//   - "Tout cocher" / "Tout décocher"
//   - liste de cases à cocher (une par valeur distincte)
//
// Props :
//   - values   : string[]                — valeurs distinctes triées
//   - selected : Set<string> | null      — valeurs cochées (null = tout coché)
//   - onChange : (newSet|null) => void   — null si tout coché (= pas de filtre)

import { useState, useRef, useEffect, useMemo } from 'react'
import { Filter, FilterX, Search } from 'lucide-react'

export default function ColumnFilter({ values, selected, onChange }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  // Fermer au clic extérieur
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isFiltered = selected !== null && selected.size !== values.length

  const filteredValues = useMemo(() => {
    if (!search) return values
    const q = search.toLowerCase()
    return values.filter(v => String(v).toLowerCase().includes(q))
  }, [values, search])

  const effectiveSelected = selected || new Set(values)

  const toggle = (v) => {
    const next = new Set(effectiveSelected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next.size === values.length ? null : next)
  }

  const selectAll = () => onChange(null)
  const clearAll = () => onChange(new Set())

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className={`ml-1 p-0.5 rounded hover:bg-gray-200 transition-colors align-middle ${
          isFiltered ? 'text-indigo-600' : 'text-gray-400'
        }`}
        title="Filtrer cette colonne"
      >
        {isFiltered ? <FilterX size={12} /> : <Filter size={12} />}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-64 normal-case tracking-normal font-normal">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-100 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-indigo-600 hover:underline"
            >
              Tout cocher
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-indigo-600 hover:underline"
            >
              Tout décocher
            </button>
            <span className="ml-auto text-gray-400">
              {effectiveSelected.size}/{values.length}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filteredValues.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">Aucun résultat</div>
            ) : (
              filteredValues.map(v => {
                const checked = effectiveSelected.has(v)
                return (
                  <label
                    key={v}
                    className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(v)}
                      className="rounded"
                    />
                    <span className="text-gray-700">{v || '(vide)'}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </span>
  )
}