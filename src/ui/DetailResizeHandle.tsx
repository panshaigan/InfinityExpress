import { useEffect, useRef } from 'react'
import {
  clampDetailWidth,
  writeDetailWidth,
  DETAIL_WIDTH_MIN,
  DETAIL_WIDTH_MAX,
} from '../lib/ui/detailPanePrefs'

interface Props {
  width: number
  onWidthChange: (width: number) => void
  disabled?: boolean
}

/** Drag handle between list and detail panes. */
export function DetailResizeHandle({ width, onWidthChange, disabled }: Props) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      const delta = drag.startX - e.clientX
      onWidthChange(clampDetailWidth(drag.startWidth + delta))
    }
    function onUp() {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.classList.remove('is-resizing-detail')
      writeDetailWidth(widthRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onWidthChange])

  if (disabled) return null

  return (
    <div
      className="detail-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={DETAIL_WIDTH_MIN}
      aria-valuemax={DETAIL_WIDTH_MAX}
      aria-valuenow={width}
      aria-label="Resize details pane"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        dragRef.current = { startX: e.clientX, startWidth: width }
        document.body.classList.add('is-resizing-detail')
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 24 : 12
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const next = clampDetailWidth(width + step)
          onWidthChange(next)
          writeDetailWidth(next)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          const next = clampDetailWidth(width - step)
          onWidthChange(next)
          writeDetailWidth(next)
        } else if (e.key === 'Home') {
          e.preventDefault()
          onWidthChange(DETAIL_WIDTH_MAX)
          writeDetailWidth(DETAIL_WIDTH_MAX)
        } else if (e.key === 'End') {
          e.preventDefault()
          onWidthChange(DETAIL_WIDTH_MIN)
          writeDetailWidth(DETAIL_WIDTH_MIN)
        }
      }}
    />
  )
}
