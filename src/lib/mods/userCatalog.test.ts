import { describe, expect, it } from 'vitest'
import type { ModInfo } from './loadMods'
import {
  addUserMod,
  createInitialCatalogStore,
  mergeBaseIntoWorkingCopy,
  migrateStoredModEntry,
  loadOrCreateUserCatalog,
  provisionalCodenameFromUrl,
  removeUserMod,
  removeUserMods,
  replaceOverlays,
  updateUserMod,
  type StoredModEntry,
  type UserCatalogStore,
} from './userCatalog'

function baseMod(partial: Partial<ModInfo> & { codename: string }): ModInfo {
  return {
    name: partial.name ?? partial.codename,
    abbreviation: partial.abbreviation ?? '',
    category: partial.category ?? 'NPC',
    url: partial.url ?? 'https://example.com',
    readme: partial.readme ?? '',
    game: partial.game ?? 'BG2',
    track: partial.track ?? '',
    download: partial.download ?? '',
    release: partial.release ?? '2020-01-01',
    version: partial.version ?? 'v1',
    sizeBytes: partial.sizeBytes ?? 100,
    author: partial.author ?? 'Author',
    type: partial.type ?? 'minor',
    stability: partial.stability ?? '',
    codename: partial.codename,
  }
}

describe('migrateStoredModEntry', () => {
  it('maps legacy useMaster/useAssets to track/download', () => {
    expect(
      migrateStoredModEntry({
        codename: 'A',
        useMaster: true,
        useAssets: true,
      } as never).track,
    ).toBe('main')
    expect(
      migrateStoredModEntry({
        codename: 'B',
        useMaster: false,
        useAssets: true,
      } as never).download,
    ).toBe('asset')
  })

  it('prefers track/download when already present', () => {
    const row = migrateStoredModEntry({
      codename: 'C',
      track: 'develop',
      download: 'asset',
      useMaster: true,
      useAssets: true,
    } as never)
    expect(row.track).toBe('develop')
    expect(row.download).toBe('')
  })
})

describe('mergeBaseIntoWorkingCopy', () => {
  it('gives changed canonical rows priority across a persisted upgrade and a second launch', () => {
    localStorage.removeItem('infinity-express.mods-catalog')
    const oldBase = new Map(['edit', 'hide', 'removed', 'refresh'].map(codename => [codename, baseMod({ codename })]))
    let store = loadOrCreateUserCatalog(oldBase)
    store = updateUserMod(store, 'edit', baseMod({ codename: 'edit', name: 'My edited name' }))
    store = addUserMod(store, baseMod({ codename: 'custom', name: 'My own mod' }))
    store = removeUserMod(store, 'hide')
    store.mods.find(row => row.codename === 'refresh')!.overlays = { version: 'downloaded-v1', sizeBytes: 777 }
    store.mods.find(row => row.codename === 'refresh')!.diskStatus = 'present'
    localStorage.setItem('infinity-express.mods-catalog', JSON.stringify(store))
    const newBase = new Map(['edit', 'hide', 'refresh', 'new', 'custom'].map(codename => [codename, baseMod({ codename, name: 'New catalog name', version: 'v2' })]))
    loadOrCreateUserCatalog(newBase)
    const upgraded = loadOrCreateUserCatalog(newBase)
    expect(upgraded.mods.find(row => row.codename === 'edit')!.name).toBe('New catalog name')
    expect(upgraded.mods.find(row => row.codename === 'edit')!.localEdit).toBeUndefined()
    expect(upgraded.mods.find(row => row.codename === 'custom')!.name).toBe('New catalog name')
    expect(upgraded.mods.find(row => row.codename === 'custom')!.origin).toBe('base')
    expect(upgraded.mods.some(row => row.codename === 'hide')).toBe(true)
    expect(upgraded.hiddenBaseCodenames).toEqual([])
    expect(upgraded.mods.some(row => row.codename === 'removed')).toBe(false)
    expect(upgraded.mods.some(row => row.codename === 'new')).toBe(true)
    expect(upgraded.mods.find(row => row.codename === 'refresh')).toMatchObject({ version: 'v2', diskStatus: 'present', overlays: { version: 'downloaded-v1', sizeBytes: 777 } })
    localStorage.removeItem('infinity-express.mods-catalog')
  })
  it('clones base on first run', () => {
    const base = new Map([
      ['A', baseMod({ codename: 'A', version: 'v1' })],
      ['B', baseMod({ codename: 'B' })],
    ])
    const merged = mergeBaseIntoWorkingCopy(base, null)
    expect(merged).toHaveLength(2)
    expect(merged.every((m) => m.origin === 'base')).toBe(true)
    expect(merged.find((m) => m.codename === 'A')?.version).toBe('v1')
  })

  it('adds new base rows and refreshes non-overlay fields', () => {
    const existing: StoredModEntry[] = [
      {
        ...baseMod({ codename: 'A', version: 'v1', category: 'OLD' }),
        origin: 'base',
        diskStatus: 'present',
        overlays: { version: 'v1-local', sizeBytes: 999 },
      },
    ]
    const base = new Map([
      ['A', baseMod({ codename: 'A', version: 'v2', category: 'NEW' })],
      ['C', baseMod({ codename: 'C' })],
    ])
    const merged = mergeBaseIntoWorkingCopy(base, existing)
    const a = merged.find((m) => m.codename === 'A')!
    expect(a.category).toBe('NEW')
    expect(a.version).toBe('v2')
    expect(a.overlays).toEqual({ version: 'v1-local', sizeBytes: 999 })
    expect(a.diskStatus).toBe('present')
    expect(merged.some((m) => m.codename === 'C')).toBe(true)
  })

  it('preserves scrape-filled author when base CSV author is empty', () => {
    const existing: StoredModEntry[] = [
      {
        ...baseMod({ codename: 'A', author: '' }),
        origin: 'base',
        diskStatus: 'present',
        overlays: {},
        author: 'GitHubOwner',
      },
    ]
    const base = new Map([
      ['A', baseMod({ codename: 'A', author: '', version: 'v2' })],
    ])
    const merged = mergeBaseIntoWorkingCopy(base, existing, [], createInitialCatalogStore(base).baseRows)
    expect(merged.find((m) => m.codename === 'A')?.author).toBe('GitHubOwner')
  })

  it('removes obsolete base rows and preserves unrelated user-origin rows', () => {
    const existing: StoredModEntry[] = [
      {
        ...baseMod({ codename: 'Gone' }),
        origin: 'base',
        diskStatus: 'not_present',
        overlays: {},
      },
      {
        ...baseMod({ codename: 'Mine', name: 'Mine' }),
        origin: 'user',
        diskStatus: 'not_present',
        overlays: {},
      },
    ]
    const base = new Map([['A', baseMod({ codename: 'A' })]])
    const merged = mergeBaseIntoWorkingCopy(base, existing)
    expect(merged.some((m) => m.codename === 'Gone')).toBe(false)
    expect(merged.find((m) => m.codename === 'Mine')?.origin).toBe('user')
  })

  it('migrates legacy overrides and tombstones once, then preserves edits to unchanged canonical rows', () => {
    localStorage.removeItem('infinity-express.mods-catalog')
    const base = new Map(['edit', 'hide'].map(codename => [codename, baseMod({ codename })]))
    localStorage.setItem('infinity-express.mods-catalog', JSON.stringify({ version: 1, mods: [{
      ...baseMod({ codename: 'edit', name: 'Stale local override' }),
      origin: 'base', localEdit: true, diskStatus: 'present', overlays: { version: 'downloaded' },
    }], hiddenBaseCodenames: ['hide'] }))
    let store = loadOrCreateUserCatalog(base)
    expect(store.mods.find(row => row.codename === 'edit')!.name).toBe('edit')
    expect(store.mods.some(row => row.codename === 'hide')).toBe(true)
    store = updateUserMod(store, 'edit', baseMod({ codename: 'edit', name: 'New local edit' }))
    store = removeUserMod(store, 'hide')
    store = addUserMod(store, baseMod({ codename: 'personal' }))
    localStorage.setItem('infinity-express.mods-catalog', JSON.stringify(store))
    // An unrelated canonical addition must not discard intentional local edits.
    const updatedBase = new Map([...base, ['another', baseMod({ codename: 'another' })]])
    const refreshed = loadOrCreateUserCatalog(updatedBase)
    expect(refreshed.mods.find(row => row.codename === 'edit')).toMatchObject({ name: 'New local edit', diskStatus: 'present', overlays: { version: 'downloaded' } })
    expect(refreshed.mods.some(row => row.codename === 'hide')).toBe(false)
    expect(refreshed.mods.some(row => row.codename === 'personal')).toBe(true)
    expect(loadOrCreateUserCatalog(updatedBase)).toEqual(refreshed)
    localStorage.removeItem('infinity-express.mods-catalog')
  })
})

describe('user catalog CRUD', () => {
  function storeWith(mods: StoredModEntry[]): UserCatalogStore {
    return { version: 1, mods }
  }

  it('adds and updates mods including base; hides deleted base rows', () => {
    let store = storeWith([
      {
        ...baseMod({ codename: 'Base', name: 'Base Name' }),
        origin: 'base',
        diskStatus: 'not_present',
        overlays: {},
      },
    ])
    store = addUserMod(store, baseMod({ codename: 'UserMod', name: 'User' }))
    expect(store.mods.find((m) => m.codename === 'UserMod')?.origin).toBe(
      'user',
    )
    store = updateUserMod(store, 'UserMod', {
      ...baseMod({ codename: 'UserMod', name: 'Renamed' }),
    })
    expect(store.mods.find((m) => m.codename === 'UserMod')?.name).toBe(
      'Renamed',
    )
    store = updateUserMod(store, 'Base', {
      ...baseMod({ codename: 'Base', name: 'Edited Base' }),
    })
    expect(store.mods.find((m) => m.codename === 'Base')?.name).toBe(
      'Edited Base',
    )
    expect(store.mods.find((m) => m.codename === 'Base')?.localEdit).toBe(true)

    const baseMap = new Map([
      ['Base', baseMod({ codename: 'Base', name: 'Shipped Base' })],
    ])
    store.baseRows = createInitialCatalogStore(baseMap).baseRows
    expect(
      mergeBaseIntoWorkingCopy(baseMap, store.mods, store.hiddenBaseCodenames, store.baseRows).find(
        (m) => m.codename === 'Base',
      )?.name,
    ).toBe('Edited Base')

    store = removeUserMod(store, 'Base')
    expect(store.mods.some((m) => m.codename === 'Base')).toBe(false)
    expect(store.hiddenBaseCodenames).toContain('Base')
    expect(
      mergeBaseIntoWorkingCopy(baseMap, store.mods, store.hiddenBaseCodenames, store.baseRows).some(
        (m) => m.codename === 'Base',
      ),
    ).toBe(false)

    store = removeUserMod(store, 'UserMod')
    expect(store.mods.some((m) => m.codename === 'UserMod')).toBe(false)
  })

  it('removeUserMods deletes several rows in one pass', () => {
    let store = storeWith([
      {
        ...baseMod({ codename: 'Base' }),
        origin: 'base',
        diskStatus: 'not_present',
        overlays: {},
      },
      {
        ...baseMod({ codename: 'Keep' }),
        origin: 'user',
        diskStatus: 'not_present',
        overlays: {},
      },
    ])
    store = addUserMod(store, baseMod({ codename: 'A', name: 'A' }))
    store = addUserMod(store, baseMod({ codename: 'B', name: 'B' }))
    store = addUserMod(store, baseMod({ codename: 'C', name: 'C' }))

    store = removeUserMods(store, ['A', 'B', 'Base'])
    expect(store.mods.map((m) => m.codename)).toEqual(['C', 'Keep'])
    expect(store.hiddenBaseCodenames).toContain('Base')
    expect(store.mods.some((m) => m.codename === 'A')).toBe(false)
    expect(store.mods.some((m) => m.codename === 'B')).toBe(false)
  })

  it('keeps a renamed base row as a custom mod when reconciling against canonical IDs', () => {
    const base = new Map([['Base', baseMod({ codename: 'Base' })]])
    let store = createInitialCatalogStore(base)
    store = updateUserMod(store, 'Base', baseMod({ codename: 'Personal' }))
    const merged = mergeBaseIntoWorkingCopy(base, store.mods, store.hiddenBaseCodenames, store.baseRows)
    expect(merged.map(row => [row.codename, row.origin])).toEqual([['Personal', 'user']])
  })

  it('replaceOverlays clears and sets disk status', () => {
    let store = storeWith([
      {
        ...baseMod({ codename: 'A' }),
        origin: 'base',
        diskStatus: 'present',
        overlays: { version: 'x' },
      },
    ])
    store = replaceOverlays(store, 'A', {}, 'not_present')
    const a = store.mods[0]
    expect(a.overlays).toEqual({})
    expect(a.diskStatus).toBe('not_present')
  })
})

describe('provisionalCodenameFromUrl', () => {
  it('derives an id from the last path segment and avoids collisions', () => {
    expect(
      provisionalCodenameFromUrl(
        'https://downloads.weaselmods.net/download/gahesh',
        new Set(),
      ),
    ).toBe('gahesh')
    expect(
      provisionalCodenameFromUrl(
        'https://www.gibberlings3.net/files/file/685-amber/',
        new Set(),
      ),
    ).toBe('685-amber')
    expect(
      provisionalCodenameFromUrl(
        'https://www.sentrizeal.com/downloaditm5',
        new Set(),
      ),
    ).toBe('downloaditm5')
    expect(
      provisionalCodenameFromUrl(
        'https://github.com/org/MyMod/releases',
        new Set(),
      ),
    ).toBe('releases')
    const existing = new Set(['MyMod'])
    expect(
      provisionalCodenameFromUrl('https://github.com/org/MyMod', existing),
    ).toBe('MyMod-2')
    expect(
      provisionalCodenameFromUrl(
        'https://gitlab.com/org/subgroup/MyMod/-/releases/v1.2.3',
        existing,
      ),
    ).toBe('MyMod-2')
  })
})
