import { engineMatches } from '../engine/matchEngine'
import {
  levelFilterRank,
  type DifficultyLevel,
  type LadderLevel,
} from '../levels'
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
import { finalizeSelection } from './selectionCore'

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

  finalizeSelection(model, next, game)
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
    finalizeSelection(model, next, game)
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

  finalizeSelection(model, next, game)
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
