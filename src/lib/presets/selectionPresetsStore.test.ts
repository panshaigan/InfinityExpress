import { beforeEach, describe, expect, it } from 'vitest'
import type { SelectionPreset } from './selectionPresets'
import {
  emptySelectionPresetsIndex,
  migrateSelectionPresetsToEngineStore,
  presetsForEngine,
  readSelectionPresetsStore,
  savePresetsForEngine,
  SELECTION_PRESETS_STORAGE_KEY,
  writeSelectionPresetsStore,
} from './selectionPresetsStore'
import {
  emptyProjectIndex,
  readProjectIndex,
  writeProjectIndex,
  type ProjectIndex,
} from '../projects/projectStore'

const MIGRATION_FLAG = 'infinity-express.selection-presets-migrated-v1'
const PROJECTS_KEY = 'infinity-express.projects-v1'

function preset(id: string, game: SelectionPreset['game'] = 'eet'): SelectionPreset {
  return {
    id,
    name: `Preset ${id}`,
    game,
    selectedIds: ['a'],
    recommendedChecked: [],
    packagesChecked: [],
  }
}

function projectWithPresets(
  id: string,
  engine: SelectionPreset['game'],
  presets: SelectionPreset[],
  lastOpenedAt: string,
): ProjectIndex {
  return {
    version: 1,
    lastProjectId: id,
    projects: {
      [id]: {
        meta: {
          id,
          name: 'Test',
          engine,
          createdAt: lastOpenedAt,
          lastOpenedAt,
          destinations: { bg1: '', bg2: '', iwd: '', pst: '' },
        },
        session: {
          selectedIds: [],
          finishedStations: [],
          routeUnlocked: true,
          activePresetId: null,
          presetBaseline: null,
          activeStation: 'presets',
          contentMainKey: null,
          contentSubKey: null,
          contentSubTag: null,
          recommendedChecked: [],
          packagesChecked: [],
          modsJourney: null,
          // Legacy field migrated into engine store
          selectionPresets: presets,
        } as ProjectIndex['projects'][string]['session'],
      },
    },
  }
}

describe('selectionPresetsStore', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SELECTION_PRESETS_STORAGE_KEY)
    window.localStorage.removeItem(MIGRATION_FLAG)
    window.localStorage.removeItem(PROJECTS_KEY)
    writeProjectIndex(emptyProjectIndex())
  })

  it('round-trips presets by engine', () => {
    savePresetsForEngine('bg2', [preset('p1', 'bg2')])
    expect(presetsForEngine('bg2')).toHaveLength(1)
    expect(presetsForEngine('eet')).toHaveLength(0)
  })

  it('readSelectionPresetsStore returns empty index for missing key', () => {
    expect(readSelectionPresetsStore()).toEqual(emptySelectionPresetsIndex())
  })

  it('migrateSelectionPresetsToEngineStore merges and dedupes by id', () => {
    const shared = preset('shared', 'eet')
    const older = projectWithPresets('proj-a', 'eet', [shared], '2026-01-01T00:00:00.000Z')
    const newer = projectWithPresets(
      'proj-b',
      'eet',
      [{ ...shared, name: 'Newer name' }, preset('only-b', 'eet')],
      '2026-02-01T00:00:00.000Z',
    )
    writeProjectIndex({
      version: 1,
      lastProjectId: 'proj-b',
      projects: { ...older.projects, ...newer.projects },
    })

    migrateSelectionPresetsToEngineStore()

    expect(presetsForEngine('eet')).toHaveLength(2)
    expect(presetsForEngine('eet').find((p) => p.id === 'shared')?.name).toBe('Newer name')

    const index = readProjectIndex()
    for (const record of Object.values(index.projects)) {
      expect(record.session).not.toHaveProperty('selectionPresets')
    }
    expect(window.localStorage.getItem(MIGRATION_FLAG)).toBe('1')
  })

  it('migrateSelectionPresetsToEngineStore skips when flag is set', () => {
    writeProjectIndex(projectWithPresets('proj-a', 'eet', [preset('p1')], '2026-01-01T00:00:00.000Z'))
    window.localStorage.setItem(MIGRATION_FLAG, '1')
    writeSelectionPresetsStore(emptySelectionPresetsIndex())

    migrateSelectionPresetsToEngineStore()

    expect(presetsForEngine('eet')).toHaveLength(0)
  })

  it('does not mix presets across engines', () => {
    writeSelectionPresetsStore({
      version: 1,
      byGame: {
        eet: [preset('eet-1', 'eet')],
        bg2: [preset('bg2-1', 'bg2')],
      },
    })
    expect(presetsForEngine('eet').map((p) => p.id)).toEqual(['eet-1'])
    expect(presetsForEngine('bg2').map((p) => p.id)).toEqual(['bg2-1'])
  })
})
