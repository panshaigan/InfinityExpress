import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export interface HubCardMenuItem {
  id: string
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name for the trigger and menu (e.g. project or game label). */
  label: string
  items: HubCardMenuItem[]
  /** Optional class on the root wrapper (defaults to project-hub-card-menu). */
  className?: string
}

export function HubCardMenu({
  open,
  onOpenChange,
  label,
  items,
  className = 'project-hub-card-menu',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuStyle({
      top: rect.bottom + 5,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onOpenChange(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={triggerRef}
        type="button"
        className={`project-hub-menu-trigger${open ? ' open' : ''}`}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="project-hub-menu project-hub-menu-portal"
              role="menu"
              aria-label={`Actions for ${label}`}
              style={menuStyle}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`project-hub-menu-item${item.danger ? ' danger' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return
                    onOpenChange(false)
                    item.onSelect()
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
