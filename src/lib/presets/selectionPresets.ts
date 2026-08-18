import { GAME_LABELS, type SelectedGame } from '../xml/schema'

/** Serializable selection preset (ready for later file persistence). */
export interface SelectionPreset {
  id: string
  name: string
  game: SelectedGame
  selectedIds: string[]
  recommendedChecked: string[]
  packagesChecked: string[]
}

export interface SelectionLiveSnapshotInput {
  game: SelectedGame
  selectedIds: ReadonlySet<string>
  recommendedChecked: ReadonlySet<string>
  packagesChecked: ReadonlySet<string>
}

export interface AppliedSelectionPreset {
  selectedIds: Set<string>
  recommendedChecked: Set<string>
  packagesChecked: Set<string>
}

/** Payload used for dirty fingerprints (excludes id/name). */
export type SelectionPresetPayload = Omit<SelectionPreset, 'id' | 'name'>

export function payloadFromLive(input: SelectionLiveSnapshotInput): SelectionPresetPayload {
  return {
    game: input.game,
    selectedIds: [...input.selectedIds].sort(),
    recommendedChecked: [...input.recommendedChecked].sort(),
    packagesChecked: [...input.packagesChecked].sort(),
  }
}

export function payloadFromPreset(preset: SelectionPreset): SelectionPresetPayload {
  return {
    game: preset.game,
    selectedIds: [...preset.selectedIds].sort(),
    recommendedChecked: [...(preset.recommendedChecked ?? [])].sort(),
    packagesChecked: [...(preset.packagesChecked ?? [])].sort(),
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
  return {
    selectedIds: new Set(preset.selectedIds),
    recommendedChecked: new Set(preset.recommendedChecked ?? []),
    packagesChecked: new Set(preset.packagesChecked ?? []),
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

const SELECTED_GAMES: readonly SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']

function isSelectedGame(value: unknown): value is SelectedGame {
  return typeof value === 'string' && SELECTED_GAMES.includes(value as SelectedGame)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

export function parseSelectionPreset(value: unknown): SelectionPreset | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !isSelectedGame(o.game)) {
    return null
  }
  return {
    id: o.id,
    name: o.name,
    game: o.game,
    selectedIds: stringArray(o.selectedIds),
    recommendedChecked: stringArray(o.recommendedChecked),
    packagesChecked: stringArray(o.packagesChecked),
  }
}
