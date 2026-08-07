import { useCallback, useState, type UIEvent } from 'react'

/** Tracks whether a scroll container has moved past a small threshold. */
export function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false)

  const onScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const next = e.currentTarget.scrollTop > threshold
      setScrolled((prev) => (prev === next ? prev : next))
    },
    [threshold],
  )

  const reset = useCallback(() => setScrolled(false), [])

  return { scrolled, onScroll, reset }
}
