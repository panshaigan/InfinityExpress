import { engineMatches } from '../engine/matchEngine'
import { levelFilterRank, type LadderLevel } from '../levels'
import { evalConditionExpr } from './conditions'
import {
  type ComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
  type TreeNode,
  isComponentNode,
} from '../xml/schema'

export type SelectionSet = Set<string>

function parentOf(model: InstallSequenceModel, node: TreeNode): TreeNode | undefined {
  return node.parentKey ? model.nodesByKey.get(node.parentKey) : undefined
}

function findEnclosingMod(model: InstallSequenceModel, node: TreeNode): TreeNode | undefined {
  let cur: TreeNode | undefined = node
  while (cur) {
    if (cur.tag === 'mod') return cur
    cur = parentOf(model, cur)
  }
  return undefined
}

function findEnclosingAlternatives(
  model: InstallSequenceModel,
  node: TreeNode,
): TreeNode | undefined {
  let cur: TreeNode | undefined = parentOf(model, node)
  while (cur) {
    if (cur.kind === 'alternatives') return cur
    cur = parentOf(model, cur)
  }
  return undefined
}

function alternativesBranchRoot(
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

function allComponentDescendants(node: TreeNode): ComponentNode[] {
  if (isComponentNode(node)) return [node]
  return node.children.flatMap(allComponentDescendants)
}

function eligibleComponents(nodes: ComponentNode[], game: SelectedGame): ComponentNode[] {
  return nodes.filter((c) => engineMatches(c.effectiveEngine, game))
}

function clearComponents(selected: SelectionSet, components: ComponentNode[]) {
  for (const c of components) selected.delete(c.componentId)
}

function selectComponents(selected: SelectionSet, components: ComponentNode[]) {
  for (const c of components) selected.add(c.componentId)
}

function applyAlternativesExclusion(
  model: InstallSequenceModel,
  selected: SelectionSet,
  newlySelectedNode: TreeNode,
) {
  const alts = findEnclosingAlternatives(model, newlySelectedNode)
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
    return
  }

  for (const child of directChildren) {
    if (child.key === branch.key) continue
    clearComponents(selected, allComponentDescendants(child))
  }
}

function applyCoreOnSelect(
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

function defaultComponentsUnderAlternatives(alts: TreeNode, game: SelectedGame): ComponentNode[] {
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

function selectableDescendants(
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

export function applyAlwaysIf(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
): void {
  let guard = 0
  while (guard++ < 50) {
    let round = false
    for (const c of model.componentsInOrder) {
      if (!c.attrs.alwaysIf) continue
      if (!engineMatches(c.effectiveEngine, game)) {
        if (selected.has(c.componentId)) {
          selected.delete(c.componentId)
          round = true
        }
        continue
      }
      const ok = evalConditionExpr(c.attrs.alwaysIf, selected)
      if (ok && !selected.has(c.componentId)) {
        selected.add(c.componentId)
        round = true
      } else if (!ok && selected.has(c.componentId)) {
        selected.delete(c.componentId)
        round = true
      }
    }
    if (!round) break
  }
}

export function createInitialSelection(
  model: InstallSequenceModel,
  game: SelectedGame,
): SelectionSet {
  const selected: SelectionSet = new Set()
  for (const c of model.componentsInOrder) {
    if (c.attrs.required && engineMatches(c.effectiveEngine, game)) {
      selected.add(c.componentId)
    }
  }
  applyAlwaysIf(model, selected, game)
  return selected
}

function passesDisplayGates(
  node: TreeNode,
  selected: ReadonlySet<string>,
): boolean {
  if (node.attrs.displayIf && !evalConditionExpr(node.attrs.displayIf, selected)) {
    return false
  }
  if (node.attrs.displayIfNot && evalConditionExpr(node.attrs.displayIfNot, selected)) {
    return false
  }
  return true
}

function isLadderLeveled(component: ComponentNode): boolean {
  return levelFilterRank(component.effectiveLevel) !== null
}

/** Among level-matching candidates, keep one option per alternatives group. */
function pickLevelMassCheckCandidates(
  model: InstallSequenceModel,
  candidates: ComponentNode[],
): ComponentNode[] {
  const groups = new Map<string | null, ComponentNode[]>()
  for (const c of candidates) {
    const alts = findEnclosingAlternatives(model, c)
    const key = alts?.key ?? null
    const list = groups.get(key)
    if (list) list.push(c)
    else groups.set(key, [c])
  }

  const out: ComponentNode[] = []
  for (const [key, comps] of groups) {
    if (key === null) {
      out.push(...comps)
      continue
    }
    const defaults = comps.filter((c) => c.attrs.default)
    out.push(defaults[0] ?? comps[0]!)
  }
  return out
}

function selectMassCheckComponents(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  components: ComponentNode[],
  coreFilter: (c: ComponentNode) => boolean,
): boolean {
  let changed = false
  for (const c of components) {
    if (!selected.has(c.componentId)) {
      selected.add(c.componentId)
      changed = true
    }
    applyAlternativesExclusion(model, selected, c)
    const mod = findEnclosingMod(model, c)
    if (!mod) continue
    const cores = eligibleComponents(
      allComponentDescendants(mod).filter((x) => x.attrs.core && coreFilter(x)),
      game,
    )
    for (const core of cores) {
      if (!selected.has(core.componentId)) {
        selected.add(core.componentId)
        changed = true
      }
    }
  }
  return changed
}

/**
 * Resync ladder-leveled components to a cumulative max (or clear with null).
 * Difficulty and unleveled components are left alone. Required stays selected.
 */
export function applyLadderLevelSelection(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  maxLevel: LadderLevel | null,
): SelectionSet {
  const next = new Set(selected)
  const maxRank = maxLevel ? levelFilterRank(maxLevel) : null

  for (const c of model.componentsInOrder) {
    if (!isLadderLeveled(c)) continue
    if (!engineMatches(c.effectiveEngine, game)) continue

    const rank = levelFilterRank(c.effectiveLevel)!
    const want = maxRank !== null && rank <= maxRank
    if (!want && !c.attrs.required) {
      next.delete(c.componentId)
    }
  }

  if (maxRank !== null) {
    const coreFilter = (c: ComponentNode) => {
      const rank = levelFilterRank(c.effectiveLevel)
      return rank !== null && rank <= maxRank
    }
    let guard = 0
    while (guard++ < 50) {
      const candidates: ComponentNode[] = []
      for (const c of model.componentsInOrder) {
        if (!isLadderLeveled(c)) continue
        if (!engineMatches(c.effectiveEngine, game)) continue
        const rank = levelFilterRank(c.effectiveLevel)!
        if (rank > maxRank) continue
        if (!passesDisplayGates(c, next)) continue
        candidates.push(c)
      }
      const toSelect = pickLevelMassCheckCandidates(model, candidates)
      if (!selectMassCheckComponents(model, next, game, toSelect, coreFilter)) break
    }
  }

  applyAlwaysIf(model, next, game)
  return next
}

/**
 * Select or clear only difficulty-leveled components. Ladder / unleveled untouched.
 */
export function setDifficultySelection(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  wantSelected: boolean,
): SelectionSet {
  const next = new Set(selected)

  if (!wantSelected) {
    for (const c of model.componentsInOrder) {
      if (c.effectiveLevel !== 'difficulty') continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (c.attrs.required) continue
      next.delete(c.componentId)
    }
    applyAlwaysIf(model, next, game)
    return next
  }

  const coreFilter = (c: ComponentNode) => c.effectiveLevel === 'difficulty'
  let guard = 0
  while (guard++ < 50) {
    const candidates: ComponentNode[] = []
    for (const c of model.componentsInOrder) {
      if (c.effectiveLevel !== 'difficulty') continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (!passesDisplayGates(c, next)) continue
      candidates.push(c)
    }
    const toSelect = pickLevelMassCheckCandidates(model, candidates)
    if (!selectMassCheckComponents(model, next, game, toSelect, coreFilter)) break
  }

  applyAlwaysIf(model, next, game)
  return next
}

export function toggleNode(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  node: TreeNode,
  collapsedComponent: ComponentNode | undefined,
  wantSelected: boolean,
): SelectionSet {
  const next = new Set(selected)

  if (collapsedComponent) {
    return toggleComponent(model, next, game, collapsedComponent, wantSelected)
  }

  if (isComponentNode(node)) {
    return toggleComponent(model, next, game, node, wantSelected)
  }

  if (wantSelected) {
    if (node.kind === 'alternatives') {
      clearComponents(next, eligibleComponents(allComponentDescendants(node), game))
      const defaults = defaultComponentsUnderAlternatives(node, game)
      selectComponents(next, defaults)
      if (defaults[0]) applyAlternativesExclusion(model, next, defaults[0])
      applyCoreOnSelect(model, next, game, node)
    } else {
      const toSelect = selectableDescendants(node, game, next)
      selectComponents(next, toSelect)
      for (const c of toSelect) {
        applyAlternativesExclusion(model, next, c)
      }
      applyCoreOnSelect(model, next, game, node)
    }
  } else {
    clearComponents(next, allComponentDescendants(node))
  }

  applyAlwaysIf(model, next, game)
  return next
}

function toggleComponent(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  component: ComponentNode,
  wantSelected: boolean,
): SelectionSet {
  if (wantSelected) {
    selected.add(component.componentId)
    applyAlternativesExclusion(model, selected, component)
    applyCoreOnSelect(model, selected, game, component)
  } else if (component.attrs.core) {
    const mod = findEnclosingMod(model, component)
    if (mod) clearComponents(selected, allComponentDescendants(mod))
    else selected.delete(component.componentId)
  } else {
    selected.delete(component.componentId)
  }
  applyAlwaysIf(model, selected, game)
  return selected
}

/**
 * Alternatives-aware container completeness:
 * - regular / non-alt subtrees: every eligible component must be selected
 * - each nested <alternatives>: satisfied when at least one eligible component is selected
 */
function containerSelectionParts(
  node: TreeNode,
  selected: ReadonlySet<string>,
  game: SelectedGame,
): { anySelected: boolean; fullySatisfied: boolean } {
  if (isComponentNode(node)) {
    if (!engineMatches(node.effectiveEngine, game)) {
      return { anySelected: false, fullySatisfied: true }
    }
    const on = selected.has(node.componentId)
    return { anySelected: on, fullySatisfied: on }
  }

  if (node.kind === 'alternatives') {
    const comps = eligibleComponents(allComponentDescendants(node), game)
    if (comps.length === 0) return { anySelected: false, fullySatisfied: true }
    const anySelected = comps.some((c) => selected.has(c.componentId))
    return { anySelected, fullySatisfied: anySelected }
  }

  let anySelected = false
  let fullySatisfied = true
  let hasEligible = false

  for (const child of node.children) {
    if (!engineMatches(child.effectiveEngine, game)) continue

    if (isComponentNode(child)) {
      hasEligible = true
      const on = selected.has(child.componentId)
      if (on) anySelected = true
      else fullySatisfied = false
      continue
    }

    if (child.kind === 'alternatives') {
      const comps = eligibleComponents(allComponentDescendants(child), game)
      if (comps.length === 0) continue
      hasEligible = true
      const on = comps.some((c) => selected.has(c.componentId))
      if (on) anySelected = true
      else fullySatisfied = false
      continue
    }

    const descendants = eligibleComponents(allComponentDescendants(child), game)
    if (descendants.length === 0) continue
    hasEligible = true
    const part = containerSelectionParts(child, selected, game)
    if (part.anySelected) anySelected = true
    if (!part.fullySatisfied) fullySatisfied = false
  }

  if (!hasEligible) return { anySelected: false, fullySatisfied: true }
  return { anySelected, fullySatisfied }
}

export function nodeSelectionState(
  node: TreeNode,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  collapsedComponent?: ComponentNode,
): 'checked' | 'unchecked' | 'indeterminate' {
  if (collapsedComponent) {
    return selected.has(collapsedComponent.componentId) ? 'checked' : 'unchecked'
  }
  if (isComponentNode(node)) {
    return selected.has(node.componentId) ? 'checked' : 'unchecked'
  }

  const relevant = eligibleComponents(allComponentDescendants(node), game)
  if (relevant.length === 0) return 'unchecked'

  const { anySelected, fullySatisfied } = containerSelectionParts(node, selected, game)
  if (!anySelected) return 'unchecked'
  if (fullySatisfied) return 'checked'
  return 'indeterminate'
}
