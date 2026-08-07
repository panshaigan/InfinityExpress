import type { DisplayNode } from '../lib/selection/visibility'

/** Canonical Content subbranch button order (presence still dynamic). */
export const CONTENT_SUBBRANCH_ORDER = [
  'restorations',
  'restructure',
  'quest',
  'npc',
  'items',
  'tweaks',
] as const

/** Content subbranches that show mods.csv Type badges in the tree list. */
export const MOD_TYPE_BADGE_SECTIONS = new Set<string>([
  'restorations',
  'restructure',
  'quest',
])

const ORDER_INDEX = new Map<string, number>(
  CONTENT_SUBBRANCH_ORDER.map((tag, i) => [tag, i]),
)

/** Sort subbranches into canonical order; unknown tags append in document order. */
export function sortContentSubBranches(branches: DisplayNode[]): DisplayNode[] {
  return branches
    .map((branch, index) => ({ branch, index }))
    .sort((a, b) => {
      const ai = ORDER_INDEX.get(a.branch.node.tag) ?? CONTENT_SUBBRANCH_ORDER.length
      const bi = ORDER_INDEX.get(b.branch.node.tag) ?? CONTENT_SUBBRANCH_ORDER.length
      if (ai !== bi) return ai - bi
      return a.index - b.index
    })
    .map(({ branch }) => branch)
}
