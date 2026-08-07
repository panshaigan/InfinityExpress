import { engineMatches } from '../engine/matchEngine'
import {
  levelFilterRank,
  type DifficultyLevel,
  type LadderLevel,
} from '../levels'
import { evalConditionExpr } from './conditions'
import type { DisplayNode } from './visibility'
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

/** Visible/display leaves to select when checking a display container. */
export function collectDisplaySelectable(
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
    return defaultComponentsUnderAlternatives(node, game)
  }

  return display.children.flatMap((child) => collectDisplaySelectable(child, game))
}

/** Components to clear when unchecking a display container (all alts under alternatives). */
function collectDisplayClearTargets(
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

function clearableDescendants(node: TreeNode, game: SelectedGame): ComponentNode[] {
  return eligibleComponents(
    allComponentDescendants(node).filter((c) => !c.attrs.noDisplay),
    game,
  )
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
        applyAlternativesExclusion(model, selected, c)
        round = true
      } else if (!ok && c.attrs.noDisplay && selected.has(c.componentId)) {
        // Hidden companions stay tied to their condition; visible alwaysIf
        // options may still be chosen manually when the condition is false.
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

/** Optional scope: only touch component ids in this set. Omit for whole install sequence. */
export type LevelSelectionScope = ReadonlySet<string> | undefined

function inLevelScope(componentId: string, scope: LevelSelectionScope): boolean {
  return scope == null || scope.has(componentId)
}

/**
 * Select or clear ladder-leveled components based on enabled ladder ranks.
 *
 * - `enabledLadderLevels` controls which ladder ranks are selected (empty set clears non-required ladder components).
 * - Difficulty and unleveled components are left to other selectors (`setDifficultySelection`).
 * - `required` ladder components are always kept selected.
 * - When `scope` is set, only components in that id set are cleared/selected.
 */
export function applyLadderLevelSelection(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  enabledLadderLevels: ReadonlySet<LadderLevel>,
  scope?: LevelSelectionScope,
): SelectionSet {
  const next = new Set(selected)
  const enabledRanks = new Set<number>()

  for (const level of enabledLadderLevels) {
    const rank = levelFilterRank(level)
    if (rank === null) continue
    enabledRanks.add(rank)
  }

  for (const c of model.componentsInOrder) {
    if (!inLevelScope(c.componentId, scope)) continue
    if (!isLadderLeveled(c)) continue
    if (!engineMatches(c.effectiveEngine, game)) continue

    const rank = levelFilterRank(c.effectiveLevel)!
    const want = enabledRanks.has(rank)
    if (!want && !c.attrs.required) {
      next.delete(c.componentId)
    }
  }

  if (enabledRanks.size > 0) {
    const coreFilter = (c: ComponentNode) => {
      if (!inLevelScope(c.componentId, scope)) return false
      const rank = levelFilterRank(c.effectiveLevel)
      return rank !== null && enabledRanks.has(rank)
    }
    let guard = 0
    while (guard++ < 50) {
      const candidates: ComponentNode[] = []
      for (const c of model.componentsInOrder) {
        if (!inLevelScope(c.componentId, scope)) continue
        if (!isLadderLeveled(c)) continue
        if (!engineMatches(c.effectiveEngine, game)) continue
        const rank = levelFilterRank(c.effectiveLevel)!
        if (!enabledRanks.has(rank)) continue
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
 * Select or clear components for one difficulty token. Ladder / unleveled / other
 * difficulty tier untouched. When `scope` is set, only components in that id set
 * are cleared/selected.
 */
export function setDifficultySelection(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  token: DifficultyLevel,
  wantSelected: boolean,
  scope?: LevelSelectionScope,
): SelectionSet {
  const next = new Set(selected)

  if (!wantSelected) {
    for (const c of model.componentsInOrder) {
      if (!inLevelScope(c.componentId, scope)) continue
      if (c.effectiveLevel !== token) continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (c.attrs.required) continue
      next.delete(c.componentId)
    }
    applyAlwaysIf(model, next, game)
    return next
  }

  const coreFilter = (c: ComponentNode) =>
    inLevelScope(c.componentId, scope) && c.effectiveLevel === token
  let guard = 0
  while (guard++ < 50) {
    const candidates: ComponentNode[] = []
    for (const c of model.componentsInOrder) {
      if (!inLevelScope(c.componentId, scope)) continue
      if (c.effectiveLevel !== token) continue
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

/** Apply remembered global ladder + difficulty toggles to a station scope. */
export function applyGlobalLevelBaseline(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  ladder: ReadonlySet<LadderLevel>,
  lowerDifficulty: boolean,
  higherDifficulty: boolean,
  scope: ReadonlySet<string>,
): SelectionSet {
  let next = applyLadderLevelSelection(model, selected, game, ladder, scope)
  next = setDifficultySelection(model, next, game, 'lowerDifficulty', lowerDifficulty, scope)
  next = setDifficultySelection(model, next, game, 'higherDifficulty', higherDifficulty, scope)
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
    clearComponents(next, clearableDescendants(node, game))
  }

  applyAlwaysIf(model, next, game)
  return next
}

export function toggleDisplayNode(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  display: DisplayNode,
  wantSelected: boolean,
): SelectionSet {
  const next = new Set(selected)
  const { node, collapsedComponent } = display

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
      const toSelect = collectDisplaySelectable(display, game)
      selectComponents(next, toSelect)
      for (const c of toSelect) {
        applyAlternativesExclusion(model, next, c)
      }
      applyCoreOnSelect(model, next, game, node)
    }
  } else {
    clearComponents(next, collectDisplayClearTargets(display, game))
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
 * - regular / non-alt subtrees: every eligible visible component must be selected
 * - each nested <alternatives>: satisfied when at least one eligible component is selected
 * - noDisplay components are ignored (companions follow via alwaysIf)
 */
function containerSelectionParts(
  node: TreeNode,
  selected: ReadonlySet<string>,
  game: SelectedGame,
): { anySelected: boolean; fullySatisfied: boolean } {
  if (isComponentNode(node)) {
    if (!engineMatches(node.effectiveEngine, game) || node.attrs.noDisplay) {
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
      if (child.attrs.noDisplay) continue
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

    const descendants = eligibleComponents(
      allComponentDescendants(child).filter((c) => !c.attrs.noDisplay),
      game,
    )
    if (descendants.length === 0) {
      // May still have nested alternatives-only content
      const part = containerSelectionParts(child, selected, game)
      if (!part.fullySatisfied || part.anySelected) {
        hasEligible = true
        if (part.anySelected) anySelected = true
        if (!part.fullySatisfied) fullySatisfied = false
      }
      continue
    }
    hasEligible = true
    const part = containerSelectionParts(child, selected, game)
    if (part.anySelected) anySelected = true
    if (!part.fullySatisfied) fullySatisfied = false
  }

  if (!hasEligible) return { anySelected: false, fullySatisfied: true }
  return { anySelected, fullySatisfied }
}

function displaySelectionParts(
  display: DisplayNode,
  selected: ReadonlySet<string>,
  game: SelectedGame,
): { anySelected: boolean; fullySatisfied: boolean } {
  if (display.collapsedComponent) {
    if (!engineMatches(display.collapsedComponent.effectiveEngine, game)) {
      return { anySelected: false, fullySatisfied: true }
    }
    const on = selected.has(display.collapsedComponent.componentId)
    return { anySelected: on, fullySatisfied: on }
  }

  const { node } = display
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

  for (const child of display.children) {
    const part = displaySelectionParts(child, selected, game)
    // Vacuous / ineligible subtree (nothing to select)
    if (!part.anySelected && part.fullySatisfied) continue
    hasEligible = true
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

  const { anySelected, fullySatisfied } = containerSelectionParts(node, selected, game)
  if (!anySelected) return 'unchecked'
  if (fullySatisfied) return 'checked'
  return 'indeterminate'
}

export function displaySelectionState(
  display: DisplayNode,
  selected: ReadonlySet<string>,
  game: SelectedGame,
): 'checked' | 'unchecked' | 'indeterminate' {
  if (display.collapsedComponent) {
    return selected.has(display.collapsedComponent.componentId) ? 'checked' : 'unchecked'
  }
  if (isComponentNode(display.node)) {
    return selected.has(display.node.componentId) ? 'checked' : 'unchecked'
  }

  const { anySelected, fullySatisfied } = displaySelectionParts(display, selected, game)
  if (!anySelected) return 'unchecked'
  if (fullySatisfied) return 'checked'
  return 'indeterminate'
}

/** Aggregate checkbox state for a flat list of display roots (station select-all). */
export function listSelectionState(
  nodes: readonly DisplayNode[],
  selected: ReadonlySet<string>,
  game: SelectedGame,
): 'checked' | 'unchecked' | 'indeterminate' {
  if (nodes.length === 0) return 'unchecked'
  let anyChecked = false
  let anyUnchecked = false
  for (const n of nodes) {
    const state = displaySelectionState(n, selected, game)
    if (state === 'indeterminate') return 'indeterminate'
    if (state === 'checked') anyChecked = true
    else anyUnchecked = true
    if (anyChecked && anyUnchecked) return 'indeterminate'
  }
  return anyChecked ? 'checked' : 'unchecked'
}

/** Check or uncheck every top-level display node in a list. */
export function toggleListSelection(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  nodes: readonly DisplayNode[],
  wantSelected: boolean,
): SelectionSet {
  let next = selected
  for (const display of nodes) {
    next = toggleDisplayNode(model, next, game, display, wantSelected)
  }
  return next
}

export type RandomizePercent = 25 | 50 | 75 | 100

export interface RandomizeOptions {
  percent: RandomizePercent
  /** When true, grow/trim to the percentage; when false, clear then sample. */
  keepSelected: boolean
  /** Injectable RNG in [0, 1); defaults to Math.random. */
  random?: () => number
}

type RandomUnit =
  | { kind: 'component'; display: DisplayNode; component: ComponentNode }
  | { kind: 'alternatives'; display: DisplayNode }

function eligibleAltOptions(alts: TreeNode, game: SelectedGame): TreeNode[] {
  return alts.children.filter((child) => {
    if (!engineMatches(child.effectiveEngine, game)) return false
    if (isComponentNode(child)) {
      return !child.attrs.noDisplay
    }
    return (
      eligibleComponents(
        allComponentDescendants(child).filter((c) => !c.attrs.noDisplay),
        game,
      ).length > 0
    )
  })
}

/** Leaf / collapsed component / alternatives units under a display subtree. */
export function collectRandomUnits(
  display: DisplayNode,
  game: SelectedGame,
): RandomUnit[] {
  function walk(d: DisplayNode): RandomUnit[] {
    if (d.collapsedComponent) {
      const comps = eligibleComponents([d.collapsedComponent], game)
      if (comps.length === 0) return []
      return [{ kind: 'component', display: d, component: comps[0]! }]
    }

    const { node } = d
    if (isComponentNode(node)) {
      const comps = eligibleComponents([node], game)
      if (comps.length === 0) return []
      return [{ kind: 'component', display: d, component: comps[0]! }]
    }

    if (node.kind === 'alternatives') {
      if (eligibleAltOptions(node, game).length === 0) return []
      return [{ kind: 'alternatives', display: d }]
    }

    return d.children.flatMap(walk)
  }

  return walk(display)
}

function unitIsSelected(
  unit: RandomUnit,
  selected: ReadonlySet<string>,
  game: SelectedGame,
): boolean {
  if (unit.kind === 'component') {
    return selected.has(unit.component.componentId)
  }
  const comps = eligibleComponents(allComponentDescendants(unit.display.node), game)
  return comps.some((c) => selected.has(c.componentId))
}

function clearRandomUnit(selected: SelectionSet, unit: RandomUnit, game: SelectedGame) {
  clearComponents(selected, collectDisplayClearTargets(unit.display, game))
}

function selectOptionNode(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  option: TreeNode,
  random: () => number,
) {
  if (isComponentNode(option)) {
    selected.add(option.componentId)
    applyAlternativesExclusion(model, selected, option)
    applyCoreOnSelect(model, selected, game, option)
    return
  }

  if (option.kind === 'alternatives') {
    const nested = eligibleAltOptions(option, game)
    if (nested.length === 0) return
    const pick = nested[Math.floor(random() * nested.length)]!
    selectOptionNode(model, selected, game, pick, random)
    return
  }

  const toSelect = selectableDescendants(option, game, selected)
  selectComponents(selected, toSelect)
  for (const c of toSelect) {
    applyAlternativesExclusion(model, selected, c)
  }
  applyCoreOnSelect(model, selected, game, option)
}

function selectRandomUnit(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  unit: RandomUnit,
  random: () => number,
) {
  if (unit.kind === 'component') {
    selected.add(unit.component.componentId)
    applyAlternativesExclusion(model, selected, unit.component)
    applyCoreOnSelect(model, selected, game, unit.component)
    return
  }

  const alts = unit.display.node
  clearComponents(selected, eligibleComponents(allComponentDescendants(alts), game))
  const options = eligibleAltOptions(alts, game)
  if (options.length === 0) return
  const pick = options[Math.floor(random() * options.length)]!
  selectOptionNode(model, selected, game, pick, random)
}

/** Fisher–Yates shuffle; returns first `k` indices of a length-`n` range. */
function sampleIndices(n: number, k: number, random: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = idx[i]!
    idx[i] = idx[j]!
    idx[j] = tmp
  }
  return idx.slice(0, Math.max(0, Math.min(k, n)))
}

/**
 * Randomly check a percentage of selectable units under a display branch.
 * Does not change expand/collapse state — selection only.
 */
export function randomizeDisplaySubtree(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
  display: DisplayNode,
  options: RandomizeOptions,
): SelectionSet {
  const random = options.random ?? Math.random
  const units = collectRandomUnits(display, game)
  const wantCount = Math.round((units.length * options.percent) / 100)

  const next = new Set(selected)

  if (!options.keepSelected) {
    clearComponents(next, collectDisplayClearTargets(display, game))
    const picks = sampleIndices(units.length, wantCount, random)
    for (const i of picks) {
      selectRandomUnit(model, next, game, units[i]!, random)
    }
  } else {
    const on: RandomUnit[] = []
    const off: RandomUnit[] = []
    for (const u of units) {
      if (unitIsSelected(u, next, game)) on.push(u)
      else off.push(u)
    }

    if (on.length < wantCount) {
      const need = wantCount - on.length
      const picks = sampleIndices(off.length, need, random)
      for (const i of picks) {
        selectRandomUnit(model, next, game, off[i]!, random)
      }
    } else if (on.length > wantCount) {
      const drop = on.length - wantCount
      const picks = sampleIndices(on.length, drop, random)
      for (const i of picks) {
        clearRandomUnit(next, on[i]!, game)
      }
    }
  }

  applyAlwaysIf(model, next, game)
  return next
}
