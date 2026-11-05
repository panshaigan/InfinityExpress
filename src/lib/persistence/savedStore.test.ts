import { afterEach, describe, expect, it, vi } from 'vitest'
import { readProjectIndex, upsertProject } from '../projects/projectStore'
import { migrateLegacySessionsToProjects } from '../projects/migrateLegacy'
import { readSelectionPresetsStore, migrateSelectionPresetsToEngineStore } from '../presets/selectionPresetsStore'
import { readUserCatalogStore, loadOrCreateUserCatalog } from '../mods/userCatalog'
import { readAppSession } from '../ui/appSessionPrefs'
import { readAppDirPaths } from '../ui/appDirPrefs'
import { readVanillaRegistry } from '../projects/vanillaRegistry'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('saved data guards', () => {
  const readers = [
    ['infinity-express.projects-v1', readProjectIndex],
    ['infinity-express.selection-presets-v1', readSelectionPresetsStore],
    ['infinity-express.mods-catalog', readUserCatalogStore],
    ['infinity-express.app-session', readAppSession],
    ['infinity-express.app-dirs', readAppDirPaths],
    ['infinity-express.vanilla-registry', readVanillaRegistry],
  ] as const

  for (const [key, read] of readers) {
    it(`keeps unreadable/future ${key} unchanged`, () => {
      for (const raw of ['{broken JSON', '{"version":999,"future":true}', '']) {
        localStorage.setItem(key, raw)
        expect(read).toThrow(/saved data/)
        expect(localStorage.getItem(key)).toBe(raw)
      }
      localStorage.removeItem(key)
      expect(read).not.toThrow()
    })
  }

  it('never replaces an unknown catalog with the bundled catalog', () => {
    const raw = '{"version":2,"mods":[]}'
    localStorage.setItem('infinity-express.mods-catalog', raw)
    expect(() => loadOrCreateUserCatalog(new Map())).toThrow()
    expect(localStorage.getItem('infinity-express.mods-catalog')).toBe(raw)
  })

  it('does not overwrite the project index or mark migration complete after a failed save', () => {
    const legacy = JSON.stringify({ version: 1, lastGame: 'bg2', byGame: { bg2: { selectedIds: ['a:0'] } } })
    localStorage.setItem('infinity-express.app-session', legacy)
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'infinity-express.projects-v1') throw new Error('quota exceeded')
      setItem.call(this, key, value)
    })
    expect(() => migrateLegacySessionsToProjects()).toThrow('quota exceeded')
    expect(localStorage.getItem('infinity-express.app-session')).toBe(legacy)
    expect(localStorage.getItem('infinity-express.projects-migrated-v1')).toBeNull()
  })

  it('keeps inline presets if the engine-store migration cannot be saved', () => {
    const session = { selectionPresets: [{ id: 'p', name: 'Preset', game: 'bg2', selectedIds: ['a:0'] }] }
    upsertProject({ meta: { id: 'p', name: 'P', engine: 'bg2', folderName: 'P', createdAt: '', lastOpenedAt: '', destinations: { bg1: '', bg2: '', iwd: '', pst: '' } }, session: session as never })
    const original = localStorage.getItem('infinity-express.projects-v1')
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'infinity-express.selection-presets-v1') throw new Error('quota exceeded')
      setItem.call(this, key, value)
    })
    expect(() => migrateSelectionPresetsToEngineStore()).toThrow('quota exceeded')
    expect(localStorage.getItem('infinity-express.projects-v1')).toBe(original)
    expect(localStorage.getItem('infinity-express.selection-presets-migrated-v1')).toBeNull()
  })
})
