import { useEffect } from 'react'

/** Clear `value` via `clear` after `ms` when value is truthy. */
export function useAutoDismiss(
  value: unknown,
  clear: () => void,
  ms = 4500,
): void {
  useEffect(() => {
    if (!value) return
    const id = window.setTimeout(clear, ms)
    return () => window.clearTimeout(id)
  }, [value, clear, ms])
}
