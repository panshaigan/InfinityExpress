import { describe, expect, it } from 'vitest'
import {
  applyDiskPresence,
  clearDiskPresence,
  folderNameSet,
  resolveDiskStatus,
} from './diskPresence'
import type { UserCatalogStore } from './userCatalog'

function entry(
  codename: string,
  diskStatus: UserCatalogStore['mods'][number]['diskStatus'],
): UserCatalogStore['mods'][number] {
  return {
    codename,
    name: codename,
    abbreviation: '',
    category: '',
    url: '',
    readme: '',
    game: '',
    useMaster: false,
    useAssets: false,
    release: '',
    version: '',
    sizeBytes: null,
    author: '',
    type: '',
    stability: '',
    origin: 'base',
    diskStatus,
    overlays: {},
  }
}

describe('folderNameSet', () => {
  it('indexes folder names case-insensitively', () => {
    const map = folderNameSet(['EET', 'stratagems'])
    expect(map.get('eet')).toBe('EET')
    expect(map.get('stratagems')).toBe('stratagems')
    expect(resolveDiskStatus('not_present', 'STRATAGEMS', map)).toBe('present')
  })
})

describe('resolveDiskStatus', () => {
  const folders = folderNameSet(['EET', 'Foo'])

  it('marks missing folders not_present', () => {
    expect(resolveDiskStatus('present', 'Missing', folders)).toBe('not_present')
  })

  it('marks found folders present', () => {
    expect(resolveDiskStatus('not_present', 'eet', folders)).toBe('present')
  })

  it('preserves update_available and busy when still on disk', () => {
    expect(resolveDiskStatus('update_available', 'EET', folders)).toBe(
      'update_available',
    )
    expect(resolveDiskStatus('busy', 'foo', folders)).toBe('busy')
  })
})

describe('applyDiskPresence', () => {
  it('updates statuses from folder list without changing identity when unchanged', () => {
    const store: UserCatalogStore = {
      version: 1,
      mods: [
        entry('EET', 'not_present'),
        entry('Other', 'present'),
        entry('KeepBusy', 'busy'),
      ],
    }
    const next = applyDiskPresence(store, ['eet', 'KeepBusy'])
    expect(next.mods.map((m) => [m.codename, m.diskStatus])).toEqual([
      ['EET', 'present'],
      ['Other', 'not_present'],
      ['KeepBusy', 'busy'],
    ])
    expect(applyDiskPresence(next, ['eet', 'KeepBusy'])).toBe(next)
  })
})

describe('clearDiskPresence', () => {
  it('sets every row to not_present', () => {
    const store: UserCatalogStore = {
      version: 1,
      mods: [entry('A', 'present'), entry('B', 'update_available')],
    }
    const next = clearDiskPresence(store)
    expect(next.mods.every((m) => m.diskStatus === 'not_present')).toBe(true)
    expect(clearDiskPresence(next)).toBe(next)
  })
})
