import { beforeEach, describe, expect, it } from 'vitest'
import {
  adaptSessionForProjects,
  defaultProjectName,
  deleteProject,
  destinationsForEngine,
  emptyProjectIndex,
  getProject,
  listProjects,
  newProjectId,
  readProjectIndex,
  saveProjectSession,
  upsertProject,
  writeProjectIndex,
} from './projectStore'
import type { GameSession } from '../ui/appSessionPrefs'

const STORAGE_KEY = 'infinity-express.projects-v1'

function minimalSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    selectedIds: ['a'],
    finishedStations: ['engine', 'presets'],
    routeUnlocked: true,
    selectionPresets: [],
    activePresetId: null,
    presetBaseline: null,
    activeStation: 'engine',
    contentMainKey: null,
    contentSubKey: null,
    contentSubTag: null,
    ladderChecked: [],
    lowerDifficultyPreset: false,
    higherDifficultyPreset: false,
    lastGlobalLadder: [],
    lastGlobalLowerDifficulty: false,
    lastGlobalHigherDifficulty: false,
    stationLevelPresets: {},
    modsJourney: null,
    ...overrides,
  }
}

describe('projectStore', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    writeProjectIndex(emptyProjectIndex())
  })

  it('upserts and lists projects by lastOpenedAt', () => {
    const id = newProjectId()
    upsertProject({
      meta: {
        id,
        name: 'Test BG2',
        engine: 'bg2',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastOpenedAt: '2026-01-02T00:00:00.000Z',
        destinations: destinationsForEngine('bg2', { bg2: 'D:/games/bg2' }),
      },
      session: null,
    })
    expect(listProjects()).toHaveLength(1)
    expect(getProject(id)?.meta.name).toBe('Test BG2')
    expect(readProjectIndex().lastProjectId).toBe(id)
  })

  it('adaptSessionForProjects drops engine station', () => {
    const adapted = adaptSessionForProjects(minimalSession())
    expect(adapted.activeStation).toBe('presets')
    expect(adapted.finishedStations).not.toContain('engine')
    expect(adapted.finishedStations).toContain('presets')
  })

  it('saveProjectSession and deleteProject', () => {
    const id = newProjectId()
    upsertProject({
      meta: {
        id,
        name: defaultProjectName('iwd'),
        engine: 'iwd',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
        destinations: destinationsForEngine('iwd', { iwd: 'D:/iwd' }),
      },
      session: null,
    })
    saveProjectSession(id, minimalSession({ selectedIds: ['x'] }))
    expect(getProject(id)?.session?.selectedIds).toEqual(['x'])
    deleteProject(id)
    expect(getProject(id)).toBeNull()
    expect(readProjectIndex().lastProjectId).toBeNull()
  })
})
