import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import { cycleTabIndex } from '../lib/ui/chromeHotkeys'

function branchLabel(display: DisplayNode): string {
  return display.node.attrs.label ?? display.node.tag
}

interface Props {
  mainBranches: DisplayNode[]
  subBranches: DisplayNode[]
  mainKey: string | null
  subKey: string | null
  onSelectMain: (key: string) => void
  onSelectSub: (key: string) => void
}

type OpenMenu = 'main' | 'sub' | null

function BranchMenu({
  label,
  ariaLabel,
  branches,
  activeKey,
  open,
  onOpenChange,
  onSelect,
}: {
  label: string
  ariaLabel: string
  branches: DisplayNode[]
  activeKey: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (key: string) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const keys = branches.map((b) => b.node.key)
  const keysSignature = keys.join('\0')
  const firstKey = keys[0] ?? null
  const activeBranch = branches.find((b) => b.node.key === activeKey)
  const triggerLabel = activeBranch ? branchLabel(activeBranch) : label
  const [highlightKey, setHighlightKey] = useState<string | null>(activeKey)

  useEffect(() => {
    if (!open) return
    setHighlightKey(activeKey ?? firstKey)
  }, [open, activeKey, firstKey, keysSignature])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onOpenChange(false)
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
    if (!open || !highlightKey) return
    const btn = listRef.current?.querySelector<HTMLElement>(
      `[data-branch-key="${CSS.escape(highlightKey)}"]`,
    )
    btn?.focus()
  }, [open, highlightKey])

  function handleListKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (keys.length === 0) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (highlightKey) {
        onSelect(highlightKey)
        onOpenChange(false)
      }
      return
    }
    const currentIndex = highlightKey != null ? keys.indexOf(highlightKey) : 0
    let direction: -1 | 1 | null = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') direction = 1
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') direction = -1
    if (direction == null) return
    e.preventDefault()
    const next = cycleTabIndex(keys.length, currentIndex, direction)
    const nextKey = keys[next]
    if (nextKey) setHighlightKey(nextKey)
  }

  function handlePick(key: string) {
    onSelect(key)
    onOpenChange(false)
  }

  return (
    <div ref={menuRef} className="branch-menu">
      <button
        type="button"
        className={`btn secondary branch-menu-trigger${open ? ' open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
      >
        <span className="branch-menu-trigger-label">{triggerLabel}</span>
        <span className="branch-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          id={panelId}
          className="branch-menu-popover"
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleListKeyDown}
        >
          {branches.map((branch) => {
            const selected = activeKey === branch.node.key
            const highlighted = highlightKey === branch.node.key
            return (
              <button
                key={branch.node.key}
                type="button"
                role="option"
                data-branch-key={branch.node.key}
                aria-selected={selected}
                className={`branch-menu-option${selected ? ' active' : ''}${highlighted ? ' highlighted' : ''}`}
                tabIndex={highlighted ? 0 : -1}
                onClick={() => handlePick(branch.node.key)}
              >
                {branchLabel(branch)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ContentBranchNav({
  mainBranches,
  subBranches,
  mainKey,
  subKey,
  onSelectMain,
  onSelectSub,
}: Props) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)

  if (mainBranches.length === 0) return null

  return (
    <div className="branch-nav">
      <BranchMenu
        label="Game"
        ariaLabel="Game"
        branches={mainBranches}
        activeKey={mainKey}
        open={openMenu === 'main'}
        onOpenChange={(open) => setOpenMenu(open ? 'main' : null)}
        onSelect={onSelectMain}
      />
      {subBranches.length > 0 && (
        <BranchMenu
          label="Type"
          ariaLabel="Type"
          branches={subBranches}
          activeKey={subKey}
          open={openMenu === 'sub'}
          onOpenChange={(open) => setOpenMenu(open ? 'sub' : null)}
          onSelect={onSelectSub}
        />
      )}
    </div>
  )
}
