import { describe, expect, it } from 'vitest'
import type { ModInfo } from './loadMods'
import {
  addUserMod,
  mergeBaseIntoWorkingCopy,
  provisionalCodenameFromUrl,
  removeUserMod,
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
    useMaster: partial.useMaster ?? false,
    useAssets: partial.useAssets ?? false,
    release: partial.release ?? '2020-01-01',
    version: partial.version ?? 'v1',
    sizeBytes: partial.sizeBytes ?? 100,
    author: partial.author ?? 'Author',
    type: partial.type ?? 'minor',
    stability: partial.stability ?? '',
    codename: partial.codename,
  }
}

describe('mergeBaseIntoWorkingCopy', () => {
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

  it('keeps rows removed from base and preserves user-origin rows', () => {
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
    expect(merged.some((m) => m.codename === 'Gone')).toBe(true)
    expect(merged.find((m) => m.codename === 'Mine')?.origin).toBe('user')
  })
})

describe('user catalog CRUD', () => {
  function storeWith(mods: StoredModEntry[]): UserCatalogStore {
    return { version: 1, mods }
  }

  it('adds and updates user mods; rejects base edits/deletes', () => {
    let store = storeWith([
      {
        ...baseMod({ codename: 'Base' }),
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
    expect(() =>
      updateUserMod(store, 'Base', baseMod({ codename: 'Base' })),
    ).toThrow(/user-added/)
    expect(() => removeUserMod(store, 'Base')).toThrow(/cannot be removed/)
    store = removeUserMod(store, 'UserMod')
    expect(store.mods.some((m) => m.codename === 'UserMod')).toBe(false)
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
  it('derives an id from host and path and avoids collisions', () => {
    const existing = new Set(['github.com-MyMod'])
    expect(
      provisionalCodenameFromUrl(
        'https://github.com/org/MyMod/releases',
        new Set(),
      ),
    ).toBe('github.com-releases')
    expect(
      provisionalCodenameFromUrl('https://github.com/org/MyMod', existing),
    ).toBe('github.com-MyMod-2')
  })
})
