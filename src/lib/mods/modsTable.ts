import {
  effectiveModFields,
  formatBytes,
  type DiskStatus,
  type ModComponentCatalogStats,
  type WorkingMod,
} from './loadMods'
import {
  modMatchesGameFilter,
  splitAuthorNames,
} from './modFieldParse'

export {
  GAME_FILTER_OPTIONS,
  GAME_TOKENS,
  joinGameTokens,
  modMatchesGameFilter,
  splitAuthorNames,
  splitGameTokens,
  withHtmlPreviewIfNeeded,
} from './modFieldParse'

export type ModsSortKey =
  | 'name'
  | 'category'
  | 'url'
  | 'game'
  | 'release'
  | 'version'
  | 'size'
  | 'author'
  | 'catalogComponents'
  | 'checkedComponents'
  | 'status'

export type ModsSortDir = 'asc' | 'desc'

export interface ModsTableFilters {
  search: string
  categories: string[]
  games: string[]
  authors: string[]
  statuses: DiskStatus[]
  /** When set, only these codenames are shown (journey mode). */
  requiredCodenames: string[] | null
  /** null = off; include/exclude use catalogComponentCodenames snapshot. */
  catalogComponentFilter: null | 'include' | 'exclude'
  /** Snapshot of in-catalog codenames when catalogComponentFilter is active. */
  catalogComponentCodenames: string[] | null
}

export function createDefaultModsTableFilters(): ModsTableFilters {
  return {
    search: '',
    categories: [],
    games: [],
    authors: [],
    statuses: [],
    requiredCodenames: null,
    catalogComponentFilter: null,
    catalogComponentCodenames: null,
  }
}

export function diskStatusLabel(status: DiskStatus): string {
  switch (status) {
    case 'not_present':
      return 'N/A'
    case 'present':
      return 'Available'
    case 'update_available':
      return 'Update'
    case 'busy':
      return 'Working…'
  }
}

export function collectModsFacetOptions(mods: readonly WorkingMod[]): {
  categories: string[]
  games: string[]
  authors: string[]
  types: string[]
  stabilities: string[]
} {
  const categories = new Set<string>()
  const games = new Set<string>()
  const authors = new Set<string>()
  const types = new Set<string>()
  const stabilities = new Set<string>()
  for (const mod of mods) {
    const eff = effectiveModFields(mod)
    if (eff.category) categories.add(eff.category)
    if (eff.game) games.add(eff.game)
    for (const name of splitAuthorNames(eff.author)) authors.add(name)
    if (eff.type) types.add(eff.type)
    if (eff.stability) stabilities.add(eff.stability)
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  return {
    categories: [...categories].sort(collator.compare),
    games: [...games].sort(collator.compare),
    authors: [...authors].sort(collator.compare),
    types: [...types].sort(collator.compare),
    stabilities: [...stabilities].sort(collator.compare),
  }
}

function matchesSearch(mod: WorkingMod, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  const eff = effectiveModFields(mod)
  const hay = [
    eff.name,
    eff.codename,
    eff.abbreviation,
    eff.author,
    eff.category,
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

export function filterWorkingMods(
  mods: readonly WorkingMod[],
  filters: ModsTableFilters,
): WorkingMod[] {
  const required =
    filters.requiredCodenames != null
      ? new Set(filters.requiredCodenames)
      : null
  const catalog =
    filters.catalogComponentCodenames != null &&
    filters.catalogComponentFilter != null
      ? new Set(filters.catalogComponentCodenames)
      : null
  const catalogFilter = filters.catalogComponentFilter
  const cat = filters.categories.length ? new Set(filters.categories) : null
  const games = filters.games.length ? new Set(filters.games) : null
  const authors = filters.authors.length ? new Set(filters.authors) : null
  const statuses = filters.statuses.length ? new Set(filters.statuses) : null

  return mods.filter((mod) => {
    if (required && !required.has(mod.codename)) return false
    if (
      catalog &&
      catalogFilter === 'include' &&
      !catalog.has(mod.codename)
    )
      return false
    if (catalog && catalogFilter === 'exclude' && catalog.has(mod.codename))
      return false
    if (!matchesSearch(mod, filters.search)) return false
    const eff = effectiveModFields(mod)
    if (cat && !cat.has(eff.category)) return false
    if (games) {
      const ok = [...games].some((g) => modMatchesGameFilter(eff.game, g))
      if (!ok) return false
    }
    if (authors) {
      const names = splitAuthorNames(eff.author)
      if (!names.some((name) => authors.has(name))) return false
    }
    if (statuses && !statuses.has(mod.diskStatus)) return false
    return true
  })
}

function sortValue(
  mod: WorkingMod,
  key: ModsSortKey,
  componentStats?: ReadonlyMap<string, ModComponentCatalogStats>,
): string | number {
  const eff = effectiveModFields(mod)
  switch (key) {
    case 'name':
      return (eff.name || eff.codename).toLowerCase()
    case 'category':
      return eff.category.toLowerCase()
    case 'url':
      return eff.url.toLowerCase()
    case 'game':
      return eff.game.toLowerCase()
    case 'release':
      return eff.release
    case 'version':
      return eff.version.toLowerCase()
    case 'size':
      return eff.sizeBytes ?? -1
    case 'author':
      return eff.author.toLowerCase()
    case 'catalogComponents':
      return componentStats?.get(mod.codename)?.catalogCount ?? -1
    case 'checkedComponents':
      return componentStats?.get(mod.codename)?.checkedCount ?? -1
    case 'status':
      return mod.diskStatus
  }
}

export function sortWorkingMods(
  mods: readonly WorkingMod[],
  key: ModsSortKey,
  dir: ModsSortDir,
  componentStats?: ReadonlyMap<string, ModComponentCatalogStats>,
): WorkingMod[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...mods].sort((a, b) => {
    const va = sortValue(a, key, componentStats)
    const vb = sortValue(b, key, componentStats)
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * mul
    }
    const sa = String(va)
    const sb = String(vb)
    return sa.localeCompare(sb) * mul
  })
}

export function filterAndSortWorkingMods(
  mods: readonly WorkingMod[],
  filters: ModsTableFilters,
  sortKey: ModsSortKey,
  sortDir: ModsSortDir,
  componentStats?: ReadonlyMap<string, ModComponentCatalogStats>,
): WorkingMod[] {
  return sortWorkingMods(
    filterWorkingMods(mods, filters),
    sortKey,
    sortDir,
    componentStats,
  )
}

export function formatModSize(sizeBytes: number | null): string {
  if (sizeBytes == null) return '—'
  return formatBytes(sizeBytes)
}

export function displayModName(mod: WorkingMod): string {
  const eff = effectiveModFields(mod)
  return eff.name || eff.codename
}

/** First author for narrow table cells; full string on hover via title. */
export function primaryAuthorLabel(author: string): {
  display: string
  title: string | undefined
} {
  const full = author.trim()
  if (!full) return { display: '—', title: undefined }
  const parts = splitAuthorNames(full)
  const primary = parts[0] ?? full
  if (parts.length <= 1) {
    return { display: primary, title: full }
  }
  return { display: `${primary}…`, title: full }
}
