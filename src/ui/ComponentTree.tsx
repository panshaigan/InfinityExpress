import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { TreeNode } from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import { displaySelectionState } from '../lib/selection/selectionEngine'
import type { SelectedGame } from '../lib/xml/schema'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'
import { stabilityBadgeLabel } from '../lib/selection/filterDisplayTree'

interface Props {
  nodes: DisplayNode[]
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  focusedKey: string | null
  onFocus: (key: string) => void
  onToggle: (display: DisplayNode, wantSelected: boolean) => void
}

const DEFAULT_FOLDED_TAGS = new Set(['mod', 'group', 'alternatives'])

function isDefaultFolded(node: TreeNode): boolean {
  return DEFAULT_FOLDED_TAGS.has(node.tag)
}

function collectExpandableKeys(nodes: DisplayNode[], into: Set<string>) {
  for (const d of nodes) {
    if (d.children.length > 0 && !isDefaultFolded(d.node)) {
      into.add(d.node.key)
    }
    collectExpandableKeys(d.children, into)
  }
}

function CheckboxRow({
  display,
  selectedIds,
  game,
  focusedKey,
  onFocus,
  onToggle,
  depth,
  expandedKeys,
  onToggleExpand,
}: {
  display: DisplayNode
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  focusedKey: string | null
  onFocus: (key: string) => void
  onToggle: Props['onToggle']
  depth: number
  expandedKeys: ReadonlySet<string>
  onToggleExpand: (key: string) => void
}) {
  const { node, collapsedComponent, children } = display
  const state = displaySelectionState(display, selectedIds, game)
  const inputRef = useRef<HTMLInputElement>(null)
  const foldable = children.length > 0
  const expanded = foldable && expandedKeys.has(node.key)
  const focused = focusedKey === node.key

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === 'indeterminate'
    }
  }, [state])

  const label =
    node.attrs.label ??
    (collapsedComponent ? collapsedComponent.attrs.label : undefined) ??
    node.tag
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const stability =
    collapsedComponent?.attrs.stability ?? node.attrs.stability
  const stabilityLabel = stabilityBadgeLabel(stability)

  function handleFoldClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onToggleExpand(node.key)
  }

  function handleRowActivate() {
    onFocus(node.key)
  }

  return (
    <div className="tree-node" style={{ marginLeft: depth * 16 }}>
      <div
        className={`tree-row-wrap${focused ? ' focused' : ''}`}
        onClick={handleRowActivate}
      >
        {foldable ? (
          <button
            type="button"
            className="tree-fold"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={handleFoldClick}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-fold-spacer" />
        )}
        <div className="tree-row">
          <input
            ref={inputRef}
            type="checkbox"
            checked={state === 'checked'}
            aria-label={label}
            onChange={(e) => {
              onFocus(node.key)
              onToggle(display, e.target.checked)
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="tree-label">{label}</span>
          {level && (
            <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
          )}
          {stabilityLabel && <span className="badge">{stabilityLabel}</span>}
        </div>
      </div>
      {expanded &&
        children.map((child) => (
          <CheckboxRow
            key={child.node.key}
            display={child}
            selectedIds={selectedIds}
            game={game}
            focusedKey={focusedKey}
            onFocus={onFocus}
            onToggle={onToggle}
            depth={depth + 1}
            expandedKeys={expandedKeys}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </div>
  )
}

export function ComponentTree(props: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    collectExpandableKeys(props.nodes, initial)
    return initial
  })

  // When the display tree changes (station / engine / displayIf), expand newly visible
  // non-default-folded containers without collapsing user-toggled ones.
  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      const addDefaults = (nodes: DisplayNode[]) => {
        for (const d of nodes) {
          if (d.children.length > 0 && !isDefaultFolded(d.node) && !next.has(d.node.key)) {
            next.add(d.node.key)
          }
          addDefaults(d.children)
        }
      }
      addDefaults(props.nodes)
      return next
    })
  }, [props.nodes])

  function onToggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (props.nodes.length === 0) {
    return <p className="empty">Nothing to show for this engine at this station.</p>
  }
  return (
    <div className="component-tree">
      {props.nodes.map((n) => (
        <CheckboxRow
          key={n.node.key}
          display={n}
          selectedIds={props.selectedIds}
          game={props.game}
          focusedKey={props.focusedKey}
          onFocus={props.onFocus}
          onToggle={props.onToggle}
          depth={0}
          expandedKeys={expandedKeys}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  )
}
