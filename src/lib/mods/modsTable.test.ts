import { describe, expect, it } from 'vitest'
import type { WorkingMod } from './loadMods'
import {
  createDefaultModsTableFilters,
  filterAndSortWorkingMods,
  filterWorkingMods,
} from './modsTable'

function mod(partial: Partial<WorkingMod> & { codename: string }): WorkingMod {
  return {
    name: partial.name ?? partial.codename,
    abbreviation: '',
    category: partial.category ?? 'NPC',
    url: '',
    readme: '',
    game: partial.game ?? 'BG2',
    release: '',
    version: partial.version ?? 'v1',
    sizeBytes: partial.sizeBytes ?? 10,
    author: partial.author ?? 'A',
    type: '',
    stability: '',
    origin: partial.origin ?? 'base',
    diskStatus: partial.diskStatus ?? 'not_present',
    overlays: partial.overlays ?? {},
    codename: partial.codename,
  }
}

describe('modsTable filter/sort', () => {
  const mods = [
    mod({ codename: 'Zebra', name: 'Zebra', category: 'QUEST', author: 'Z' }),
    mod({ codename: 'Alpha', name: 'Alpha', category: 'NPC', author: 'A' }),
    mod({
      codename: 'Beta',
      name: 'Beta',
      category: 'NPC',
      author: 'B',
      diskStatus: 'present',
    }),
  ]

  it('filters by search and facets', () => {
    const filters = {
      ...createDefaultModsTableFilters(),
      search: 'alp',
      categories: ['NPC'],
    }
    expect(filterWorkingMods(mods, filters).map((m) => m.codename)).toEqual([
      'Alpha',
    ])
  })

  it('filters by required codenames for journey mode', () => {
    const filters = {
      ...createDefaultModsTableFilters(),
      requiredCodenames: ['Beta', 'Missing'],
    }
    expect(filterWorkingMods(mods, filters).map((m) => m.codename)).toEqual([
      'Beta',
    ])
  })

  it('sorts by name', () => {
    const rows = filterAndSortWorkingMods(
      mods,
      createDefaultModsTableFilters(),
      'name',
      'asc',
    )
    expect(rows.map((m) => m.codename)).toEqual(['Alpha', 'Beta', 'Zebra'])
  })
})
