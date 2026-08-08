/** Ladder levels in cumulative order (low → high). */
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

/** One-line hints for Engine / station level cards (optional). */
export const LEVEL_HINTS: Record<string, string> = {
  fixes: 'Stability first',
  restoration: 'Restored cut content',
  vanillaPlus:
    'QoL tweaks, subtle additions, and corrections in line with vanilla',
  blendWell: 'Expanded, but not overwhelming',
  extended: 'Lots of additional content and changes',
}

/** Hover recommendations for Engine base-component cards. */
export const LEVEL_RECOMMENDATIONS: Partial<Record<LadderLevel, string>> = {
  vanillaPlus: "Recommended if you've never played the original game",
  blendWell:
    "Recommended if you've already played, but don't want big changes",
  extended:
    "Recommended if you're okay with adding a lot of new content and changing some game mechanics",
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
 * When checking a ladder rank, enable all lower ranks too (prefix).
 * Unchecking removes only that rank.
 */
export function toggleLadderPrefix(
  ladder: ReadonlySet<LadderLevel>,
  level: LadderLevel,
  wantChecked: boolean,
): Set<LadderLevel> | null {
  const idx = LADDER_LEVELS.indexOf(level)
  if (idx === -1) return null
  const next = new Set(ladder)
  if (wantChecked) {
    for (let i = 0; i <= idx; i++) next.add(LADDER_LEVELS[i]!)
  } else {
    next.delete(level)
  }
  return next
}
