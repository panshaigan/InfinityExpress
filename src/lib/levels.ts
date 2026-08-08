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

/** Engine tile summary + tooltip copy for a level card. */
export interface LevelInfo {
  summary: string
  typeAndDepth: string
  recommendedFor: string
}

/** Ladder level copy shown on Engine tiles and hover tips. */
export const LADDER_LEVEL_INFO: Record<LadderLevel, LevelInfo> = {
  fixes: {
    summary:
      'Essential stability, logic, and bug-correction patches for the base engine and game data.',
    typeAndDepth:
      'Low mechanical impact. Focuses strictly on fixing technical bugs, alignment inconsistencies, broken quest logic, and text/dialogue errors without altering core gameplay systems or adding new narrative elements.',
    recommendedFor:
      'Everyone. Essential for all players to ensure a smooth, stable, and error-free experience.',
  },
  restoration: {
    summary:
      'Reinstates cut, unfinished, or unused content directly from the original game files.',
    typeAndDepth:
      'Low to moderate impact. Restores scrapped areas, cut dialogue options, missing encounters, and unused graphics/audio that were created by the original developers but omitted from the final release.',
    recommendedFor:
      'Purists and returning veterans who want to experience the complete original vision of the developers without introducing fan-made storylines.',
  },
  vanillaPlus: {
    summary:
      'Quality-of-life enhancements and subtle mechanical polish that stay faithful to original game design.',
    typeAndDepth:
      'Low to moderate impact. Focuses on interface/UI enhancements, minor dialogue polish, quality-of-life conveniences, and light roleplay/encounter refinements that seamlessly feel like native base-game features.',
    recommendedFor:
      'First-time players and modernizers looking for a refined experience that preserves the authentic feel of the original game while removing dated clunkiness.',
  },
  blendWell: {
    summary:
      'Thoughtfully integrated fan-made modifications designed to match original tone, balance, and lore seamlessly.',
    typeAndDepth:
      'Moderate impact. Introduces lore-friendly rebalances to items, economy, and quests, along with well-integrated post-game or campaign-restructuring elements without breaking game balance or narrative immersion.',
    recommendedFor:
      'Experienced players seeking fresh, meaningful gameplay updates and seamless content expansions that feel completely natural in the game world.',
  },
  extended: {
    summary:
      'Substantial, transformative content additions including expanded systems, companion content, and major quest modifications.',
    typeAndDepth:
      'High impact. Significantly alters game flow by introducing major narrative overhauls, entirely new areas, expanded companion banters/quests, forgeable end-game artifacts, and sequence breaks.',
    recommendedFor:
      'Series veterans looking to heavily customize their playthrough, overhaul major plot points, or add a vast amount of new content to keep the game fresh.',
  },
}

/** Difficulty opt-in copy shown on Engine tiles and hover tips. */
export const DIFFICULTY_LEVEL_INFO: Record<DifficultyLevel, LevelInfo> = {
  lowerDifficulty: {
    summary:
      'Adjustments designed to ease combat mechanics, reduce game friction, and make encounters less punitive.',
    typeAndDepth:
      'Low to moderate impact. Focuses on weakening enemy stats, increasing player utility, removing frustrating mechanics (e.g., instant-death traps or permanent level drain), and granting more forgiving resource availability.',
    recommendedFor:
      'Casual players or story-focused gamers who want to experience the narrative, dialogue, and exploration without getting bogged down by high tactical difficulty or unforgiving combat.',
  },
  higherDifficulty: {
    summary:
      "Tactical overhauls and tactical enhancements aimed at dramatically increasing the game's challenge.",
    typeAndDepth:
      'Moderate to high impact. Introduces smarter enemy AI, tougher party compositions, pre-buffed opponents, stricter resource management, and reworked encounter scripts that demand optimal party builds and tactical strategy.',
    recommendedFor:
      'Tactical veterans and min-maxers looking for a grueling test of game knowledge, strategy, and party synergy.',
  },
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
