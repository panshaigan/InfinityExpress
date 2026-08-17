/** Ladder levels in rank order (low → high); used for filters and alternatives, not preset auto-inclusion. */
export const LADDER_LEVELS = [
  'fixes',
  'restoration',
  'vanillaPlus',
  'blendWell',
  'extended',
] as const

export type LadderLevel = (typeof LADDER_LEVELS)[number]

/** Off-ladder difficulty opt-in tokens (independent of the install ladder). */
export const DIFFICULTY_LEVELS = ['lowerDifficulty', 'higherDifficulty'] as const

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]

/** Known install-sequence level tokens and user-facing UI labels. */
export const LEVEL_LABELS: Record<string, string> = {
  fixes: 'Fixes',
  restoration: 'Restorations',
  vanillaPlus: 'Vanilla+',
  blendWell: 'Well blended',
  restructure: 'Restructure',
  extended: 'Extended',
  lowerDifficulty: 'Lower difficulty',
  higherDifficulty: 'Higher difficulty',
}

/** Levels shown as filter chips (restructure shares Well blended). */
export const FILTER_LADDER_LEVELS: LadderLevel[] = [...LADDER_LEVELS]

export function isDifficultyLevel(level: string | undefined): level is DifficultyLevel {
  return (
    level === 'lowerDifficulty' || level === 'higherDifficulty'
  )
}

export function levelBadgeLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level
}

export function levelBadgeClass(level: string): string {
  const known = level in LEVEL_LABELS ? level : 'unknown'
  return `badge badge-level badge-level-${known}`
}

/**
 * Filter rank for cumulative / exact matching.
 * `restructure` shares Well blended. Difficulty tokens and unknown → null.
 */
export function levelFilterRank(level: string | undefined): number | null {
  if (!level) return null
  if (isDifficultyLevel(level)) return null
  const token = level === 'restructure' ? 'blendWell' : level
  const idx = LADDER_LEVELS.indexOf(token as LadderLevel)
  return idx >= 0 ? idx : null
}

export interface DifficultyFilterIncludes {
  includeLowerDifficulty: boolean
  includeHigherDifficulty: boolean
}

/**
 * Whether a node's effectiveLevel passes the level filter.
 * Difficulty tokens only when their include flag is on (even with no ladder max).
 * No ladder selection → every non-difficulty level passes.
 * Missing level fails when a ladder filter is active (treated as above the ladder).
 */
export function levelPassesFilter(
  level: string | undefined,
  maxLevel: string | null,
  exact: boolean,
  difficultyIncludes: DifficultyFilterIncludes,
): boolean {
  if (level === 'lowerDifficulty') return difficultyIncludes.includeLowerDifficulty
  if (level === 'higherDifficulty') return difficultyIncludes.includeHigherDifficulty
  if (maxLevel === null) return true
  if (!level) return false

  const nodeRank = levelFilterRank(level)
  if (nodeRank === null) return false

  const maxRank = levelFilterRank(maxLevel)
  if (maxRank === null) return false

  if (exact) return nodeRank === maxRank
  return nodeRank <= maxRank
}

/**
 * Toggle one ladder rank in the preset strip set (independent checkboxes).
 * Checking adds only that rank; unchecking removes only that rank.
 */
export function toggleLadderLevel(
  ladder: ReadonlySet<LadderLevel>,
  level: LadderLevel,
  wantChecked: boolean,
): Set<LadderLevel> | null {
  if (!LADDER_LEVELS.includes(level)) return null
  const next = new Set(ladder)
  if (wantChecked) {
    next.add(level)
  } else {
    next.delete(level)
  }
  return next
}
