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
  })
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

  const mainKeys = mainBranches.map((b) => b.node.key)
  const subKeys = subBranches.map((b) => b.node.key)

  return (
    <div className="branch-nav">
      <div
        className="branch-nav-row"
        role="tablist"
        aria-label="Content main branches"
        onKeyDown={(e) => handleTabListKeyDown(e, mainKeys, mainKey, onSelectMain)}
      >
        {mainBranches.map((branch) => (
          <button
            key={branch.node.key}
            type="button"
            role="tab"
            data-branch-key={branch.node.key}
            tabIndex={mainKey === branch.node.key ? 0 : -1}
            aria-selected={mainKey === branch.node.key}
            className={mainKey === branch.node.key ? 'active' : ''}
            onClick={() => onSelectMain(branch.node.key)}
          >
            {branchLabel(branch)}
          </button>
        ))}
      </div>
      {subBranches.length > 0 && (
        <div
          className="branch-nav-row"
          role="tablist"
          aria-label="Content subbranches"
          onKeyDown={(e) => handleTabListKeyDown(e, subKeys, subKey, onSelectSub)}
        >
          {subBranches.map((branch) => (
            <button
              key={branch.node.key}
              type="button"
              role="tab"
              data-branch-key={branch.node.key}
              tabIndex={subKey === branch.node.key ? 0 : -1}
              aria-selected={subKey === branch.node.key}
              className={subKey === branch.node.key ? 'active' : ''}
              onClick={() => onSelectSub(branch.node.key)}
            >
              {branchLabel(branch)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
