/** Ladder levels in cumulative order (low → high). */
export const LADDER_LEVELS = [
  'fixes',
  'restoration',
  'vanillaPlus',
  'blendWell',
  'quality',
] as const

export type LadderLevel = (typeof LADDER_LEVELS)[number]

/** Known install-sequence level tokens and user-facing UI labels. */
export const LEVEL_LABELS: Record<string, string> = {
  fixes: 'Fixes',
  restoration: 'Restorations',
  vanillaPlus: 'Vanilla+ (QoL)',
  blendWell: 'Well blended',
  restructure: 'Restructure',
  quality: 'Quality',
  difficulty: 'Difficulty',
}

/** Levels shown as filter chips (restructure shares Well blended). */
export const FILTER_LADDER_LEVELS: LadderLevel[] = [...LADDER_LEVELS]

export function levelBadgeLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level
}

export function levelBadgeClass(level: string): string {
  const known = level in LEVEL_LABELS ? level : 'unknown'
  return `badge badge-level badge-level-${known}`
}

/**
 * Filter rank for cumulative / exact matching.
 * `restructure` shares Well blended. `difficulty` and unknown → null.
 */
export function levelFilterRank(level: string | undefined): number | null {
  if (!level) return null
  if (level === 'difficulty') return null
  const token = level === 'restructure' ? 'blendWell' : level
  const idx = LADDER_LEVELS.indexOf(token as LadderLevel)
  return idx >= 0 ? idx : null
}

/**
 * Whether a node's effectiveLevel passes the level filter.
 * No ladder selection → everything passes (Difficulty toggle ignored).
 * Missing level fails when a ladder filter is active (treated as above the ladder).
 * Difficulty only when `includeDifficulty` is on.
 */
export function levelPassesFilter(
  level: string | undefined,
  maxLevel: string | null,
  exact: boolean,
  includeDifficulty: boolean,
): boolean {
  if (maxLevel === null) return true
  if (!level) return false
  if (level === 'difficulty') return includeDifficulty

  const nodeRank = levelFilterRank(level)
  if (nodeRank === null) return false

  const maxRank = levelFilterRank(maxLevel)
  if (maxRank === null) return false

  if (exact) return nodeRank === maxRank
  return nodeRank <= maxRank
}
