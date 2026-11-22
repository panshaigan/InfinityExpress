import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getTaskbarWindow, setTaskbarBadge } from '../../lib/desktop/taskbarBadge'
import { cancelPendingNotificationSound, requestNotificationSound, unlockNotificationAudio } from '../../lib/ui/notificationSound'
import { ToastHost, type ToastItem, type ToastTone } from './ToastHost'

interface ToastContextValue {
  pushToast: (toast: { tone: ToastTone; message: string; sound?: boolean }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const desktopFocused = useRef<boolean>()
  const hasUnreadToast = toasts.some((toast) => toast.waitForFocus)

  useEffect(() => {
    const appWindow = getTaskbarWindow()
    if (!appWindow) return

    let disposed = false
    let unlisten: (() => void) | undefined
    const updateFocus = (focused: boolean) => {
      desktopFocused.current = focused
      if (focused) {
        setToasts((current) => current.some((toast) => toast.waitForFocus)
          ? current.map((toast) => toast.waitForFocus ? { ...toast, waitForFocus: false } : toast)
          : current)
      }
    }
    void appWindow.onFocusChanged(({ payload }) => {
      if (!disposed) updateFocus(payload)
    }).then(async (stop) => {
      if (disposed) return stop()
      unlisten = stop
      if (desktopFocused.current !== undefined) return
      const focused = await appWindow.isFocused()
      if (!disposed && desktopFocused.current === undefined) updateFocus(focused)
    }).catch((error: unknown) => {
      console.warn('Could not watch for taskbar badge dismissal:', error)
    })
    return () => {
      disposed = true
      desktopFocused.current = undefined
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!hasUnreadToast) return
    setTaskbarBadge(true)
    return () => setTaskbarBadge(false)
  }, [hasUnreadToast])

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
    const waitForFocus = Boolean(toast.sound && getTaskbarWindow() &&
      !(desktopFocused.current ?? document.hasFocus()))
    setToasts((prev) => [...prev, { id, tone: toast.tone, message: toast.message, waitForFocus }])
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
