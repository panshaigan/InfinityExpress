import {
  effectiveModFields,
  formatBytes,
  type DiskStatus,
  type WorkingMod,
} from './loadMods'

export type ModsSortKey =
  | 'name'
  | 'category'
  | 'url'
  | 'game'
  | 'release'
  | 'version'
  | 'size'
  | 'author'
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
}

export function createDefaultModsTableFilters(): ModsTableFilters {
  return {
    search: '',
    categories: [],
    games: [],
    authors: [],
    statuses: [],
    requiredCodenames: null,
  }
}

export function diskStatusLabel(status: DiskStatus): string {
  switch (status) {
    case 'not_present':
      return 'Not on disk'
    case 'present':
      return 'On disk'
    case 'update_available':
      return 'Update available'
    case 'busy':
      return 'Working…'
  }
}

export function collectModsFacetOptions(mods: readonly WorkingMod[]): {
  categories: string[]
  games: string[]
  authors: string[]
} {
  const categories = new Set<string>()
  const games = new Set<string>()
  const authors = new Set<string>()
  for (const mod of mods) {
    const eff = effectiveModFields(mod)
    if (eff.category) categories.add(eff.category)
    if (eff.game) games.add(eff.game)
    if (eff.author) authors.add(eff.author)
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  return {
    categories: [...categories].sort(collator.compare),
    games: [...games].sort(collator.compare),
    authors: [...authors].sort(collator.compare),
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
  const cat = filters.categories.length ? new Set(filters.categories) : null
  const games = filters.games.length ? new Set(filters.games) : null
  const authors = filters.authors.length ? new Set(filters.authors) : null
  const statuses = filters.statuses.length ? new Set(filters.statuses) : null

  return mods.filter((mod) => {
    if (required && !required.has(mod.codename)) return false
    if (!matchesSearch(mod, filters.search)) return false
    const eff = effectiveModFields(mod)
    if (cat && !cat.has(eff.category)) return false
    if (games && !games.has(eff.game)) return false
    if (authors && !authors.has(eff.author)) return false
    if (statuses && !statuses.has(mod.diskStatus)) return false
    return true
  })
}

function sortValue(mod: WorkingMod, key: ModsSortKey): string | number {
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
    case 'status':
      return mod.diskStatus
  }
}

export function sortWorkingMods(
  mods: readonly WorkingMod[],
  key: ModsSortKey,
  dir: ModsSortDir,
): WorkingMod[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...mods].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
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
): WorkingMod[] {
  return sortWorkingMods(filterWorkingMods(mods, filters), sortKey, sortDir)
}

export function formatModSize(sizeBytes: number | null): string {
  if (sizeBytes == null) return '—'
  return formatBytes(sizeBytes)
}

export function displayModName(mod: WorkingMod): string {
  const eff = effectiveModFields(mod)
  return eff.name || eff.codename
}
