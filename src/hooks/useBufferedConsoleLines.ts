import { useCallback, useEffect, useRef, useState } from 'react'
import { trimConsoleLines } from '../lib/install/consoleLimits'

/** Bound pending output as well as rendered output; publish at most ten times/sec. */
export function useBufferedConsoleLines() {
  const [lines, setLines] = useState<string[]>([])
  const pending = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    pending.current = []
  }, [])
  useEffect(() => cancel, [cancel])

  const replace = useCallback((next: string[]) => {
    cancel()
    setLines(trimConsoleLines(next))
  }, [cancel])

  const append = useCallback((next: string[]) => {
    if (next.length === 0) return
    pending.current = trimConsoleLines([...pending.current, ...next])
    if (timer.current !== null) return
    timer.current = setTimeout(() => {
      timer.current = null
      const batch = pending.current
      pending.current = []
      setLines((prev) => trimConsoleLines([...prev, ...batch]))
    }, 100)
  }, [])

  return [lines, replace, append] as const
}
