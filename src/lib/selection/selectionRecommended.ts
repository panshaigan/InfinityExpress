import { engineMatches } from '../engine/matchEngine'
import {
  type LevelSelectionScope,
} from './selectionLevels'
import { passesDisplayGates, findEnclosingAlternatives, findEnclosingMod } from './treeAncestry'
import {
  type ComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
} from '../xml/schema'
import {
  type SelectionSet,
  allComponentDescendants,
  applyAlternativesExclusion,
  eligibleComponents,
} from './selectionInternals'
import { createInitialSelection, finalizeSelection } from './selectionCore'

function inScope(componentId: string, scope: LevelSelectionScope): boolean {
  return scope == null || scope.has(componentId)
}

function matchesRecommendedBase(c: ComponentNode, token: string): boolean {
  return c.effectiveRecommended === token && !c.effectivePackage
}

function matchesPackage(c: ComponentNode, token: string): boolean {
  return c.effectivePackage === token
}

/** Among matching candidates, keep one option per alternatives group (prefer default). */
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
    let best = comps[0]!
    for (let i = 1; i < comps.length; i++) {
      const c = comps[i]!
      if (c.attrs.default && !best.attrs.default) best = c
    }
    out.push(best)
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
  scope?: LevelSelectionScope,
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
  scope?: LevelSelectionScope,
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

/** Pure selection from initial + checked recommended/package tiles (no levels). */
export function buildRecommendedBaselineSelection(
  model: InstallSequenceModel,
  game: SelectedGame,
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
): SelectionSet {
  let next = createInitialSelection(model, game)
  for (const token of [...checkedRecommended].sort()) {
    next = setRecommendedSelection(model, next, game, token, true)
  }
  for (const token of [...checkedPackages].sort()) {
    next = setPackageSelection(model, next, game, token, true)
  }
  return next
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
