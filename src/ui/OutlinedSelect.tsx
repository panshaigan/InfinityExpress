import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { cycleTabIndex } from '../lib/ui/chromeHotkeys'

export interface OutlinedSelectOption {
  value: string
  label: string
}

interface Props {
  label: string
  value: string
  options: OutlinedSelectOption[]
  /** Shown when value is empty. Defaults to "All". */
  emptyLabel?: string
  disabled?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
  /** Extra class on the root (e.g. full-width in forms). */
  className?: string
}

const GAP_PX = 6
const EDGE_PAD = 8

export function OutlinedSelect({
  label,
  value,
  options,
  emptyLabel = 'All',
  disabled = false,
  open,
  onOpenChange,
  onChange,
  className = '',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const values = options.map((o) => o.value)
  const valuesSignature = values.join('\0')
  const selected = options.find((o) => o.value === value)
  const displayLabel = selected?.label ?? emptyLabel
  const [highlight, setHighlight] = useState(value)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({
    top: 0,
    left: 0,
    width: 0,
  })

  const positionPopover = useCallback(() => {
    const root = rootRef.current
    const list = listRef.current
    if (!root || !list) return
    const trigger =
      root.querySelector<HTMLElement>('.outlined-select-trigger') ?? root
    const rect = trigger.getBoundingClientRect()
    const listHeight = list.offsetHeight
    const spaceBelow = window.innerHeight - rect.bottom - GAP_PX - EDGE_PAD
    const placeAbove =
      spaceBelow < Math.min(listHeight, 16 * 16) &&
      rect.top > spaceBelow + EDGE_PAD

    const width = Math.max(rect.width, 8 * 16)
    let left = rect.left
    left = Math.min(
      window.innerWidth - EDGE_PAD - width,
      Math.max(EDGE_PAD, left),
    )
    const top = placeAbove
      ? Math.max(EDGE_PAD, rect.top - GAP_PX - listHeight)
      : rect.bottom + GAP_PX

    setPopoverStyle({
      top,
      left,
      width,
      maxHeight: placeAbove
        ? Math.min(16 * 16, rect.top - GAP_PX - EDGE_PAD)
        : Math.min(16 * 16, window.innerHeight - top - EDGE_PAD),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    setHighlight(value)
  }, [open, value, valuesSignature])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      onOpenChange(false)
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

  useLayoutEffect(() => {
    if (!open) return
    positionPopover()
  }, [open, options.length, positionPopover])

  useEffect(() => {
    if (!open) return
    function onReposition() {
      positionPopover()
    }
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, positionPopover])

  useEffect(() => {
    if (!open) return
    const btn = listRef.current?.querySelector<HTMLElement>(
      `[data-option-value="${CSS.escape(highlight)}"]`,
    )
    btn?.focus()
  }, [open, highlight])

  function pick(next: string) {
    onChange(next)
    onOpenChange(false)
  }

  function handleListKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (options.length === 0) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(highlight)
      return
    }
    let direction: -1 | 1 | null = null
    if (e.key === 'ArrowDown') direction = 1
    else if (e.key === 'ArrowUp') direction = -1
    if (direction == null) return
    e.preventDefault()
    const currentIndex = Math.max(0, values.indexOf(highlight))
    const next = cycleTabIndex(options.length, currentIndex, direction)
    const nextValue = values[next]
    if (nextValue != null) setHighlight(nextValue)
  }

  return (
    <div
      ref={rootRef}
      className={[
        'outlined-field',
        'outlined-field-control',
        'outlined-select',
        open ? 'open' : '',
        disabled ? 'disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="outlined-field-label">{label}</span>
      <button
        type="button"
        className="outlined-select-trigger"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (open || disabled) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onOpenChange(true)
          }
        }}
      >
        <span className="outlined-select-value">{displayLabel}</span>
        <span className="outlined-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={listRef}
              id={panelId}
              className="outlined-select-popover outlined-select-popover-portal"
              role="listbox"
              aria-label={label}
              style={popoverStyle}
              onKeyDown={handleListKeyDown}
            >
              {options.map((option) => {
                const isActive = option.value === value
                const isHighlighted = option.value === highlight
                return (
                  <button
                    key={option.value === '' ? '__all__' : option.value}
                    type="button"
                    role="option"
                    data-option-value={option.value}
                    aria-selected={isActive}
                    className={`outlined-select-option${isActive ? ' active' : ''}${isHighlighted ? ' highlighted' : ''}`}
                    tabIndex={isHighlighted ? 0 : -1}
                    onClick={() => pick(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
