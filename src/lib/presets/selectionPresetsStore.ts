import type { SelectedGame } from '../xml/schema'
import {
  readProjectIndex,
  writeProjectIndex,
  type ProjectIndex,
  type ProjectRecord,
} from '../projects/projectStore'
import type { SelectionPreset } from './selectionPresets'
import { parseSelectionPreset } from './selectionPresets'

export const SELECTION_PRESETS_STORAGE_KEY = 'infinity-express.selection-presets-v1'
const MIGRATION_FLAG = 'infinity-express.selection-presets-migrated-v1'

const SELECTED_GAMES: readonly SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']

export interface SelectionPresetsIndex {
  version: 1
  byGame: Partial<Record<SelectedGame, SelectionPreset[]>>
}

function selectionPresetsIndexFrom(value: unknown): SelectionPresetsIndex | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (o.version !== 1) return null
  const byGame: Partial<Record<SelectedGame, SelectionPreset[]>> = {}
  if (o.byGame && typeof o.byGame === 'object') {
    for (const game of SELECTED_GAMES) {
      const raw = (o.byGame as Record<string, unknown>)[game]
      if (!Array.isArray(raw)) continue
      const presets = raw
        .map(parseSelectionPreset)
        .filter((p): p is SelectionPreset => p != null)
      if (presets.length > 0) byGame[game] = presets
    }
  }
  return { version: 1, byGame }
}

export function emptySelectionPresetsIndex(): SelectionPresetsIndex {
  return { version: 1, byGame: {} }
}

export function readSelectionPresetsStore(): SelectionPresetsIndex {
  try {
    const raw = window.localStorage.getItem(SELECTION_PRESETS_STORAGE_KEY)
    if (!raw) return emptySelectionPresetsIndex()
    const parsed: unknown = JSON.parse(raw)
    return selectionPresetsIndexFrom(parsed) ?? emptySelectionPresetsIndex()
  } catch {
    return emptySelectionPresetsIndex()
  }
}

export function writeSelectionPresetsStore(store: SelectionPresetsIndex): void {
  try {
    window.localStorage.setItem(SELECTION_PRESETS_STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* private mode / blocked storage / quota */
  }
}

export function presetsForEngine(
  game: SelectedGame,
  store: SelectionPresetsIndex = readSelectionPresetsStore(),
): SelectionPreset[] {
  return [...(store.byGame[game] ?? [])]
}

export function savePresetsForEngine(
  game: SelectedGame,
  presets: readonly SelectionPreset[],
): SelectionPresetsIndex {
  const store = readSelectionPresetsStore()
  const next: SelectionPresetsIndex = {
    version: 1,
    byGame: {
      ...store.byGame,
      [game]: presets.map((p) => ({ ...p })),
    },
  }
  writeSelectionPresetsStore(next)
  return next
}

function presetsFromRawSession(raw: unknown): SelectionPreset[] {
  if (!raw || typeof raw !== 'object') return []
  const list = (raw as Record<string, unknown>).selectionPresets
  if (!Array.isArray(list)) return []
  return list.map(parseSelectionPreset).filter((p): p is SelectionPreset => p != null)
}

function mergePresetLists(
  existing: readonly SelectionPreset[],
  incoming: readonly SelectionPreset[],
): SelectionPreset[] {
  const byId = new Map<string, SelectionPreset>()
  for (const preset of existing) byId.set(preset.id, preset)
  for (const preset of incoming) byId.set(preset.id, preset)
  return [...byId.values()]
}

function stripSelectionPresetsFromSession(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const o = { ...(raw as Record<string, unknown>) }
  delete o.selectionPresets
  return o
}

function stripSelectionPresetsFromProjects(index: ProjectIndex): ProjectIndex {
  const projects: ProjectIndex['projects'] = {}
  for (const [id, record] of Object.entries(index.projects)) {
    if (!record.session) {
      projects[id] = record
      continue
    }
    const session = stripSelectionPresetsFromSession(record.session) as ProjectRecord['session']
    projects[id] = { ...record, session }
  }
  return { ...index, projects }
}

/**
 * One-shot: lift per-project preset libraries into the engine-scoped store.
 */
export function migrateSelectionPresetsToEngineStore(): SelectionPresetsIndex {
  if (typeof window === 'undefined') return readSelectionPresetsStore()
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === '1') {
      return readSelectionPresetsStore()
    }
  } catch {
    /* ignore */
  }

  let store = readSelectionPresetsStore()
  const index = readProjectIndex()

  type Candidate = { preset: SelectionPreset; lastOpenedAt: string }
  const candidates = new Map<SelectedGame, Map<string, Candidate>>()

  for (const record of Object.values(index.projects)) {
    if (!record.session) continue
    const engine = record.meta.engine
    const rawPresets = presetsFromRawSession(record.session)
    if (rawPresets.length === 0) continue

    let bucket = candidates.get(engine)
    if (!bucket) {
      bucket = new Map()
      candidates.set(engine, bucket)
    }

    for (const preset of rawPresets) {
      if (preset.game !== engine) continue
      const prev = bucket.get(preset.id)
      if (!prev || record.meta.lastOpenedAt.localeCompare(prev.lastOpenedAt) > 0) {
        bucket.set(preset.id, {
          preset,
          lastOpenedAt: record.meta.lastOpenedAt,
        })
      }
    }
  }

  if (candidates.size > 0) {
    const byGame: Partial<Record<SelectedGame, SelectionPreset[]>> = { ...store.byGame }
    for (const [engine, bucket] of candidates) {
      const migrated = [...bucket.values()].map((c) => c.preset)
      byGame[engine] = mergePresetLists(byGame[engine] ?? [], migrated)
    }
    store = { version: 1, byGame }
    writeSelectionPresetsStore(store)
  }

  const stripped = stripSelectionPresetsFromProjects(index)
  writeProjectIndex(stripped)

  try {
    window.localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {
    /* ignore */
  }

  return store
}
