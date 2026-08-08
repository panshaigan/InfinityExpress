import { engineMatches } from '../engine/matchEngine'
import { evalConditionExpr } from './conditions'
import type { DisplayNode } from './visibility'
import {
  findEnclosingAlternatives,
  findEnclosingMod,
  parentOf,
} from './treeAncestry'
import {
  type ComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
  type TreeNode,
  isComponentNode,
} from '../xml/schema'

export type SelectionSet = Set<string>

export function alternativesBranchRoot(
  model: InstallSequenceModel,
  alternatives: TreeNode,
  node: TreeNode,
): TreeNode | undefined {
  let cur: TreeNode | undefined = node
  while (cur) {
    const p = parentOf(model, cur)
    if (p?.key === alternatives.key) return cur
    cur = p
  }
  return undefined
}

export function allComponentDescendants(node: TreeNode): ComponentNode[] {
  if (isComponentNode(node)) return [node]
  return node.children.flatMap(allComponentDescendants)
}

export function eligibleComponents(nodes: ComponentNode[], game: SelectedGame): ComponentNode[] {
  return nodes.filter((c) => engineMatches(c.effectiveEngine, game))
}

export function clearComponents(selected: SelectionSet, components: ComponentNode[]) {
  for (const c of components) selected.delete(c.componentId)
}

export function selectComponents(selected: SelectionSet, components: ComponentNode[]) {
  for (const c of components) selected.add(c.componentId)
}

export function applyAlternativesExclusion(
  model: InstallSequenceModel,
  selected: SelectionSet,
  newlySelectedNode: TreeNode,
) {
  // Walk every enclosing <alternatives> ancestor so nested radios also
  // clear sibling branches of outer exclusive groups.
  let scope: TreeNode | undefined = newlySelectedNode
  while (scope) {
    const alts = findEnclosingAlternatives(model, scope)
    if (!alts) return

    const branch = alternativesBranchRoot(model, alts, newlySelectedNode)
    if (!branch) return

    const directChildren = alts.children
    const hasOnlyComponents = directChildren.every((c) => isComponentNode(c))

    if (hasOnlyComponents) {
      for (const child of directChildren) {
        if (isComponentNode(child) && child.key !== branch.key) {
          selected.delete(child.componentId)
        }
      }
    } else {
      for (const child of directChildren) {
        if (child.key === branch.key) continue
        clearComponents(selected, allComponentDescendants(child))
      }
    }

    scope = alts
  }
}

export function applyCoreOnSelect(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  touched: TreeNode,
) {
  const mod = findEnclosingMod(model, touched)
  if (!mod) return
  const cores = eligibleComponents(
    allComponentDescendants(mod).filter((c) => c.attrs.core),
    game,
  )
  selectComponents(selected, cores)
}

export function defaultComponentsUnderAlternatives(alts: TreeNode, game: SelectedGame): ComponentNode[] {
  const defaultLeaves = eligibleComponents(
    allComponentDescendants(alts).filter((c) => c.attrs.default),
    game,
  )
  if (defaultLeaves.length === 0) return []

  // Prefer selecting the branch that contains the default marker
  for (const child of alts.children) {
    const branchComps = allComponentDescendants(child)
    if (branchComps.some((c) => c.attrs.default)) {
      if (isComponentNode(child)) {
        return eligibleComponents([child], game)
      }
      // For a default on a nested component, select defaults in that branch only
      return eligibleComponents(
        branchComps.filter((c) => c.attrs.default),
        game,
      )
    }
  }
  return defaultLeaves
}

export function selectableDescendants(
  node: TreeNode,
  game: SelectedGame,
  selected: ReadonlySet<string>,
): ComponentNode[] {
  const out: ComponentNode[] = []

  function walk(n: TreeNode) {
    if (!engineMatches(n.effectiveEngine, game)) return
    if (n.attrs.displayIf && !evalConditionExpr(n.attrs.displayIf, selected)) return
    if (n.attrs.displayIfNot && evalConditionExpr(n.attrs.displayIfNot, selected)) return

    if (isComponentNode(n)) {
      if (n.attrs.noDisplay) return
      out.push(n)
      return
    }

    if (n.kind === 'alternatives') {
      out.push(...defaultComponentsUnderAlternatives(n, game))
      return
    }

    for (const c of n.children) walk(c)
  }

  walk(node)
  return out
}

/** Components to clear when unchecking a display container (all alts under alternatives). */
export function collectDisplayClearTargets(
  display: DisplayNode,
  game: SelectedGame,
): ComponentNode[] {
  if (display.collapsedComponent) {
    return eligibleComponents([display.collapsedComponent], game)
  }

  const { node } = display
  if (isComponentNode(node)) {
    return eligibleComponents([node], game)
  }

  if (node.kind === 'alternatives') {
    return eligibleComponents(allComponentDescendants(node), game)
  }

  return display.children.flatMap((child) => collectDisplayClearTargets(child, game))
}

export function clearableDescendants(node: TreeNode, game: SelectedGame): ComponentNode[] {
  return eligibleComponents(
    allComponentDescendants(node).filter((c) => !c.attrs.noDisplay),
    game,
  )
}
