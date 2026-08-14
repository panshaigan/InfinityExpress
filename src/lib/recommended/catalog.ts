import { engineMatches } from '../engine/matchEngine'
import { resolveModLookupKey } from '../mods/loadMods'
import {
  STATION_LABELS,
  STATION_ORDER,
  isStationTag,
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
  packages: RecommendedPackageTile[]
}

export interface RecommendedContentCounts {
  components: number
  mods: number
}

function recommendedLabel(token: string): string {
  if (isStationTag(token)) return STATION_LABELS[token]
  return token
}

/** Label from the nearest ancestor that declares this package token. */
function packageLabel(model: InstallSequenceModel, packageToken: string): string {
  for (const node of model.nodesByKey.values()) {
    if (node.attrs.package === packageToken) {
      const label = node.attrs.label?.trim()
      if (label) return label
    }
  }
  return packageToken
}

function isEligibleForCatalog(
  noDisplay: boolean | undefined,
  engine: string,
  game: SelectedGame,
): boolean {
  if (noDisplay) return false
  return engineMatches(engine, game)
}

/** Ordered recommended groups + nested packages for the active game. */
export function buildRecommendedCatalog(
  model: InstallSequenceModel,
  game: SelectedGame,
): RecommendedGroup[] {
  const recommendedOrder: string[] = []
  const recommendedSeen = new Set<string>()
  const packagesByRecommended = new Map<string, Map<string, true>>()
  const packageOrder = new Map<string, string[]>()

  for (const c of model.componentsInOrder) {
    if (!isEligibleForCatalog(c.attrs.noDisplay, c.effectiveEngine, game)) {
      continue
    }
    const rec = c.effectiveRecommended
    if (!rec) continue

    if (!recommendedSeen.has(rec)) {
      recommendedSeen.add(rec)
      recommendedOrder.push(rec)
      packagesByRecommended.set(rec, new Map())
      packageOrder.set(rec, [])
    }

    const pkg = c.effectivePackage
    if (!pkg) continue
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

  return recommendedOrder.map((token) => ({
    token,
    label: recommendedLabel(token),
    packages: (packageOrder.get(token) ?? []).map((pkg) => ({
      token: pkg,
      label: packageLabel(model, pkg),
    })),
  }))
}

function countComponents(
  model: InstallSequenceModel,
  game: SelectedGame,
  match: (c: (typeof model.componentsInOrder)[number]) => boolean,
): RecommendedContentCounts {
  const modKeys = new Set<string>()
  let components = 0
  for (const c of model.componentsInOrder) {
    if (c.attrs.noDisplay) continue
    if (!engineMatches(c.effectiveEngine, game)) continue
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
): RecommendedContentCounts {
  return countComponents(
    model,
    game,
    (c) => c.effectiveRecommended === token && !c.effectivePackage,
  )
}

export function countPackageContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  token: string,
): RecommendedContentCounts {
  return countComponents(model, game, (c) => c.effectivePackage === token)
}

export function countAllRecommendedContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  groups: readonly RecommendedGroup[],
): Record<string, RecommendedContentCounts> {
  const out: Record<string, RecommendedContentCounts> = {}
  for (const group of groups) {
    out[group.token] = countRecommendedContent(model, game, group.token)
    for (const pkg of group.packages) {
      out[`package:${pkg.token}`] = countPackageContent(model, game, pkg.token)
    }
  }
  return out
}
