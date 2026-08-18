import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readDeveloperMode, writeDeveloperMode } from '../lib/ui/developerMode'

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

interface DeveloperModeContextValue {
  developerMode: boolean
  brandBurst: boolean
  toggleDeveloperMode: () => boolean
  clearBrandBurst: () => void
}

const DeveloperModeContext = createContext<DeveloperModeContextValue | null>(
  null,
)

export function DeveloperModeProvider({ children }: { children: ReactNode }) {
  const [developerMode, setDeveloperMode] = useState(readDeveloperMode)
  const [brandBurst, setBrandBurst] = useState(false)

  const toggleDeveloperMode = useCallback(() => {
    const next = !developerMode
    writeDeveloperMode(next)
    setDeveloperMode(next)
    setBrandBurst(next && !prefersReducedMotion())
    return next
  }, [developerMode])

  const clearBrandBurst = useCallback(() => setBrandBurst(false), [])

  const value = useMemo(
    () => ({
      developerMode,
      brandBurst,
      toggleDeveloperMode,
      clearBrandBurst,
    }),
    [brandBurst, clearBrandBurst, developerMode, toggleDeveloperMode],
  )

  return (
    <DeveloperModeContext.Provider value={value}>
      {children}
    </DeveloperModeContext.Provider>
  )
}

export function useDeveloperMode(): DeveloperModeContextValue {
  const ctx = useContext(DeveloperModeContext)
  if (!ctx) {
    throw new Error('useDeveloperMode must be used within DeveloperModeProvider')
  }
  return ctx
}
