import type { PresetLayoutSection } from '../../data/presetCatalog'
import { engineMatches } from '../engine/matchEngine'
import { resolveModLookupKey } from '../mods/loadMods'
import { passesOwnAndAncestorDisplayGates } from '../selection/treeAncestry'
import { packageLabel, recommendedLabel } from './labels'
import {
  STATION_ORDER,
  type ComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
} from '../xml/schema'

export interface RecommendedPackageTile {
  token: string
  label: string
}

export interface RecommendedGroup {
  token: string
  label: string
  /** True when at least one eligible component has this recommended token and no package. */
  hasBase: boolean
  packages: RecommendedPackageTile[]
}

export interface RecommendedContentCounts {
  components: number
  mods: number
}

function isEligibleForCatalog(
  model: InstallSequenceModel,
  component: ComponentNode,
  game: SelectedGame,
  selected: ReadonlySet<string>,
): boolean {
  if (component.attrs.noDisplay) return false
  if (!engineMatches(component.effectiveEngine, game)) return false
  return passesOwnAndAncestorDisplayGates(model, component, selected)
}

/** Ordered recommended groups + nested packages for the active game. */
export function buildRecommendedCatalog(
  model: InstallSequenceModel,
  game: SelectedGame,
  selected: ReadonlySet<string> = new Set(),
): RecommendedGroup[] {
  const recommendedOrder: string[] = []
  const recommendedSeen = new Set<string>()
  const hasBaseByRecommended = new Map<string, boolean>()
  const packagesByRecommended = new Map<string, Map<string, true>>()
  const packageOrder = new Map<string, string[]>()

  for (const c of model.componentsInOrder) {
    if (!isEligibleForCatalog(model, c, game, selected)) continue
    const rec = c.effectiveRecommended
    if (!rec) continue

    if (!recommendedSeen.has(rec)) {
      recommendedSeen.add(rec)
      recommendedOrder.push(rec)
      hasBaseByRecommended.set(rec, false)
      packagesByRecommended.set(rec, new Map())
      packageOrder.set(rec, [])
    }

    const pkg = c.effectivePackage
    if (!pkg) {
      hasBaseByRecommended.set(rec, true)
      continue
    }
    const pkgMap = packagesByRecommended.get(rec)!
    if (!pkgMap.has(pkg)) {
      pkgMap.set(pkg, true)
      packageOrder.get(rec)!.push(pkg)
    }
  }

  const stationRank = new Map(STATION_ORDER.map((id, i) => [id, i]))
  recommendedOrder.sort((a, b) => {
    const ra = stationRank.get(a as (typeof STATION_ORDER)[number])
    const rb = stationRank.get(b as (typeof STATION_ORDER)[number])
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return recommendedOrder.indexOf(a) - recommendedOrder.indexOf(b)
  })

  return recommendedOrder
    .filter(
      (token) =>
        hasBaseByRecommended.get(token) === true ||
        (packageOrder.get(token)?.length ?? 0) > 0,
    )
    .map((token) => ({
      token,
      label: recommendedLabel(token),
      hasBase: hasBaseByRecommended.get(token) === true,
      packages: (packageOrder.get(token) ?? []).map((pkg) => ({
        token: pkg,
        label: packageLabel(model, pkg),
      })),
    }))
}

function countComponents(
  model: InstallSequenceModel,
  game: SelectedGame,
  selected: ReadonlySet<string>,
  match: (c: ComponentNode) => boolean,
): RecommendedContentCounts {
  const modKeys = new Set<string>()
  let components = 0
  for (const c of model.componentsInOrder) {
    if (!isEligibleForCatalog(model, c, game, selected)) continue
    if (!match(c)) continue
    components += 1
    modKeys.add(resolveModLookupKey(model, c)?.trim() || c.componentId)
  }
  return { components, mods: modKeys.size }
}

export function countRecommendedContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  token: string,
  selected: ReadonlySet<string> = new Set(),
): RecommendedContentCounts {
  return countComponents(
    model,
    game,
    selected,
    (c) => c.effectiveRecommended === token && !c.effectivePackage,
  )
}

export function countPackageContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  token: string,
  selected: ReadonlySet<string> = new Set(),
): RecommendedContentCounts {
  return countComponents(model, game, selected, (c) => c.effectivePackage === token)
}

export function countAllRecommendedContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  groups: readonly RecommendedGroup[],
  selected: ReadonlySet<string> = new Set(),
): Record<string, RecommendedContentCounts> {
  const out: Record<string, RecommendedContentCounts> = {}
  for (const group of groups) {
    out[group.token] = countRecommendedContent(model, game, group.token, selected)
    for (const pkg of group.packages) {
      out[`package:${pkg.token}`] = countPackageContent(model, game, pkg.token, selected)
    }
  }
  return out
}

export function catalogGroupByToken(
  groups: readonly RecommendedGroup[],
): Map<string, RecommendedGroup> {
  return new Map(groups.map((g) => [g.token, g]))
}

export interface ResolvedPresetLayoutCell {
  token: string
  group: RecommendedGroup
}

export interface ResolvedPresetLayoutRow {
  cells: ResolvedPresetLayoutCell[]
}

export interface ResolvedPresetLayoutSection {
  label: string
  rows: ResolvedPresetLayoutRow[]
}

/** Whitelist layout tokens against live catalog groups; omit empty rows/sections. */
export function resolvePresetLayout(
  layout: readonly PresetLayoutSection[],
  groups: readonly RecommendedGroup[],
): ResolvedPresetLayoutSection[] {
  const byToken = catalogGroupByToken(groups)
  const out: ResolvedPresetLayoutSection[] = []
  for (const section of layout) {
    const rows: ResolvedPresetLayoutRow[] = []
    for (const row of section.rows) {
      const cells: ResolvedPresetLayoutCell[] = []
      for (const token of row.tokens) {
        const group = byToken.get(token)
        if (group) cells.push({ token, group })
      }
      if (cells.length > 0) rows.push({ cells })
    }
    if (rows.length > 0) out.push({ label: section.label, rows })
  }
  return out
}
