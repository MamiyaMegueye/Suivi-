// src/components/Toast.jsx
// 🆕 v5.0 — Composant Toast élémentaire (affiché par ToastContainer)

import { X, CheckCircle2, Info, AlertTriangle, Bell } from 'lucide-react'

const KIND_STYLE = {
  info:    { bg: 'bg-white border-slate-200',   text: 'text-slate-800',   icon: Info,           iconColor: 'text-slate-500' },
  success: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', icon: CheckCircle2, iconColor: 'text-emerald-600' },
  warn:    { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800',  icon: AlertTriangle,  iconColor: 'text-amber-600' },
  alert:   { bg: 'bg-red-50 border-red-300',    text: 'text-red-800',    icon: Bell,           iconColor: 'text-red-600' },
}

export default function Toast({ toast, onDismiss }) {
  const style = KIND_STYLE[toast.kind] || KIND_STYLE.info
  const Icon = style.icon

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 ${style.bg} border rounded-xl shadow-lg px-4 py-3 min-w-[280px] max-w-[420px]`}
    >
      <Icon size={18} className={`${style.iconColor} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className={`text-sm font-semibold ${style.text}`}>{toast.title}</p>
        )}
        {toast.message && (
          <p className={`text-xs mt-0.5 ${style.text} opacity-80`}>{toast.message}</p>
        )}
        {toast.action && (
          <button
            onClick={() => {
              try { toast.action.onClick() } catch (e) { console.warn(e) }
              onDismiss(toast.id)
            }}
            className={`mt-2 text-xs font-medium underline ${style.text} hover:opacity-70`}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className={`${style.text} opacity-50 hover:opacity-100 flex-shrink-0`}
        aria-label="Fermer"
      >
        <X size={16} />
      </button>
    </div>
  )
}