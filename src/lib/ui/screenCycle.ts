import { sortContentSubBranches } from '../contentBranchOrder'
import type { DisplayNode } from '../selection/visibility'
import type { StationId } from '../xml/schema'

/** One stop in the Previous/Next cycle (Engine excluded). */
export type NavScreen =
  | { stationId: Exclude<StationId, 'content'> }
  | { stationId: 'content'; mainKey: string; subKey: string; subTag: string }

export function navScreensEqual(a: NavScreen, b: NavScreen): boolean {
  if (a.stationId !== b.stationId) return false
  if (a.stationId === 'content' && b.stationId === 'content') {
    return a.mainKey === b.mainKey && a.subKey === b.subKey
  }
  return true
}

/** Expand one station's filtered display tree into cycle stops. */
export function expandStationToScreens(
  stationId: StationId,
  displayNodes: DisplayNode[],
): NavScreen[] {
  if (stationId === 'content') {
    const out: NavScreen[] = []
    for (const main of displayNodes) {
      for (const sub of sortContentSubBranches(main.children)) {
        if (sub.children.length === 0) continue
        out.push({
          stationId: 'content',
          mainKey: main.node.key,
          subKey: sub.node.key,
          subTag: sub.node.tag,
        })
      }
    }
    return out
  }
  if (displayNodes.length === 0) return []
  return [{ stationId }]
}

/**
 * Build the full Previous/Next cycle from station order + filtered trees.
 * `stationIds` should already exclude Engine and follow STATION_ORDER.
 */
export function buildNavigableScreens(
  stationIds: readonly StationId[],
  filteredNodesFor: (stationId: StationId) => DisplayNode[],
): NavScreen[] {
  const out: NavScreen[] = []
  for (const id of stationIds) {
    out.push(...expandStationToScreens(id, filteredNodesFor(id)))
  }
  return out
}

/**
 * Step ±1 through `screens` with wrap, skipping screens for which `skip` is true.
 * Position is taken from `current` in the full list so skipped neighbours are walked past.
 * When `current` is null or not in the list (e.g. Engine), Next → first eligible,
 * Previous → last eligible.
 */
export function cycleScreen(
  screens: readonly NavScreen[],
  current: NavScreen | null,
  delta: -1 | 1,
  skip?: (screen: NavScreen) => boolean,
): NavScreen | null {
  const isSkipped = skip ?? (() => false)
  const eligible = screens.filter((s) => !isSkipped(s))
  if (eligible.length === 0) return null

  if (current == null) {
    return delta === 1 ? eligible[0]! : eligible[eligible.length - 1]!
  }

  const fullIdx = screens.findIndex((s) => navScreensEqual(s, current))
  if (fullIdx < 0) {
    return delta === 1 ? eligible[0]! : eligible[eligible.length - 1]!
  }

  for (let step = 1; step <= screens.length; step++) {
    const idx =
      (((fullIdx + delta * step) % screens.length) + screens.length) % screens.length
    const candidate = screens[idx]!
    if (!isSkipped(candidate)) return candidate
  }
  return null
}
