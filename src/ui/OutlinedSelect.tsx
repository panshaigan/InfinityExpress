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
import { OutlinedTextField } from './OutlinedTextField'

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
  searchLabel?: string
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
  searchLabel,
  disabled = false,
  open,
  onOpenChange,
  onChange,
  className = '',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const selected = options.find((o) => o.value === value)
  const displayLabel = selected?.label ?? emptyLabel
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const visibleOptions = search
    ? options.filter(
        (option) => option.value !== '' && option.label.toLowerCase().includes(search),
      )
    : options
  const values = visibleOptions.map((option) => option.value)
  const valuesSignature = options.map((option) => option.value).join('\0')
  const [highlight, setHighlight] = useState(value)
  const visibleHighlight = values.includes(highlight) ? highlight : values[0]
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({
    top: 0,
    left: 0,
    width: 0,
  })

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    const rect = trigger.getBoundingClientRect()
    const listHeight = panel.offsetHeight
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
    if (!open) {
      setQuery('')
      return
    }
    setHighlight(value)
  }, [open, value, valuesSignature])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      onOpenChange(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        if (searchLabel && panelRef.current?.contains(document.activeElement)) {
          triggerRef.current?.focus()
        }
        onOpenChange(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange, searchLabel])

  useLayoutEffect(() => {
    if (!open) return
    positionPopover()
  }, [open, visibleOptions.length, positionPopover])

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

  const focusOption = useCallback((index: number) => {
    panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus()
  }, [])

  const highlightedIndex = values.indexOf(visibleHighlight)
  useEffect(() => {
    if (open && !searchLabel) focusOption(highlightedIndex)
  }, [open, searchLabel, highlightedIndex, focusOption])

  function pick(next: string) {
    onChange(next)
    if (searchLabel) triggerRef.current?.focus()
    onOpenChange(false)
  }

  function handleListKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (visibleHighlight === undefined) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(visibleHighlight)
      return
    }
    let direction: -1 | 1 | null = null
    if (e.key === 'ArrowDown') direction = 1
    else if (e.key === 'ArrowUp') direction = -1
    if (direction == null) return
    e.preventDefault()
    const next = cycleTabIndex(values.length, highlightedIndex, direction)
    setHighlight(values[next])
    if (searchLabel) focusOption(next)
  }

  const optionButtons = visibleOptions.map((option) => {
    const isActive = option.value === value
    const isHighlighted = option.value === visibleHighlight
    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={isActive}
        className={`outlined-select-option${isActive ? ' active' : ''}${isHighlighted ? ' highlighted' : ''}`}
        tabIndex={isHighlighted ? 0 : -1}
        onFocus={() => setHighlight(option.value)}
        onClick={() => pick(option.value)}
      >
        {option.label}
      </button>
    )
  })

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
        ref={triggerRef}
        type="button"
        className="outlined-select-trigger"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup={searchLabel ? 'dialog' : 'listbox'}
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
              ref={panelRef}
              id={panelId}
              className="outlined-select-popover outlined-select-popover-portal"
              role={searchLabel ? 'dialog' : 'listbox'}
              aria-label={label}
              style={popoverStyle}
              onKeyDown={searchLabel ? undefined : handleListKeyDown}
            >
              {searchLabel ? (
                <>
                  <OutlinedTextField
                    label={searchLabel}
                    value={query}
                    autoFocus
                    className="outlined-select-search"
                    onChange={(next) => {
                      setQuery(next)
                      setHighlight(value)
                      if (resultsRef.current) resultsRef.current.scrollTop = 0
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (visibleHighlight !== undefined) pick(visibleHighlight)
                      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault()
                        focusOption(e.key === 'ArrowDown' ? 0 : values.length - 1)
                      }
                    }}
                  />
                  <div
                    ref={resultsRef}
                    className="outlined-select-results"
                    role="listbox"
                    aria-label={label}
                    onKeyDown={handleListKeyDown}
                  >
                    {optionButtons}
                  </div>
                  {visibleOptions.length === 0 && (
                    <p className="outlined-select-empty" role="status">
                      No matches
                    </p>
                  )}
                </>
              ) : optionButtons}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
