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
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import { playSystemSound } from '../../lib/desktop/systemSound'
import { ToastHost, type ToastItem, type ToastTone } from './ToastHost'

interface ToastContextValue {
  pushToast: (toast: { tone: ToastTone; message: string }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function documentLooksFocused(): boolean {
  return typeof document !== 'undefined' && !document.hidden
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const focusedRef = useRef(documentLooksFocused())

  useEffect(() => {
    function syncVisibility() {
      if (document.hidden) focusedRef.current = false
      else if (!isDesktopApp()) focusedRef.current = true
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)

    let unlisten: (() => void) | undefined
    if (isDesktopApp()) {
      void getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          focusedRef.current = focused
        })
        .then((fn) => {
          unlisten = fn
        })
        .catch(() => {
          // Focus events optional — visibilitychange still applies.
        })
    }

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      unlisten?.()
    }
  }, [])

  const pushToast = useCallback((toast: { tone: ToastTone; message: string }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, tone: toast.tone, message: toast.message }])
    if (!focusedRef.current) {
      void playSystemSound(toast.tone)
    }
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
