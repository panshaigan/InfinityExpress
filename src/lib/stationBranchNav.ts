import { sortContentSubBranches } from './contentBranchOrder'
import type { DisplayNode } from './selection/visibility'
import type { StationId } from './xml/schema'

export type BranchNavStationId = 'content' | 'mechanics'

type BranchNavConfig =
  | { depth: 1 }
  | { depth: 2; sortSubs: (branches: DisplayNode[]) => DisplayNode[] }

export const BRANCH_NAV_STATIONS: Record<BranchNavStationId, BranchNavConfig> = {
  content: { depth: 2, sortSubs: sortContentSubBranches },
  mechanics: { depth: 1 },
}

export function isBranchNavStation(id: string): id is BranchNavStationId {
  return id === 'content' || id === 'mechanics'
}

/** One stop produced by expanding a branched station's filtered tree. */
export type BranchNavScreen =
  | {
      stationId: 'content'
      mainKey: string
      subKey: string
      subTag: string
    }
  | { stationId: 'mechanics'; mainKey: string }

/** Expand a branch-nav station into Previous/Next cycle stops. */
export function expandBranchScreens(
  stationId: BranchNavStationId,
  displayNodes: DisplayNode[],
): BranchNavScreen[] {
  if (stationId === 'mechanics') {
    const out: BranchNavScreen[] = []
    for (const main of displayNodes) {
      if (main.children.length === 0) continue
      out.push({ stationId: 'mechanics', mainKey: main.node.key })
    }
    return out
  }

  const out: BranchNavScreen[] = []
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

/** Prefer a Content sub by remembered tag, else first in canonical order. */
export function preferredContentSub(
  main: DisplayNode,
  preferredTag: string | null,
): DisplayNode | null {
  const ordered = sortContentSubBranches(main.children)
  if (preferredTag) {
    const match = ordered.find((c) => c.node.tag === preferredTag)
    if (match) return match
  }
  return ordered[0] ?? null
}

/** Narrow StationId to non-branch-nav stations for flat NavScreen entries. */
export type FlatStationId = Exclude<StationId, BranchNavStationId>
