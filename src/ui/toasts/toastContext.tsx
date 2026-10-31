import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { cancelPendingNotificationSound, requestNotificationSound, unlockNotificationAudio } from '../../lib/ui/notificationSound'
import { ToastHost, type ToastItem, type ToastTone } from './ToastHost'

interface ToastContextValue {
  pushToast: (toast: { tone: ToastTone; message: string; sound?: boolean }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    window.addEventListener('pointerdown', unlockNotificationAudio, true)
    window.addEventListener('keydown', unlockNotificationAudio, true)
    return () => {
      window.removeEventListener('pointerdown', unlockNotificationAudio, true)
      window.removeEventListener('keydown', unlockNotificationAudio, true)
      cancelPendingNotificationSound()
    }
  }, [])

  const pushToast = useCallback((toast: { tone: ToastTone; message: string; sound?: boolean }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, tone: toast.tone, message: toast.message }])
    if (toast.sound) requestNotificationSound(toast.tone)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
