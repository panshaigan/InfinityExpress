import { useLayoutEffect, useRef, useState } from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import { cycleTabIndex } from '../lib/ui/chromeHotkeys'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

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

function handleTabListKeyDown(
  e: ReactKeyboardEvent<HTMLDivElement>,
  keys: string[],
  activeKey: string | null,
  onSelect: (key: string) => void,
) {
  if (keys.length === 0) return
  const currentIndex = activeKey != null ? keys.indexOf(activeKey) : 0
  let direction: -1 | 1 | null = null
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') direction = 1
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') direction = -1
  if (direction == null) return
  e.preventDefault()
  const next = cycleTabIndex(keys.length, currentIndex, direction)
  const nextKey = keys[next]
  if (!nextKey) return
  onSelect(nextKey)
  const list = e.currentTarget
  queueMicrotask(() => {
    const btn = list.querySelector<HTMLElement>(`[data-branch-key="${CSS.escape(nextKey)}"]`)
    btn?.focus()
    btn?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  })
}

function BranchTabRow({
  label,
  ariaLabel,
  branches,
  activeKey,
  onSelect,
}: {
  label: string
  ariaLabel: string
  branches: DisplayNode[]
  activeKey: string | null
  onSelect: (key: string) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)
  const keys = branches.map((b) => b.node.key)

  function updateFades() {
    const el = rowRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setFadeLeft(el.scrollLeft > 4)
    setFadeRight(max - el.scrollLeft > 4)
  }

  useLayoutEffect(() => {
    updateFades()
    const el = rowRef.current
    if (!el) return
    const ro = new ResizeObserver(() => updateFades())
    ro.observe(el)
    window.addEventListener('resize', updateFades)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateFades)
    }
  }, [branches])

  useLayoutEffect(() => {
    if (!activeKey) return
    const el = rowRef.current
    if (!el) return
    const btn = el.querySelector<HTMLElement>(
      `[data-branch-key="${CSS.escape(activeKey)}"]`,
    )
    btn?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    updateFades()
  }, [activeKey])

  return (
    <div className="branch-nav-block">
      <div className="branch-nav-meta">
        <span className="branch-nav-heading">{label}</span>
      </div>
      <div
        className={`branch-nav-scroll${fadeLeft ? ' fade-left' : ''}${fadeRight ? ' fade-right' : ''}`}
      >
        <div
          ref={rowRef}
          className="branch-nav-row"
          role="tablist"
          aria-label={ariaLabel}
          onScroll={updateFades}
          onKeyDown={(e) => handleTabListKeyDown(e, keys, activeKey, onSelect)}
        >
          {branches.map((branch) => (
            <button
              key={branch.node.key}
              type="button"
              role="tab"
              data-branch-key={branch.node.key}
              tabIndex={activeKey === branch.node.key ? 0 : -1}
              aria-selected={activeKey === branch.node.key}
              className={activeKey === branch.node.key ? 'active' : ''}
              onClick={() => onSelect(branch.node.key)}
            >
              {branchLabel(branch)}
            </button>
          ))}
        </div>
      </div>
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
  if (mainBranches.length === 0) return null

  return (
    <div className="branch-nav">
      <BranchTabRow
        label="Game"
        ariaLabel="Content main branches"
        branches={mainBranches}
        activeKey={mainKey}
        onSelect={onSelectMain}
      />
      {subBranches.length > 0 && (
        <BranchTabRow
          label="Type"
          ariaLabel="Content subbranches"
          branches={subBranches}
          activeKey={subKey}
          onSelect={onSelectSub}
        />
      )}
    </div>
  )
}
