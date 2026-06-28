// src/components/ToastContainer.jsx
// 🆕 v5.0 — Conteneur fixe en bas à droite pour afficher tous les toasts actifs.
//          Branché une seule fois dans App.jsx.

import Toast from './Toast.jsx'
import { useToasts } from '../lib/realtime'

export default function ToastContainer() {
  const { toasts, dismiss } = useToasts()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  )
}