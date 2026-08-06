import { LADDER_LEVELS, type LadderLevel } from '../levels'
import { GAME_LABELS, type SelectedGame } from '../xml/schema'

export interface StationLevelPresetData {
  ladder: LadderLevel[]
  lowerDifficulty: boolean
  higherDifficulty: boolean
}

/** Serializable selection preset (ready for later file persistence). */
export interface SelectionPreset {
  id: string
  name: string
  game: SelectedGame
  selectedIds: string[]
  ladderChecked: LadderLevel[]
  lowerDifficulty: boolean
  higherDifficulty: boolean
  lastGlobalLadder: LadderLevel[]
  lastGlobalLowerDifficulty: boolean
  lastGlobalHigherDifficulty: boolean
  stationLevelPresets: Record<string, StationLevelPresetData>
}

export interface LiveStationLevelPreset {
  ladder: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
}

export interface SelectionLiveSnapshotInput {
  game: SelectedGame
  selectedIds: ReadonlySet<string>
  ladderChecked: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  lastGlobalLadder: ReadonlySet<LadderLevel>
  lastGlobalLowerDifficulty: boolean
  lastGlobalHigherDifficulty: boolean
  stationLevelPresets: ReadonlyMap<string, LiveStationLevelPreset>
}

export interface AppliedSelectionPreset {
  selectedIds: Set<string>
  ladderChecked: Set<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  lastGlobalLadder: Set<LadderLevel>
  lastGlobalLowerDifficulty: boolean
  lastGlobalHigherDifficulty: boolean
  stationLevelPresets: Map<string, {
    ladder: Set<LadderLevel>
    lowerDifficulty: boolean
    higherDifficulty: boolean
  }>
}

function sortedLadder(levels: Iterable<LadderLevel>): LadderLevel[] {
  const set = levels instanceof Set ? levels : new Set(levels)
  return LADDER_LEVELS.filter((l) => set.has(l))
}

function serializeStationMap(
  map: ReadonlyMap<string, LiveStationLevelPreset>,
): Record<string, StationLevelPresetData> {
  const out: Record<string, StationLevelPresetData> = {}
  const keys = [...map.keys()].sort()
  for (const key of keys) {
    const value = map.get(key)!
    out[key] = {
      ladder: sortedLadder(value.ladder),
      lowerDifficulty: value.lowerDifficulty,
      higherDifficulty: value.higherDifficulty,
    }
  }
  return out
}

/** Payload used for dirty fingerprints (excludes id/name). */
export type SelectionPresetPayload = Omit<SelectionPreset, 'id' | 'name'>

export function payloadFromLive(input: SelectionLiveSnapshotInput): SelectionPresetPayload {
  return {
    game: input.game,
    selectedIds: [...input.selectedIds].sort(),
    ladderChecked: sortedLadder(input.ladderChecked),
    lowerDifficulty: input.lowerDifficulty,
    higherDifficulty: input.higherDifficulty,
    lastGlobalLadder: sortedLadder(input.lastGlobalLadder),
    lastGlobalLowerDifficulty: input.lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty: input.lastGlobalHigherDifficulty,
    stationLevelPresets: serializeStationMap(input.stationLevelPresets),
  }
}

export function payloadFromPreset(preset: SelectionPreset): SelectionPresetPayload {
  return {
    game: preset.game,
    selectedIds: [...preset.selectedIds].sort(),
    ladderChecked: sortedLadder(preset.ladderChecked),
    lowerDifficulty: preset.lowerDifficulty,
    higherDifficulty: preset.higherDifficulty,
    lastGlobalLadder: sortedLadder(preset.lastGlobalLadder),
    lastGlobalLowerDifficulty: preset.lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty: preset.lastGlobalHigherDifficulty,
    stationLevelPresets: serializeStationMap(
      new Map(
        Object.entries(preset.stationLevelPresets).map(([k, v]) => [
          k,
          {
            ladder: new Set(v.ladder),
            lowerDifficulty: v.lowerDifficulty,
            higherDifficulty: v.higherDifficulty,
          },
        ]),
      ),
    ),
  }
}

export function fingerprintPayload(payload: SelectionPresetPayload): string {
  return JSON.stringify(payload)
}

export function fingerprintFromLive(input: SelectionLiveSnapshotInput): string {
  return fingerprintPayload(payloadFromLive(input))
}

export function fingerprintFromPreset(preset: SelectionPreset): string {
  return fingerprintPayload(payloadFromPreset(preset))
}

export function snapshotSelectionPreset(
  id: string,
  name: string,
  input: SelectionLiveSnapshotInput,
): SelectionPreset {
  return { id, name, ...payloadFromLive(input) }
}

export function applySelectionPreset(preset: SelectionPreset): AppliedSelectionPreset {
  const stationLevelPresets = new Map<
    string,
    { ladder: Set<LadderLevel>; lowerDifficulty: boolean; higherDifficulty: boolean }
  >()
  for (const [key, value] of Object.entries(preset.stationLevelPresets)) {
    stationLevelPresets.set(key, {
      ladder: new Set(value.ladder),
      lowerDifficulty: value.lowerDifficulty,
      higherDifficulty: value.higherDifficulty,
    })
  }
  return {
    selectedIds: new Set(preset.selectedIds),
    ladderChecked: new Set(preset.ladderChecked),
    lowerDifficulty: preset.lowerDifficulty,
    higherDifficulty: preset.higherDifficulty,
    lastGlobalLadder: new Set(preset.lastGlobalLadder),
    lastGlobalLowerDifficulty: preset.lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty: preset.lastGlobalHigherDifficulty,
    stationLevelPresets,
  }
}

export function autoPresetName(
  game: SelectedGame,
  selectedCount: number,
  date: Date = new Date(),
): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${GAME_LABELS[game]} · ${selectedCount} comps · ${hh}:${mm}`
}

/**
 * Ensure `desired` is unique among `existingNames`.
 * Appends ` (2)`, ` (3)`, … when needed.
 */
export function uniquePresetName(
  desired: string,
  existingNames: readonly string[],
): string {
  const base = desired.trim() || 'Preset'
  if (!existingNames.includes(base)) return base
  let n = 2
  while (existingNames.includes(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

export function presetsForGame(
  presets: readonly SelectionPreset[],
  game: SelectedGame,
): SelectionPreset[] {
  return presets.filter((p) => p.game === game)
}

export function newPresetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
