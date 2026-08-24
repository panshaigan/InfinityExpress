import { engineMatches } from '../engine/matchEngine'
import { passesDisplayGates, findEnclosingAlternatives, findEnclosingMod } from './treeAncestry'
import {
  type ComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
  isComponentNode,
} from '../xml/schema'
import {
  type SelectionSet,
  allComponentDescendants,
  alternativesBranchRoot,
  applyAlternativesExclusion,
  eligibleComponents,
} from './selectionInternals'
import { createInitialSelection, finalizeSelection } from './selectionCore'

/** Optional scope: only touch component ids in this set. Omit for whole install sequence. */
export type SelectionScope = ReadonlySet<string> | undefined

function inScope(componentId: string, scope: SelectionScope): boolean {
  return scope == null || scope.has(componentId)
}

function matchesRecommendedBase(c: ComponentNode, token: string): boolean {
  return c.effectiveRecommended === token && !c.effectivePackage
}

function matchesPackage(c: ComponentNode, token: string): boolean {
  return c.effectivePackage === token
}

function pickPreferredRadio(comps: ComponentNode[]): ComponentNode {
  let best = comps[0]!
  for (let i = 1; i < comps.length; i++) {
    const c = comps[i]!
    if (c.attrs.default && !best.attrs.default) best = c
  }
  return best
}

/**
 * Among matching candidates, keep one radio option or one alternatives branch
 * (prefer default). Branch alternatives keep every matching component in the
 * chosen branch — not a single leaf.
 */
function pickMassCheckCandidates(
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
    const alts = findEnclosingAlternatives(model, comps[0]!)
    if (!alts) {
      out.push(...comps)
      continue
    }
    const hasOnlyComponents = alts.children.every((child) => isComponentNode(child))
    if (hasOnlyComponents) {
      out.push(pickPreferredRadio(comps))
      continue
    }

    const byBranch = new Map<string, ComponentNode[]>()
    const branchOrder: string[] = []
    for (const c of comps) {
      const branch = alternativesBranchRoot(model, alts, c)
      const branchKey = branch?.key ?? c.key
      const list = byBranch.get(branchKey)
      if (list) list.push(c)
      else {
        byBranch.set(branchKey, [c])
        branchOrder.push(branchKey)
      }
    }

    let chosenKey = branchOrder[0]!
    for (const branchKey of branchOrder) {
      if (byBranch.get(branchKey)!.some((c) => c.attrs.default)) {
        chosenKey = branchKey
        break
      }
    }
    out.push(...byBranch.get(chosenKey)!)
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
 * Select or clear components for one recommended token (base only — no package).
 */
export function setRecommendedSelection(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  token: string,
  wantSelected: boolean,
  scope?: SelectionScope,
): SelectionSet {
  const next = new Set(selected)

  if (!wantSelected) {
    for (const c of model.componentsInOrder) {
      if (!inScope(c.componentId, scope)) continue
      if (!matchesRecommendedBase(c, token)) continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (c.attrs.required) continue
      next.delete(c.componentId)
    }
    finalizeSelection(model, next, game)
    return next
  }

  const coreFilter = (c: ComponentNode) =>
    inScope(c.componentId, scope) && matchesRecommendedBase(c, token)
  let guard = 0
  while (guard++ < 50) {
    const candidates: ComponentNode[] = []
    for (const c of model.componentsInOrder) {
      if (!inScope(c.componentId, scope)) continue
      if (!matchesRecommendedBase(c, token)) continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (!passesDisplayGates(c, next)) continue
      candidates.push(c)
    }
    const toSelect = pickMassCheckCandidates(model, candidates)
    if (!selectMassCheckComponents(model, next, game, toSelect, coreFilter)) break
  }

  finalizeSelection(model, next, game)
  return next
}

/**
 * Select or clear components for one package token.
 */
export function setPackageSelection(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  token: string,
  wantSelected: boolean,
  scope?: SelectionScope,
): SelectionSet {
  const next = new Set(selected)

  if (!wantSelected) {
    for (const c of model.componentsInOrder) {
      if (!inScope(c.componentId, scope)) continue
      if (!matchesPackage(c, token)) continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (c.attrs.required) continue
      next.delete(c.componentId)
    }
    finalizeSelection(model, next, game)
    return next
  }

  const coreFilter = (c: ComponentNode) =>
    inScope(c.componentId, scope) && matchesPackage(c, token)
  let guard = 0
  while (guard++ < 50) {
    const candidates: ComponentNode[] = []
    for (const c of model.componentsInOrder) {
      if (!inScope(c.componentId, scope)) continue
      if (!matchesPackage(c, token)) continue
      if (!engineMatches(c.effectiveEngine, game)) continue
      if (!passesDisplayGates(c, next)) continue
      candidates.push(c)
    }
    const toSelect = pickMassCheckCandidates(model, candidates)
    if (!selectMassCheckComponents(model, next, game, toSelect, coreFilter)) break
  }

  finalizeSelection(model, next, game)
  return next
}

/**
 * Re-apply every checked recommended/package tile until selection is stable so
 * displayIf dependents unlocked by another tile get mass-checked too.
 */
export function applyCheckedPresetTiles(
  model: InstallSequenceModel,
  selected: ReadonlySet<string>,
  game: SelectedGame,
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
  scope?: SelectionScope,
): SelectionSet {
  let next = new Set(selected)
  let guard = 0
  while (guard++ < 50) {
    const before = new Set(next)
    for (const token of [...checkedRecommended].sort()) {
      next = setRecommendedSelection(model, next, game, token, true, scope)
    }
    for (const token of [...checkedPackages].sort()) {
      next = setPackageSelection(model, next, game, token, true, scope)
    }
    if (selectionSetsEqual(before, next)) break
  }
  return next
}

/** Pure selection from initial + checked recommended/package tiles (no levels). */
export function buildRecommendedBaselineSelection(
  model: InstallSequenceModel,
  game: SelectedGame,
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
): SelectionSet {
  return applyCheckedPresetTiles(
    model,
    createInitialSelection(model, game),
    game,
    checkedRecommended,
    checkedPackages,
  )
}

function selectionSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) {
    if (!b.has(id)) return false
  }
  return true
}

/** True when live selection matches checked recommended/package tiles alone. */
export function selectionMatchesRecommendedBaseline(
  model: InstallSequenceModel,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
): boolean {
  const expected = buildRecommendedBaselineSelection(
    model,
    game,
    checkedRecommended,
    checkedPackages,
  )
  return selectionSetsEqual(selectedIds, expected)
}
