import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { prepareSavedProfile, createProfileCheckpoint } from './profileCheckpoint'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.mocked(invoke).mockReset().mockResolvedValue('/profile/profile-backups/profile.json')
})
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

describe('profile checkpoints', () => {
  it('backs up raw settings/projects before archiving new sources, once per release/catalog fingerprint', async () => {
    const raw = '{"version":99,"future":"keep byte-for-byte"}'
    localStorage.setItem('infinity-express.projects-v1', raw)
    localStorage.setItem('infinity-express.github-token', 'test-token')
    localStorage.setItem('unrelated-app', 'private')
    await prepareSavedProfile()
    expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual(['create_profile_checkpoint', 'save_catalog_snapshot'])
    const snapshot = JSON.parse((vi.mocked(invoke).mock.calls[0][1] as { snapshot: string }).snapshot)
    expect(snapshot.entries).toEqual({ 'infinity-express.projects-v1': raw, 'infinity-express.github-token': 'test-token' })
    expect(snapshot.installSequenceXml).toContain('<installSequence>')
    expect(snapshot.modsCsv).toContain('Codename')
    expect(localStorage.getItem('infinity-express.projects-v1')).toBe(raw)
    const marker = localStorage.getItem('infinity-express.profile-release-v1')
    await prepareSavedProfile()
    expect(vi.mocked(invoke).mock.calls.filter(call => call[0] === 'create_profile_checkpoint')).toHaveLength(1)
    localStorage.setItem('infinity-express.profile-release-v1', 'earlier-release')
    await prepareSavedProfile()
    expect(vi.mocked(invoke).mock.calls.filter(call => call[0] === 'create_profile_checkpoint')).toHaveLength(2)
    expect(localStorage.getItem('infinity-express.profile-release-v1')).toBe(marker)
  })

  it('does not mark a release prepared when checkpoint or catalog persistence fails', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'))
    await expect(prepareSavedProfile()).rejects.toThrow('disk full')
    expect(localStorage.getItem('infinity-express.profile-release-v1')).toBeNull()
    expect(vi.mocked(invoke).mock.calls).toHaveLength(1)
    vi.mocked(invoke).mockResolvedValueOnce('/backup').mockRejectedValueOnce(new Error('catalog write failed'))
    await expect(prepareSavedProfile()).rejects.toThrow('catalog write failed')
    expect(localStorage.getItem('infinity-express.profile-release-v1')).toBeNull()
  })

  it('creates a fresh pre-update checkpoint even within the same release', async () => {
    await createProfileCheckpoint('update')
    localStorage.setItem('infinity-express.app-dirs', '{"backupDir":"D:/new-path"}')
    await createProfileCheckpoint('update')
    const args = vi.mocked(invoke).mock.calls[1][1] as { snapshot: string }
    expect(JSON.parse(args.snapshot)).toMatchObject({ reason: 'update', entries: { 'infinity-express.app-dirs': '{"backupDir":"D:/new-path"}' } })
  })
})
