import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Backdrop dismiss that ignores drag-select ending outside the panel.
 * Only closes when both pointerdown and click target the backdrop itself.
 */
export function useBackdropDismiss(onClose: (() => void) | undefined) {
  const startedOnBackdrop = useRef(false)

  return {
    onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      startedOnBackdrop.current = e.target === e.currentTarget
    },
    onClick(e: ReactMouseEvent<HTMLDivElement>) {
      if (!onClose) return
      if (e.target !== e.currentTarget) return
      if (!startedOnBackdrop.current) return
      onClose()
    },
  }
}
