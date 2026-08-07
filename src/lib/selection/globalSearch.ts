import { engineMatches } from '../engine/matchEngine'
import { resolveModLookupKey, type ModInfo } from '../mods/loadMods'
import {
  STATION_LABELS,
  STATION_ORDER,
  isComponentNode,
  type ComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
  type StationId,
  type TreeNode,
} from '../xml/schema'
import {
  normalizeSearchQuery,
  searchFieldsFromAttrs,
  searchRelevanceScore,
} from './componentSearch'
import {
  leafMatchesCriteria,
  type FilterCriteria,
  type FilterModContext,
  type FilterSeedOptions,
  type FilterSelectionContext,
} from './filterDisplayTree'
import { stationChildrenForGame } from './stationDisplayTree'
import {
  findEnclosingAlternatives,
  passesDisplayGates,
} from './treeAncestry'
import { isEngineAndDisplayEligible } from './visibility'

export interface GlobalSearchHit {
  component: ComponentNode
  /** Inline path labels: Station › … › parents (excludes the leaf label). */
  pathLabels: string[]
  stationId: StationId
  /** True when engine + displayIf chain allows UI selection / jump. */
  eligible: boolean
  /** Same as eligible for v1 (blocked when gated). */
  checkable: boolean
  relevance: number
}

function pathLabel(node: TreeNode): string {
  return node.attrs.label ?? node.tag
}

function alternativesHasSelection(
  alts: TreeNode,
  selectedIds: ReadonlySet<string>,
): boolean {
  function walk(n: TreeNode): boolean {
    if (isComponentNode(n)) return selectedIds.has(n.componentId)
    return n.children.some(walk)
  }
  return walk(alts)
}

function passesUncheckedFilter(
  model: InstallSequenceModel,
  component: ComponentNode,
  criteria: FilterCriteria,
  selection: FilterSelectionContext | undefined,
  gatedHere: boolean,
): boolean {
  const mode = criteria.uncheckedFilter
  if (mode === 'off' || !selection) return true

  const selected = selection.selectedIds.has(component.componentId)
  const alts = findEnclosingAlternatives(model, component)

  if (mode === 'withOptions') {
    if (alts) return true
    return !selected
  }

  if (mode === 'only') {
    if (alts) return !alternativesHasSelection(alts, selection.selectedIds)
    return !selected
  }

  // dependencies
  if (selected) return false
  return gatedHere
}

interface WalkCtx {
  game: SelectedGame
  selectedIds: ReadonlySet<string>
  stationId: StationId
  out: Omit<GlobalSearchHit, 'relevance'>[]
}

function walkNodes(
  ctx: WalkCtx,
  nodes: TreeNode[],
  pathLabels: string[],
  ancestorsEligible: boolean,
  underDisplayIf: boolean,
  gatedAcc: Map<string, boolean>,
) {
  for (const node of nodes) {
    if (!engineMatches(node.effectiveEngine, ctx.game)) continue

    const selfGatesOk = passesDisplayGates(node, ctx.selectedIds)
    const selfEligible =
      engineMatches(node.effectiveEngine, ctx.game) && selfGatesOk
    const eligibleHere = ancestorsEligible && selfEligible
    const gatedHere = underDisplayIf || Boolean(node.attrs.displayIf?.trim())

    if (isComponentNode(node)) {
      if (node.attrs.noExport) continue
      gatedAcc.set(node.componentId, gatedHere)
      ctx.out.push({
        component: node,
        pathLabels,
        stationId: ctx.stationId,
        eligible: eligibleHere,
        checkable: eligibleHere,
      })
      continue
    }

    const nextPath = [...pathLabels, pathLabel(node)]
    walkNodes(ctx, node.children, nextPath, eligibleHere, gatedHere, gatedAcc)
  }
}

function collectUniverse(
  model: InstallSequenceModel,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
): { hits: Omit<GlobalSearchHit, 'relevance'>[]; gatedById: Map<string, boolean> } {
  const out: Omit<GlobalSearchHit, 'relevance'>[] = []
  const gatedById = new Map<string, boolean>()

  for (const stationId of STATION_ORDER) {
    const block = model.stations.find((s) => s.stationId === stationId)
    if (!block) continue

    const stationLabel = STATION_LABELS[stationId]
    const ctx: WalkCtx = { game, selectedIds, stationId, out }

    if (stationId === 'content') {
      const children = stationChildrenForGame(block, game)
      for (const main of children) {
        if (!engineMatches(main.effectiveEngine, game)) continue
        if (isComponentNode(main)) {
          const gated = Boolean(main.attrs.displayIf?.trim())
          gatedById.set(main.componentId, gated)
          const eligible = isEngineAndDisplayEligible(main, { game, selectedIds })
          if (!main.attrs.noExport) {
            out.push({
              component: main,
              pathLabels: [stationLabel],
              stationId,
              eligible,
              checkable: eligible,
            })
          }
          continue
        }
        const mainGates = passesDisplayGates(main, selectedIds)
        const mainEligible =
          engineMatches(main.effectiveEngine, game) && mainGates
        const mainGated = Boolean(main.attrs.displayIf?.trim())
        const mainLabel = pathLabel(main)

        for (const sub of main.children) {
          if (!engineMatches(sub.effectiveEngine, game)) continue
          if (isComponentNode(sub)) {
            const gated = mainGated || Boolean(sub.attrs.displayIf?.trim())
            gatedById.set(sub.componentId, gated)
            const eligible =
              mainEligible &&
              isEngineAndDisplayEligible(sub, { game, selectedIds })
            if (!sub.attrs.noExport) {
              out.push({
                component: sub,
                pathLabels: [stationLabel, mainLabel],
                stationId,
                eligible,
                checkable: eligible,
              })
            }
            continue
          }
          const subGates = passesDisplayGates(sub, selectedIds)
          const subEligible = mainEligible && subGates
          const subGated = mainGated || Boolean(sub.attrs.displayIf?.trim())
          const subLabel = pathLabel(sub)
          walkNodes(
            ctx,
            sub.children,
            [stationLabel, mainLabel, subLabel],
            subEligible,
            subGated,
            gatedById,
          )
        }
      }
      continue
    }

    walkNodes(ctx, block.children, [stationLabel], true, false, gatedById)
  }

  return { hits: out, gatedById }
}

function resolveMod(
  model: InstallSequenceModel,
  component: ComponentNode,
  modsByCodename: ReadonlyMap<string, ModInfo>,
): ModInfo | undefined {
  const key = resolveModLookupKey(model, component)
  if (!key) return undefined
  return modsByCodename.get(key)
}

/**
 * Flat global search results across all stations for the selected engine.
 * Always includes hidden/required; excludes noExport; gated rows stay listed
 * but `eligible`/`checkable` are false when displayIf chain fails.
 */
export function buildGlobalSearchResults(
  model: InstallSequenceModel,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
  criteria: FilterCriteria,
  modCtx: FilterModContext,
  seed: Omit<FilterSeedOptions, 'tagOptions'> = {},
  selection?: FilterSelectionContext,
): GlobalSearchHit[] {
  const { hits: universe, gatedById } = collectUniverse(model, game, selectedIds)
  const q = normalizeSearchQuery(criteria.search)
  const scored: GlobalSearchHit[] = []

  for (const hit of universe) {
    const gatedHere = gatedById.get(hit.component.componentId) ?? false
    if (
      !passesUncheckedFilter(model, hit.component, criteria, selection, gatedHere)
    ) {
      continue
    }

    const display = { node: hit.component, children: [] }
    if (
      !leafMatchesCriteria(display, criteria, modCtx, seed, {
        forceShowHidden: true,
        ancestorLabels: hit.pathLabels,
      })
    ) {
      continue
    }

    const mod = resolveMod(model, hit.component, modCtx.modsByCodename)
    const fields = searchFieldsFromAttrs(hit.component.attrs, {
      componentId: hit.component.componentId,
      fallbackLabel: hit.component.tag,
      mod,
      ancestorLabels: hit.pathLabels,
    })
    const relevance = q ? searchRelevanceScore(fields, q) : 0
    scored.push({ ...hit, relevance })
  }

  scored.sort((a, b) => {
    if (q) {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance
    }
    return a.component.orderIndex - b.component.orderIndex
  })

  return scored
}

/** Format path labels for inline display. */
export function formatSearchPath(pathLabels: readonly string[]): string {
  return pathLabels.join(' › ')
}
