import { engineMatches } from '../engine/matchEngine'
import type { DisplayNode } from './visibility'
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
  collectDisplayClearTargets,
  eligibleComponents,
  selectComponents,
  selectableDescendants,
} from './selectionInternals'
import { finalizeSelection } from './selectionCore'

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

  finalizeSelection(model, next, game)
  return next
}
