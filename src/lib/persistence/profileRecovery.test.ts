import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { contentRevision } from './catalogSnapshots'
import { parseProfileRecovery, restoreProfileRecovery, type ProfileRecovery } from './profileRecovery'
import { createProfileCheckpoint } from './profileCheckpoint'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock('./profileCheckpoint', async (original) => ({ ...await original<typeof import('./profileCheckpoint')>(), createProfileCheckpoint: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined)
  vi.mocked(createProfileCheckpoint).mockReset().mockResolvedValue('/backup')
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

async function backup(): Promise<ProfileRecovery> {
  const revision = await contentRevision('old XML')
  return { version: 1, appVersion: '1.0.0', createdAt: '2026-11-05T12:00:00Z',
    entries: { 'infinity-express.projects-v1': JSON.stringify({ version: 1, projects: { p: { catalogRevision: revision } } }) },
    catalogs: { [revision]: 'old XML' } }
}

describe('profile recovery', () => {
  it('validates catalog hashes and restores catalogs before local settings while preserving other applications', async () => {
    localStorage.setItem('infinity-express.app-dirs', 'old settings')
    localStorage.setItem('another-app', 'untouched')
    const value = await backup()
    vi.mocked(invoke).mockImplementation(async () => {
      expect(createProfileCheckpoint).toHaveBeenCalledWith('recovery')
      expect(localStorage.getItem('infinity-express.app-dirs')).toBe('old settings')
      return undefined as never
    })
    await restoreProfileRecovery(await parseProfileRecovery(JSON.stringify(value)))
    expect(localStorage.getItem('infinity-express.projects-v1')).toBe(value.entries['infinity-express.projects-v1'])
    expect(localStorage.getItem('infinity-express.app-dirs')).toBeNull()
    expect(localStorage.getItem('another-app')).toBe('untouched')
  })

  it('rejects damaged or incomplete backups before changing anything', async () => {
    const value = await backup()
    const revision = Object.keys(value.catalogs)[0]
    value.catalogs[revision] = 'tampered XML'
    await expect(restoreProfileRecovery(value)).rejects.toThrow('damaged')
    delete value.catalogs[revision]
    await expect(restoreProfileRecovery(value)).rejects.toThrow('missing')
    expect(createProfileCheckpoint).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not change settings if a recovery checkpoint or catalog restore fails', async () => {
    localStorage.setItem('infinity-express.app-dirs', 'original')
    const value = await backup()
    vi.mocked(createProfileCheckpoint).mockRejectedValueOnce(new Error('backup failed'))
    await expect(restoreProfileRecovery(value)).rejects.toThrow('backup failed')
    expect(invoke).not.toHaveBeenCalled()
    vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'))
    await expect(restoreProfileRecovery(value)).rejects.toThrow('disk full')
    expect(localStorage.getItem('infinity-express.app-dirs')).toBe('original')
  })

  it('rolls back local settings if a restore hits the localStorage quota', async () => {
    localStorage.setItem('infinity-express.app-dirs', 'original')
    const value = await backup()
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, contents) {
      if (key === 'infinity-express.projects-v1') throw new Error('quota exceeded')
      setItem.call(this, key, contents)
    })
    await expect(restoreProfileRecovery(value)).rejects.toThrow('quota exceeded')
    expect(localStorage.getItem('infinity-express.app-dirs')).toBe('original')
    expect(localStorage.getItem('infinity-express.projects-v1')).toBeNull()
  })
})
