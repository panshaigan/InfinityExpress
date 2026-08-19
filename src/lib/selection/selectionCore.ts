import { engineMatches } from '../engine/matchEngine'
import { evalConditionExpr } from './conditions'
import type { DisplayNode } from './visibility'
import {
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
import {
  type SelectionSet,
  allComponentDescendants,
  applyAlternativesExclusion,
  applyCoreOnSelect,
  clearComponents,
  clearableDescendants,
  collectDisplayClearTargets,
  defaultComponentsUnderAlternatives,
  eligibleComponents,
  selectComponents,
  selectableDescendants,
} from './selectionInternals'

export type { SelectionSet } from './selectionInternals'

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
/** True when an ancestor fails displayIf / displayIfNot (not the node itself). */
function ancestorFailsDisplayGates(
  model: InstallSequenceModel,
  node: TreeNode,
  selected: ReadonlySet<string>,
): boolean {
  let cur: TreeNode | undefined = parentOf(model, node)
  while (cur) {
    if (cur.attrs.displayIf && !evalConditionExpr(cur.attrs.displayIf, selected)) {
      return true
    }
    if (cur.attrs.displayIfNot && evalConditionExpr(cur.attrs.displayIfNot, selected)) {
      return true
    }
    cur = parentOf(model, cur)
  }
  return false
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
        // Do not pull companions under containers hidden by display gates.
        if (ancestorFailsDisplayGates(model, c, selected)) continue
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
/**
 * True when this node or an ancestor fails displayIf / displayIfNot.
 * Components held by a currently-true alwaysIf are not considered gated by
 * their own display attrs (xan-style hidden companions), but ancestor gates
 * still prune them (e.g. dedicated-campaign focus hiding Content).
 */
function isDisplayGatedOut(
  model: InstallSequenceModel,
  node: TreeNode,
  selected: ReadonlySet<string>,
): boolean {
  if (ancestorFailsDisplayGates(model, node, selected)) return true

  const heldByAlwaysIf =
    Boolean(node.attrs.alwaysIf) && evalConditionExpr(node.attrs.alwaysIf!, selected)
  if (heldByAlwaysIf) return false

  if (node.attrs.displayIf && !evalConditionExpr(node.attrs.displayIf, selected)) {
    return true
  }
  if (node.attrs.displayIfNot && evalConditionExpr(node.attrs.displayIfNot, selected)) {
    return true
  }
  return false
}
/** Deselect non-required components gated out by displayIf / displayIfNot. */
export function pruneDisplayGatedSelections(
  model: InstallSequenceModel,
  selected: SelectionSet,
): void {
  let guard = 0
  while (guard++ < 50) {
    let changed = false
    for (const c of model.componentsInOrder) {
      if (!selected.has(c.componentId)) continue
      if (c.attrs.required) continue
      if (!isDisplayGatedOut(model, c, selected)) continue
      selected.delete(c.componentId)
      changed = true
    }
    if (!changed) break
  }
}

export function finalizeSelection(
  model: InstallSequenceModel,
  selected: SelectionSet,
  game: SelectedGame,
): void {
  applyAlwaysIf(model, selected, game)
  pruneDisplayGatedSelections(model, selected)
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
  finalizeSelection(model, selected, game)
  return selected
}

/** Required + alwaysIf, plus installed ids (installed alternative wins). */
export function selectionFromInstalledIds(
  model: InstallSequenceModel,
  game: SelectedGame,
  installedIds: ReadonlySet<string>,
): SelectionSet {
  const next = createInitialSelection(model, game)
  return mergeInstalledIdsIntoSelection(model, game, next, installedIds)
}

/** Add identified installed ids onto an existing selection (WeiDU path appeared later). */
export function mergeInstalledIdsIntoSelection(
  model: InstallSequenceModel,
  game: SelectedGame,
  selected: ReadonlySet<string>,
  installedIds: ReadonlySet<string>,
): SelectionSet {
  const next = new Set(selected)
  const selectedNodes: ComponentNode[] = []
  for (const c of model.componentsInOrder) {
    if (!installedIds.has(c.componentId)) continue
    if (!engineMatches(c.effectiveEngine, game)) continue
    next.add(c.componentId)
    selectedNodes.push(c)
  }
  for (const node of selectedNodes) {
    applyAlternativesExclusion(model, next, node)
  }
  finalizeSelection(model, next, game)
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

  finalizeSelection(model, next, game)
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

  finalizeSelection(model, next, game)
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
  finalizeSelection(model, selected, game)
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
