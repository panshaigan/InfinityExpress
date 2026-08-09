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
export type IconTipAlign = 'center' | 'end'
export type IconTipVariant = 'icon' | 'level-card'

/**
 * Portal tip that escapes overflow clipping. Parent must have `.has-icon-tip`
 * (or `.has-tip` for level-card). Shows on host hover / focus-visible.
 */
export function IconTip({
  children,
  align = 'center',
  variant = 'icon',
  hostSelector = '.has-icon-tip',
}: {
  children: ReactNode
  align?: IconTipAlign
  variant?: IconTipVariant
  /** Closest ancestor that owns hover/focus for showing the tip. */
  hostSelector?: string
}) {
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

    let left: number
    if (align === 'end') {
      // Pin tip's right edge near the host's right edge (tip grows leftward).
      left = hostRect.right
      left = Math.min(
        window.innerWidth - EDGE_PAD,
        Math.max(EDGE_PAD + tipRect.width, left),
      )
    } else {
      left = hostRect.left + hostRect.width / 2
      const half = tipRect.width / 2
      left = Math.min(
        window.innerWidth - EDGE_PAD - half,
        Math.max(EDGE_PAD + half, left),
      )
    }

    const top =
      nextPlacement === 'below'
        ? hostRect.bottom + GAP_PX
        : hostRect.top - GAP_PX - tipRect.height

    setPlacement(nextPlacement)
    setStyle({ top, left })
  }, [align])

  useEffect(() => {
    const anchor = anchorRef.current
    const host = anchor?.closest(hostSelector) as HTMLElement | null
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
  }, [hostSelector])

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

  const tipClass =
    variant === 'level-card'
      ? `level-card-tip level-card-tip-portal${
          placement === 'below' ? ' level-card-tip-below' : ''
        }${align === 'end' ? ' level-card-tip-align-end' : ''} level-card-tip-visible`
      : `icon-tip icon-tip-portal${
          placement === 'below' ? ' icon-tip-below' : ''
        }${align === 'end' ? ' icon-tip-align-end' : ''} icon-tip-visible`

  return (
    <>
      <span ref={anchorRef} className="icon-tip-anchor" aria-hidden="true" />
      {open
        ? createPortal(
            <span
              ref={tipRef}
              className={tipClass}
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
