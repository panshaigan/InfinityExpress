import type { DisplayNode } from '../selection/visibility'

/** Flat row in the currently expanded tree view. */
export interface VisibleTreeRow {
  key: string
  display: DisplayNode
  parentKey: string | null
  /** True when the node has children that can be shown under expand. */
  foldable: boolean
  expanded: boolean
}

export type TreeCommand =
  | { type: 'move'; key: string }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string }
  | { type: 'expandSubtree'; key: string }
  | { type: 'toggleCheck'; key: string }
  | { type: 'focusDetail'; key: string }

export interface TreeKeyboardContext {
  visibleRows: readonly VisibleTreeRow[]
  focusedKey: string | null
  /** Index of focusedKey in visibleRows, or -1 if missing. */
  focusedIndex: number
}

/** Depth-first flatten of display nodes, skipping children of collapsed parents. */
export function flattenVisibleRows(
  nodes: readonly DisplayNode[],
  expandedKeys: ReadonlySet<string>,
  parentKey: string | null = null,
): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = []
  for (const display of nodes) {
    const foldable = display.children.length > 0
    const expanded = foldable && expandedKeys.has(display.node.key)
    rows.push({
      key: display.node.key,
      display,
      parentKey,
      foldable,
      expanded,
    })
    if (expanded) {
      rows.push(...flattenVisibleRows(display.children, expandedKeys, display.node.key))
    }
  }
  return rows
}

/** Collect keys of this node and every expandable descendant (for `*`). */
export function collectExpandableDescendantKeys(display: DisplayNode): string[] {
  const keys: string[] = []
  function walk(d: DisplayNode) {
    if (d.children.length > 0) {
      keys.push(d.node.key)
      for (const child of d.children) walk(child)
    }
  }
  walk(display)
  return keys
}

/** Union of expandable keys under a forest of display roots (fold/unfold all). */
export function collectAllExpandableKeys(nodes: readonly DisplayNode[]): string[] {
  const keys: string[] = []
  for (const d of nodes) {
    keys.push(...collectExpandableDescendantKeys(d))
  }
  return keys
}

/** True when a foldable node has at least one nested foldable descendant. */
export function hasNestedFoldable(display: DisplayNode): boolean {
  if (display.children.length === 0) return false
  for (const child of display.children) {
    if (child.children.length > 0) return true
    if (hasNestedFoldable(child)) return true
  }
  return false
}

export function buildTreeKeyboardContext(
  nodes: readonly DisplayNode[],
  expandedKeys: ReadonlySet<string>,
  focusedKey: string | null,
): TreeKeyboardContext {
  const visibleRows = flattenVisibleRows(nodes, expandedKeys)
  const focusedIndex =
    focusedKey == null ? -1 : visibleRows.findIndex((r) => r.key === focusedKey)
  return { visibleRows, focusedKey, focusedIndex }
}

/**
 * Resolve a key press to a tree command. Returns null when the key is not handled.
 * Uses `KeyboardEvent.key` values (ArrowDown, PageDown, ' ', Home, …).
 */
export function resolveTreeKey(
  key: string,
  ctx: TreeKeyboardContext,
): TreeCommand | null {
  const { visibleRows, focusedIndex } = ctx
  if (visibleRows.length === 0) return null

  const current =
    focusedIndex >= 0 ? visibleRows[focusedIndex]! : visibleRows[0]!
  const currentKey = current.key

  switch (key) {
    case 'ArrowDown': {
      if (focusedIndex < 0) return { type: 'move', key: visibleRows[0]!.key }
      const next = visibleRows[focusedIndex + 1]
      return next ? { type: 'move', key: next.key } : null
    }
    case 'ArrowUp': {
      if (focusedIndex < 0) return { type: 'move', key: visibleRows[0]!.key }
      const prev = visibleRows[focusedIndex - 1]
      return prev ? { type: 'move', key: prev.key } : null
    }
    case 'Home':
      return { type: 'move', key: visibleRows[0]!.key }
    case 'End':
      return { type: 'move', key: visibleRows[visibleRows.length - 1]!.key }
    case 'PageDown':
    case 'PageUp': {
      if (focusedIndex < 0) return { type: 'move', key: visibleRows[0]!.key }
      const siblings = visibleRows.filter((r) => r.parentKey === current.parentKey)
      const sibIndex = siblings.findIndex((r) => r.key === currentKey)
      if (sibIndex < 0) return null
      const next =
        key === 'PageDown' ? siblings[sibIndex + 1] : siblings[sibIndex - 1]
      return next ? { type: 'move', key: next.key } : null
    }
    case 'ArrowRight': {
      if (focusedIndex < 0) return { type: 'move', key: currentKey }
      if (current.foldable && !current.expanded) {
        return { type: 'expand', key: currentKey }
      }
      if (current.foldable && current.expanded) {
        const child = visibleRows[focusedIndex + 1]
        if (child && child.parentKey === currentKey) {
          return { type: 'move', key: child.key }
        }
      }
      return null
    }
    case 'ArrowLeft': {
      if (focusedIndex < 0) return { type: 'move', key: currentKey }
      if (current.foldable && current.expanded) {
        return { type: 'collapse', key: currentKey }
      }
      if (current.parentKey != null) {
        return { type: 'move', key: current.parentKey }
      }
      return null
    }
    case ' ':
    case 'Spacebar':
      return { type: 'toggleCheck', key: currentKey }
    case '*':
      if (current.foldable) return { type: 'expandSubtree', key: currentKey }
      return null
    case 'Enter':
      return { type: 'focusDetail', key: currentKey }
    default:
      return null
  }
}
