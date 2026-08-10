import { engineMatches } from '../engine/matchEngine'
import {
  isDifficultyLevel,
  levelFilterRank,
  type DifficultyLevel,
  type LadderLevel,
} from '../levels'
import { resolveModLookupKey } from '../mods/loadMods'
import type { InstallSequenceModel, SelectedGame } from '../xml/schema'

export interface LevelContentCounts {
  components: number
  mods: number
}

/** Exact (non-cumulative) component/mod counts for one ladder or difficulty level. */
export function countLevelContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  level: LadderLevel | DifficultyLevel,
): LevelContentCounts {
  const targetRank = isDifficultyLevel(level) ? null : levelFilterRank(level)
  const modKeys = new Set<string>()
  let components = 0

  for (const c of model.componentsInOrder) {
    if (c.attrs.noDisplay) continue
    if (!engineMatches(c.effectiveEngine, game)) continue

    if (isDifficultyLevel(level)) {
      if (c.effectiveLevel !== level) continue
    } else {
      const rank = levelFilterRank(c.effectiveLevel)
      if (rank === null || rank !== targetRank) continue
    }

    components += 1
    modKeys.add(resolveModLookupKey(model, c)?.trim() || c.componentId)
  }

  return { components, mods: modKeys.size }
}

/** Counts for every ladder + difficulty token shown on the Presets strip. */
export function countAllLevelContent(
  model: InstallSequenceModel,
  game: SelectedGame,
  levels: readonly (LadderLevel | DifficultyLevel)[],
): Record<string, LevelContentCounts> {
  const out: Record<string, LevelContentCounts> = {}
  for (const level of levels) {
    out[level] = countLevelContent(model, game, level)
  }
  return out
}
