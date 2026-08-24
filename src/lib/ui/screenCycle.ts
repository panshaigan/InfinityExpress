import {
  expandBranchScreens,
  isBranchNavStation,
  type FlatStationId,
} from '../stationBranchNav'
import type { DisplayNode } from '../selection/visibility'
import type { StationId } from '../xml/schema'

/** One stop in the Previous/Next cycle (Engine excluded). */
export type NavScreen =
  | { stationId: FlatStationId }
  | {
      stationId: 'content'
      mainKey: string
      subKey: string
      subTag: string
    }
  | { stationId: 'mechanics'; mainKey: string }

export function navScreensEqual(a: NavScreen, b: NavScreen): boolean {
  if (a.stationId !== b.stationId) return false
  if (a.stationId === 'content' && b.stationId === 'content') {
    return a.mainKey === b.mainKey && a.subKey === b.subKey
  }
  if (a.stationId === 'mechanics' && b.stationId === 'mechanics') {
    return a.mainKey === b.mainKey
  }
  return true
}

/** Expand one station's filtered display tree into cycle stops. */
export function expandStationToScreens(
  stationId: StationId,
  displayNodes: DisplayNode[],
): NavScreen[] {
  if (isBranchNavStation(stationId)) {
    return expandBranchScreens(stationId, displayNodes)
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

function screenInList(
  screens: readonly NavScreen[],
  screen: NavScreen,
): NavScreen | undefined {
  return screens.find((s) => navScreensEqual(s, screen))
}

/**
 * When `missing` drops out of the cycle (e.g. Unchecked filter emptied it),
 * pick the next remaining unfinished screen after its former position, wrapping.
 */
export function advancePastMissingScreen(
  previousScreens: readonly NavScreen[],
  missing: NavScreen,
  nextScreens: readonly NavScreen[],
  skip?: (screen: NavScreen) => boolean,
): NavScreen | null {
  const isSkipped = skip ?? (() => false)
  const eligible = nextScreens.filter((s) => !isSkipped(s))
  if (eligible.length === 0) return null

  const startIdx = previousScreens.findIndex((s) => navScreensEqual(s, missing))
  if (startIdx < 0) return eligible[0] ?? null

  for (let step = 1; step <= previousScreens.length; step++) {
    const idx = (startIdx + step) % previousScreens.length
    const candidate = previousScreens[idx]!
    if (isSkipped(candidate)) continue
    const live = screenInList(nextScreens, candidate)
    if (live) return live
  }

  return eligible[0] ?? null
}
