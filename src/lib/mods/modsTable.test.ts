import { describe, expect, it } from 'vitest'
import type { WorkingMod } from './loadMods'
import {
  collectModsFacetOptions,
  createDefaultModsTableFilters,
  filterAndSortWorkingMods,
  filterWorkingMods,
  primaryAuthorLabel,
} from './modsTable'

function mod(partial: Partial<WorkingMod> & { codename: string }): WorkingMod {
  return {
    name: partial.name ?? partial.codename,
    abbreviation: '',
    category: partial.category ?? 'NPC',
    url: '',
    readme: '',
    game: partial.game ?? 'BG2',
    useMaster: partial.useMaster ?? false,
    useAssets: partial.useAssets ?? false,
    release: '',
    version: partial.version ?? 'v1',
    sizeBytes: partial.sizeBytes ?? 10,
    author: partial.author ?? 'A',
    type: partial.type ?? '',
    stability: partial.stability ?? '',
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

  it('sorts descending when dir is desc', () => {
    const rows = filterAndSortWorkingMods(
      mods,
      createDefaultModsTableFilters(),
      'name',
      'desc',
    )
    expect(rows.map((m) => m.codename)).toEqual(['Zebra', 'Beta', 'Alpha'])
  })
})

describe('primaryAuthorLabel', () => {
  it('shows first author and ellipsis when multiple', () => {
    expect(primaryAuthorLabel('Lava, Kaeloree, TheArtisan')).toEqual({
      display: 'Lava…',
      title: 'Lava, Kaeloree, TheArtisan',
    })
  })

  it('keeps a single author as-is', () => {
    expect(primaryAuthorLabel('K4thos')).toEqual({
      display: 'K4thos',
      title: 'K4thos',
    })
  })
})

describe('collectModsFacetOptions', () => {
  it('collects type and stability alongside other facets', () => {
    const facets = collectModsFacetOptions([
      mod({
        codename: 'A',
        category: 'NPC',
        game: 'BG2',
        author: 'X',
        type: 'major',
        stability: 'beta',
      }),
      mod({
        codename: 'B',
        category: 'QUEST',
        game: 'BG1',
        author: 'Y',
        type: 'minor',
        stability: '',
      }),
    ])
    expect(facets.types).toEqual(['major', 'minor'])
    expect(facets.stabilities).toEqual(['beta'])
    expect(facets.categories).toEqual(['NPC', 'QUEST'])
  })

  it('splits co-author fields into singular author facets', () => {
    const facets = collectModsFacetOptions([
      mod({
        codename: 'A',
        author: 'Lava, Kaeloree',
      }),
      mod({
        codename: 'B',
        author: 'Kaeloree',
      }),
    ])
    expect(facets.authors).toEqual(['Kaeloree', 'Lava'])
  })
})

describe('game and author filter matching', () => {
  const mods = [
    mod({ codename: 'only-bg1', game: 'BG1', author: 'Solo' }),
    mod({
      codename: 'bg-pair',
      game: 'BG1-BG2',
      author: 'Lava, Kaeloree',
    }),
    mod({
      codename: 'all-ee',
      game: 'BG1-BG2-IWD-PST',
      author: 'Kaeloree',
    }),
    mod({ codename: 'iwd', game: 'IWD', author: 'Weigo' }),
  ]

  it('filters by individual game token membership', () => {
    const filters = {
      ...createDefaultModsTableFilters(),
      games: ['BG1'],
    }
    expect(filterWorkingMods(mods, filters).map((m) => m.codename)).toEqual([
      'only-bg1',
      'bg-pair',
      'all-ee',
    ])
  })

  it('filters BG1+BG2 as the union of BG1 and BG2', () => {
    const filters = {
      ...createDefaultModsTableFilters(),
      games: ['BG1+BG2'],
    }
    expect(filterWorkingMods(mods, filters).map((m) => m.codename)).toEqual([
      'only-bg1',
      'bg-pair',
      'all-ee',
    ])
  })

  it('filters by a singular co-author name', () => {
    const filters = {
      ...createDefaultModsTableFilters(),
      authors: ['Lava'],
    }
    expect(filterWorkingMods(mods, filters).map((m) => m.codename)).toEqual([
      'bg-pair',
    ])
  })
})
