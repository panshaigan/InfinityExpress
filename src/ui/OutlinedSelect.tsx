import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
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

  useEffect(() => {
    if (!open) return
    setHighlight(value)
  }, [open, value, valuesSignature])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
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
      {open ? (
        <div
          ref={listRef}
          id={panelId}
          className="outlined-select-popover"
          role="listbox"
          aria-label={label}
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
        </div>
      ) : null}
    </div>
  )
}
