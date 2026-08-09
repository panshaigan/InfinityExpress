import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

const GAP_PX = 6
const EDGE_PAD = 8

type Placement = 'above' | 'below'

/**
 * Portal tip that escapes overflow clipping. Parent must have `.has-icon-tip`.
 * Shows on host hover / focus-visible (same as CSS icon-tip).
 */
export function IconTip({ children }: { children: ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const hostRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>('above')
  const [style, setStyle] = useState<CSSProperties>({
    top: 0,
    left: 0,
  })

  const position = useCallback(() => {
    const host = hostRef.current
    const tip = tipRef.current
    if (!host || !tip) return

    const hostRect = host.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const spaceAbove = hostRect.top
    const nextPlacement: Placement =
      spaceAbove < tipRect.height + GAP_PX + EDGE_PAD ? 'below' : 'above'

    let left = hostRect.left + hostRect.width / 2
    const half = tipRect.width / 2
    left = Math.min(
      window.innerWidth - EDGE_PAD - half,
      Math.max(EDGE_PAD + half, left),
    )

    const top =
      nextPlacement === 'below'
        ? hostRect.bottom + GAP_PX
        : hostRect.top - GAP_PX - tipRect.height

    setPlacement(nextPlacement)
    setStyle({ top, left })
  }, [])

  useEffect(() => {
    const anchor = anchorRef.current
    const host = anchor?.closest('.has-icon-tip') as HTMLElement | null
    hostRef.current = host
    if (!host) return

    function show() {
      setOpen(true)
    }
    function hide() {
      setOpen(false)
    }
    function onFocusIn() {
      if (host!.matches(':focus-visible') || host!.querySelector(':focus-visible')) {
        show()
      }
    }

    host.addEventListener('mouseenter', show)
    host.addEventListener('mouseleave', hide)
    host.addEventListener('focusin', onFocusIn)
    host.addEventListener('focusout', hide)
    return () => {
      host.removeEventListener('mouseenter', show)
      host.removeEventListener('mouseleave', hide)
      host.removeEventListener('focusin', onFocusIn)
      host.removeEventListener('focusout', hide)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    position()
  }, [open, children, position])

  useEffect(() => {
    if (!open) return
    function onReposition() {
      position()
    }
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, position])

  return (
    <>
      <span ref={anchorRef} className="icon-tip-anchor" aria-hidden="true" />
      {open
        ? createPortal(
            <span
              ref={tipRef}
              className={`icon-tip icon-tip-portal${
                placement === 'below' ? ' icon-tip-below' : ''
              } icon-tip-visible`}
              role="tooltip"
              style={style}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </>
  )
}
