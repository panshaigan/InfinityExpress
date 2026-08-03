import { engineMatches } from '../engine/matchEngine'
import { evalConditionExpr } from './conditions'
import {
  type ComponentNode,
  type SelectedGame,
  type TreeNode,
  isComponentNode,
} from '../xml/schema'

export interface VisibilityContext {
  game: SelectedGame
  selectedIds: ReadonlySet<string>
}

/** Engine-eligible and displayIf satisfied (ignores noDisplay). */
export function isEngineAndDisplayEligible(node: TreeNode, ctx: VisibilityContext): boolean {
  if (!engineMatches(node.effectiveEngine, ctx.game)) return false
  if (node.attrs.displayIf && !evalConditionExpr(node.attrs.displayIf, ctx.selectedIds)) {
    return false
  }
  return true
}

/** Shown in the UI tree. */
export function isUiVisible(node: TreeNode, ctx: VisibilityContext): boolean {
  if (node.attrs.noDisplay) return false
  return isEngineAndDisplayEligible(node, ctx)
}

export interface DisplayNode {
  /** Node shown in the UI (may be a collapsed container). */
  node: TreeNode
  /** If collapsed to a single component, the component that gets toggled. */
  collapsedComponent?: ComponentNode
  children: DisplayNode[]
}

function collectVisibleComponentLeaves(node: TreeNode, ctx: VisibilityContext): ComponentNode[] {
  if (!isEngineAndDisplayEligible(node, ctx)) return []
  if (isComponentNode(node)) {
    if (node.attrs.noDisplay) return []
    return [node]
  }
  return node.children.flatMap((c) => collectVisibleComponentLeaves(c, ctx))
}

/**
 * Under noBranches, hoist past intermediate containers so only components
 * (and alternatives units) appear as direct display children.
 */
function flattenNoBranchesChildren(nodes: TreeNode[], ctx: VisibilityContext): DisplayNode[] {
  const result: DisplayNode[] = []

  for (const node of nodes) {
    if (!isEngineAndDisplayEligible(node, ctx)) continue

    if (isComponentNode(node)) {
      if (node.attrs.noDisplay) continue
      result.push({ node, children: [] })
      continue
    }

    if (node.attrs.noDisplay) {
      result.push(...flattenNoBranchesChildren(node.children, ctx))
      continue
    }

    // Keep alternatives as an exclusive-choice unit (may itself noBranches)
    if (node.kind === 'alternatives') {
      result.push(...buildDisplayTree([node], ctx))
      continue
    }

    // Nested noBranches container: show it (with its own flattening) rather than erase it
    if (node.attrs.noBranches) {
      result.push(...buildDisplayTree([node], ctx))
      continue
    }

    // Intermediate grouping (mod, group, org tags): hoist children
    result.push(...flattenNoBranchesChildren(node.children, ctx))
  }

  return result
}

function finalizeContainerDisplay(
  node: TreeNode,
  nested: DisplayNode[],
  ctx: VisibilityContext,
): DisplayNode | null {
  const leaves = collectVisibleComponentLeaves(node, ctx)
  if (leaves.length === 0) {
    if (nested.length === 0) return null
    return { node, children: nested }
  }

  if (leaves.length === 1) {
    return { node, collapsedComponent: leaves[0], children: [] }
  }

  if (nested.length === 0) return null
  return { node, children: nested }
}

/**
 * Build display tree with single-child collapse:
 * if a container has exactly one visible component leaf (ignoring noDisplay siblings),
 * show only the container (checking it selects that component).
 *
 * noBranches containers keep their own row but hoist nested grouping so children
 * are flat components (alternatives kept as units).
 */
export function buildDisplayTree(nodes: TreeNode[], ctx: VisibilityContext): DisplayNode[] {
  const result: DisplayNode[] = []

  for (const node of nodes) {
    if (!isEngineAndDisplayEligible(node, ctx)) continue

    if (isComponentNode(node)) {
      if (node.attrs.noDisplay) continue
      result.push({ node, children: [] })
      continue
    }

    // Station/container with noDisplay: still process children if any (e.g. hidden base end)
    if (node.attrs.noDisplay) {
      result.push(...buildDisplayTree(node.children, ctx))
      continue
    }

    const nested = node.attrs.noBranches
      ? flattenNoBranchesChildren(node.children, ctx)
      : buildDisplayTree(node.children, ctx)

    const finalized = finalizeContainerDisplay(node, nested, ctx)
    if (finalized) result.push(finalized)
  }

  return result
}

export function displayTreeHasVisible(nodes: TreeNode[], ctx: VisibilityContext): boolean {
  return buildDisplayTree(nodes, ctx).length > 0
}
