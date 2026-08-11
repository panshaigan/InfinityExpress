import { useEffect } from 'react'

export type ToastTone = 'success' | 'error'

export interface ToastItem {
  id: string
  tone: ToastTone
  message: string
}

interface Props {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
  dismissMs?: number
}

function ToastCard({
  toast,
  onDismiss,
  dismissMs,
}: {
  toast: ToastItem
  onDismiss: (id: string) => void
  dismissMs: number
}) {
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(toast.id), dismissMs)
    return () => window.clearTimeout(id)
  }, [toast.id, onDismiss, dismissMs])

  return (
    <div
      className={`app-toast tone-${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <p className="app-toast-message">{toast.message}</p>
      <button
        type="button"
        className="app-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}

export function ToastHost({ toasts, onDismiss, dismissMs = 4500 }: Props) {
  if (toasts.length === 0) return null

  return (
    <div className="app-toast-host" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          dismissMs={dismissMs}
        />
      ))}
    </div>
  )
}
